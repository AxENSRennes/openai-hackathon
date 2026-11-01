# Coffee Run implementation status

## Release target

The current release combines the rebuilt office arena, authored employee assets and animations, fullscreen HUD, camera and audio controls, phone betting, direct keyboard control, and explicit agent command execution. Release changes are integrated into `main`, which triggers the GitHub Actions deployment workflow for `coffee-run.service` on port 5173. Development runs separately on port 5174. Other VPS applications must remain untouched.

## Agent behavior

Each runner waits for a human or agent controller. The game executes bounded movement and explicit target interactions; it does not choose goals, paths, avoidance, pickup, pushing, delivery, or standing up. Controllers can connect externally over HTTP or use Responses or Decisions model calls. Written and recorded voice instructions update the selected runner's instruction and invalidate pending commands from the previous version. Model errors leave the runner waiting without a fallback bot.

## Validation on 2026-11-01

- All 46 Node tests pass, covering real Rapier physics, ownership, explicit commands, HTTP controllers, model transport fixtures, instruction versioning, manual controls, and betting settlement.
- The Vite production build succeeds.
- The standalone contrast checker passes its nine reference cases. The instruction skills have been removed; contrast tooling and licenses remain.
- An external scripted controller completed a wall-clock HTTP round with 100% coffee remaining, using 64 explicit commands in approximately 37 seconds. No hidden game navigation or live model API was involved.
- Browser review passed for Responses and Decisions controller selection, instruction changes, synthetic microphone submission, transcription failure feedback, stopping, Escape/focus restoration, mobile overflow, and missing-key states. Reports are under ignored `test-results/agent/`.

## Remaining limits

Real model decision quality, API latency, and speech recognition have not been tested against OpenAI. The automated transport and microphone tests use fixtures. The demo retains trusted-audience host controls and in-memory wagers; restarting resets rounds and balances. The broader commercial visual quality target in `QUALITY_BAR.md` has not been fully certified by these functional checks.

Remotion dependencies and rendering/review refinements are preserved as separate commits alongside the agent work. No credentials, local agent tokens, generated build output, or browser reports belong in Git.
