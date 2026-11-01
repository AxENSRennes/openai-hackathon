#!/usr/bin/env bash
set -euo pipefail
umask 022

root=/srv/coffee-run
exec 9>"$root/.deploy.lock"
flock -w 300 9

release=$(mktemp -d "$root/releases/release.XXXXXXXX")
chmod 755 "$release"
tar -xzf - -C "$release" --no-same-owner --no-same-permissions
cd "$release"
test -f dist/index.html
test -f server/index.js
test -f REVISION
npm ci --omit=dev --ignore-scripts --no-audit --no-fund

previous=$(readlink "$root/current" || true)
activated=false
healthy=false
restart_service() {
  sudo -n /usr/bin/systemctl reset-failed coffee-run.service
  sudo -n /usr/bin/systemctl restart coffee-run.service
}

wait_for_health() {
  for _ in {1..30}; do
    if curl --fail --silent --max-time 2 http://127.0.0.1:5173/api/health |
      node --input-type=module -e 'let body=""; for await (const part of process.stdin) body+=part; try { if (JSON.parse(body).ok !== true) process.exit(1); } catch { process.exit(1); }'; then
      return 0
    fi
    sleep 1
  done
  return 1
}

finish() {
  status=$?
  if "$activated" && ! "$healthy"; then
    echo 'Deployment failed; restoring the previous release.' >&2
    if [[ -n "$previous" ]]; then
      ln -sfn "$previous" "$root/current.next"
      mv -Tf "$root/current.next" "$root/current"
      if restart_service && wait_for_health; then
        echo 'Previous release restored and healthy.'
      else
        echo 'Previous release could not be restored; administrator intervention is required.' >&2
      fi
    else
      rm -f "$root/current"
      sudo -n /usr/bin/systemctl stop coffee-run.service || true
    fi
  fi
  exit "$status"
}
trap finish EXIT
trap 'exit 1' HUP INT TERM

ln -sfn "$release" "$root/current.next"
mv -Tf "$root/current.next" "$root/current"
activated=true
restart_service
if wait_for_health; then
  healthy=true
  printf 'Deployed Coffee Run revision %s\n' "$(cat REVISION)"
  exit 0
fi
echo 'Coffee Run did not pass its health check.' >&2
exit 1
