# GitHub deployment

People with **write** access to this repository can deploy Coffee Run without
receiving a VPS login or a private SSH key. Push or merge to `main`, or open
**Actions > Deploy Coffee Run > Run workflow** and select `main`.
Read-only access does not grant deployment access. Other branches and pull
requests run the checks without deploying.

The workflow installs dependencies, runs tests, builds the client, and streams
a release archive over SSH. The VPS installs production dependencies, switches
the active release, restarts the game, and checks `/api/health`. A failed restart
or health check restores the previous release. Restarting the game resets its
in-memory rounds and player balances.

## One-time VPS setup

An administrator must create two dedicated accounts:

- `coffee-run`: a system account with no interactive login, used by the service.
- `coffee-deploy`: a deployment account with home `/var/lib/coffee-deploy`.

Create `/srv/coffee-run/releases`, owned by `coffee-deploy`, with mode `755`.
The deployment account must also own `/srv/coffee-run` to switch its `current`
symlink. The runtime account needs read access to releases, not write access.

Install `deploy/receive.sh` as `/usr/local/libexec/coffee-run-receive`, owned by
root with mode `755`. Install `deploy/coffee-run.service` as
`/etc/systemd/system/coffee-run.service`. The service expects Node.js at
`/usr/bin/node`, npm, curl, tar, and flock.

Create `/etc/coffee-run/coffee-run.env`, owned by root with mode `600`:

```env
PUBLIC_URL=https://coffee.colvenalabs.com
```

`OPENAI_API_KEY` and `OPENAI_MODEL` can optionally be added to that file.
Keep application secrets on the VPS, outside the repository and release archive.

Add only these commands to `/etc/sudoers.d/coffee-deploy` and validate with
`visudo -cf /etc/sudoers.d/coffee-deploy`:

```sudoers
coffee-deploy ALL=(root) NOPASSWD: /usr/bin/systemctl reset-failed coffee-run.service, /usr/bin/systemctl restart coffee-run.service, /usr/bin/systemctl stop coffee-run.service
```

Generate a dedicated Ed25519 deployment key. Put its public key in
`/var/lib/coffee-deploy/.ssh/authorized_keys`, prefixed with:

```text
restrict,command="/usr/local/libexec/coffee-run-receive" ssh-ed25519 PUBLIC_KEY coffee-run-github-actions
```

The forced command accepts release archives only. The key cannot open a shell,
forward ports, modify system services, or restart Sidequest. Make `.ssh` mode
`700` and `authorized_keys` mode `600`, owned by `coffee-deploy`.

Run `systemctl daemon-reload` and `systemctl enable coffee-run.service`.
The first successful deployment starts the service.

## GitHub configuration

In **Settings > Secrets and variables > Actions**, configure:

| Type | Name | Value |
| --- | --- | --- |
| Secret | `COFFEE_RUN_SSH_KEY` | The dedicated deployment private key |
| Secret | `COFFEE_RUN_KNOWN_HOSTS` | The verified SSH host key, prefixed with the host address |
| Variable | `COFFEE_RUN_HOST` | `192.99.246.144` |

Obtain the server's SSH public host key over an existing trusted administrator
connection. Keep strict host key checking enabled in the workflow.

The workflow and application source, including `package-lock.json`, must be
committed and pushed to GitHub. The manual launch button is available when
the workflow exists on the default branch.

## Public HTTPS access

Create a DNS A record for `coffee.colvenalabs.com` pointing to `192.99.246.144`.
After choosing the actual hostname, set `PUBLIC_URL` accordingly and add a
separate site to `/etc/caddy/Caddyfile`:

```caddyfile
coffee.colvenalabs.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:5173
}
```

Validate the complete Caddy configuration before reloading it. Preserve the
existing `play.colvenalabs.com` site. Ports 80 and 443 are already allowed on
the VPS; the game's port 5173 does not need to be opened to the Internet.

Check the public `/api/health` endpoint and a real WebSocket connection after
the first deployment. This build has one shared room and unauthenticated host
controls; its intended audience is a trusted hackathon group.
