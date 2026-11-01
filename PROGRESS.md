# Coffee Run implementation status

## Seven-mascot integration

The working branch `codex/integrate-seven-mascots` replaces the six employees
with Astra, Opus, Grokbot, Argon, DeepSeek, Kimi, and Mistral from PR #3. Their
original meshes, palettes, names, and seven procedural poses are preserved.
Seven physical runners, spawn positions, portraits, selection, direct control,
agent controllers, and phone wagering use the same identity catalog.

The renderer combines the original run and carry poses, adds reaching, grounded
falls and recovery, responds to authoritative cup slosh, and uses the original
victory pose after delivery. Decorative mascot cups stay hidden; a separate
persistent takeaway cup follows the hand socket. Fixed mesh parts are merged by
material while preserving the original triangle count and vertex bounds. The
software renderer limits rendering to 24 FPS to leave time for control input.
Unused employee GLBs, old portraits, and their Blender generation code are retired;
the office environment and chairs retain their existing Blender workflow.

Validation on 2026-11-01: all 51 Node tests pass and the Vite production build
succeeds. Browser checks cover all seven selections and control claims, six
viewport widths from 320 to 1440 pixels, a confirmed Mistral phone wager, and nine
pose fixtures rendered for every mascot. The renderer reports no page errors or
failed asset requests. A wall-clock external HTTP controller completed pickup,
unattended brewing, recovery, and delivery in 36.23 seconds using 63 explicit
commands, retaining 100% coffee. A real browser keyboard round also completed
pickup, unattended brewing, recovery, and delivery in 59.08 seconds. That keyboard
check renders real-state frames at checkpoints to isolate keyboard mechanics from
software-GPU throughput; the separate nine-pose review runs continuous rendering.
Reports and captures are under ignored
`test-results/mascots/`, `test-results/controls/`, and `test-results/agent/`.
Pose fixtures assess rendering;
they do not establish autonomous decision quality or real GPU performance.
These changes have not been deployed.

## Release target

The baseline release combines the rebuilt office arena, authored employee assets and animations, fullscreen HUD, camera and audio controls, phone betting, direct keyboard control, and explicit agent command execution. Release changes are integrated into `main`, which triggers the GitHub Actions deployment workflow for `coffee-run.service` on port 5173. Development runs separately on port 5174. Other VPS applications must remain untouched.

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

## Historical rebuild validation before direct agent control

The following notes describe the earlier rebuild snapshot and its validation. Autonomous behavior, test counts, branch state, and deployment statements in these notes are historical; the current command contract and release target are documented above.

### Integrated rebuild and playable commands

The user's visual corrections were applied: organic rounded employee proportions, eight authored action clips, portraits rendered from those models, original embedded base-color/roughness/normal textures, continuous building floor instead of a floating platform, and a denser shared arena. The environment's geometry was reduced from 174,340 to 109,868 triangles while retaining 26 static material groups. The three usable crossings and every spawn/resource connection were tested against the same level definition used by Blender.

The user clarified that every employee must be playable so future API decisions can control movement and interactions. Direct control now uses WASD/arrows, E contextual action, Q drop, Space shove, and Shift steady walking. Touch inputs use the same server channel. Controller ownership is exclusive; stale input stops; disconnect releases control. The renderer places E on the actual actionable object. Autonomous preparation, worktop staging, recovery, theft, route changes, and delivery remain built on persistent mug IDs.

### Executed checks for the rebuild commits

- `npm test`: 32 tests pass, including 20 seeded complete races, ownership/collision invariants, real-server controller exclusivity, disconnect, and shutdown.
- Fresh `npm ci` in the isolated validation worktree succeeds. Its production build succeeds with the committed package manifest/lock, without the unrelated Remotion additions.
- Real WebGL browser competition completed: Bolt delivered 92.88% in 21.68 seconds; a second observed round ended with Clawd delivering 92.83% in 23.32 seconds. The recorded sequences show preparation, unattended possession changes, route changes, dropped mugs, spills, recovery, and final placement at the one desk. No browser script errors or missing asset responses were recorded.
- Real browser keyboard round completed on port 5175: Pip took mug `cup-5-1`, started brewing, left it unattended, took the same mug again, and served 100% coffee at 77.85 seconds. Five rivals were deliberately held idle for this isolated manual scenario; it is not evidence of a competitive manual victory. The separate unscripted rounds above cover competition.
- Phone betting previously verified: fresh wallet 1,000, Pip stake 50 gives 950, replacement Bolt stake 100 gives 900, reload retains wallet and wager. `/join` downloads neither the scene module nor Three.js. Phone widths 320/390/768 and modal keyboard/focus behavior were checked.

Browser evidence is under ignored `test-results/browser/`; isolated manual evidence is at `/tmp/coffee-run-level4-validation/test-results/controls/`. Review drivers are committed as `scripts/review-browser.mjs` and `scripts/review-controls.mjs` and explicitly reject production port 5173.

### Performance and quality limits

The VPS has software WebGL. Full PBR with software shadows measured roughly 1,583 ms median per frame in the initial run. After a software-only reduced tier (textured Lambert materials, no multisampling or dynamic shadows, half-resolution canvas) and geometry optimization, the observed median was about 200 ms per frame. This makes functional sequence review possible; **it does not meet commercial fluidity** and does not establish native GPU performance. Hardware-accelerated browsers retain full PBR maps and 2048-pixel shadows. `?quality=full` permits a full-material still inspection on software hardware without claiming real-time performance.

The low-resolution software capture must not be presented as a final native-quality screenshot. Remaining visible quality work includes target-aware hand contact/placement, stronger impact anticipation, normal-camera item readability, and richer authored lighting/material finish. Level 4 is not achieved merely because the integrated game and tests work.

### Concurrent work preserved

Other chats changed the workspace during verification: Remotion dependencies, removal of antislop instruction skills, and a new explicit per-action API/voice controller. Their work was preserved. It changes the autonomy contract and restarted port 5174 during manual tests, so rebuild verification moved to an isolated detached worktree at `/tmp/coffee-run-level4-validation` on port 5175. No migration or production deployment was performed. The rebuild commits and draft review describe their own tested snapshot; they do not claim validation of the other chats' uncommitted changes. Rebuild commits exclude those unrelated modifications.
