# Coffee Run: OVH Development Handoff

## User instruction

Stop local development, migrate the entire development workspace to the OVH development VPS where the game is published, and launch an agent there to continue the work. Continue implementation on the VPS rather than the Mac. User-facing conversation is in French; all code, comments, and artifacts must be English.

## Accepted goal

Rebuild the game from scratch on solid foundations at **Level 4: a polished commercial indie vertical slice**, with normal Overcooked! 2 gameplay as the benchmark for art direction, movement, animation, contextual interactions, integrated HUD, camera, and feedback. Read `QUALITY_BAR.md` and `DESIGN.md` completely. A functioning prototype, an attractive still, or installing a physics package does not establish that quality.

The user explicitly authorized the rebuild before requesting this migration. Continue autonomously to a genuinely working, reviewable result. Do not stop after a plan or scaffolding.

## Fixed game rules

- One human waits for one coffee at one delivery desk.
- Seven agents compete to serve that human first.
- One coffee type; no recipe-correctness minigame.
- First delivery with at least 55% remaining wins.
- Shared kitchen and office; actual persistent cups can be held, placed, dropped, recovered, stolen when unattended, spilled, and broken.
- An opponent must make a held cup drop before stealing it.
- Preparation can continue unattended, creating useful choices about guarding, stealing, or doing another action.
- Falls and failed cups are recoverable. Agents can return to prepare another coffee. No elimination after a fall.
- Spectators join by QR and bet virtual coins. Advice, audience sabotage, and voice are V2.
- An expired race with no valid delivery draws and refunds stakes.

## Current implementation and preservation

The published prototype is in commit `5ef93b0`. It is preserved on branch `archive/coffee-run-prototype-20261101`. It has the wrong final objective (separate desks), a website-style interface, procedural primitive characters, and simplified physics. It is useful as a reference for tested betting and deployment, not as the final game foundation.

Commit `b4fbfaf` records the approved quality documents and removal of mandatory Anti Slop instructions. The local skills remain available as guides; do not reintroduce their blocking mode/approval questions into AGENTS.md. AGENTS.md requires English code/comments/artifacts only.

The only new rebuild implementation written before migration is `shared/level.js`, defining the intended arena geometry and runner identities. Rapier `@dimforge/rapier3d-compat@0.19.3` was installed and added to package.json/package-lock.json. No renderer, simulation, HUD, Blender asset generation, or corresponding tests were rewritten yet. Three local workers confirmed they wrote no partial files and launched no processes.

## Selected technical foundations

Keep a modular Three.js rendering layer; adding React Three Fiber alone would not supply the missing game systems. Use actual Rapier3D physics, authored Blender/glTF assets and animation clips, a dedicated camera director, persistent object ownership and contextual actions, and fixed-step authoritative simulation. React supplies the full-screen game HUD and phone betting UI. Existing Express/Socket.IO/betting infrastructure can be retained where sound.

### Physics and simulation

Create `shared/physics.js`, replace `shared/simulation.js`, and rewrite `tests/simulation.test.js`.

- Export `initializePhysics()` and await it once before `new CoffeeSimulation({round})`.
- Preserve `step(dtSeconds)`, `snapshot()`, `finish()` (draw), `dispose()`, and `setStrategy(id,{pace:'careful'|'fast',route:'direct'|'detour',aggression:0..1})`.
- Re-export RUNNERS from `shared/level.js` for existing server imports.
- Use real physics for loose cups and chairs, gravity, collisions, impulses, and controlled character movement. Avoid fake numeric coffee theft.
- Persistent cup snapshots: `id`, `holderId|null`, `x,y,z`, rotation quaternion, `coffee:0..100`, `broken`, `stationId|null`.
- Agent snapshots retain `id,name,color,trait,x,z,y,heading,coffee,carrying,state,moving,fallen,progress`, adding `action` (`idle/run/carry/interact/push/fall/recover`), `cupId`, and `decision`.
- Include `cups`, `stations` (id/busy/cupId/progress/ready plus geometry), `props` (chairs), `gate`, `spills`, and newest-first `events` (`id,text,type,actorId,time`), `winner`, `elapsed`, `finished`.
- Brew stations accept a placed mug, fill it over the station duration, and keep it available if the agent leaves. Agents guard, exploit opportunities, recover, refill, and adapt routes rather than follow a single uninterruptible script.
- Match shared LEVEL geometry. The timed gate creates meaningful rerouting; avoid deadlocks and permanent congestion.
- Test ownership, unattended brewing, drop/recovery, collision bounds, valid delivery, draw/refunds, and varied seeded races. No invented success metrics.

### Authored assets

Create a reproducible Blender background script at `scripts/build-assets.py` and export:

- `public/assets/character.glb`: feet at origin, forward +Z, height about 1.8; recolorable material `Uniform`; right-hand attachment node `HandSocket`; intentional clips `Idle`, `Run`, `Carry`, `Interact`, `Push`, `Fall`, `Recover`. Use a real rig or a coherent animated hierarchy, with anticipation and follow-through.
- `mug.glb`: base at origin, height about .34, hollow glazed cup and handle; liquid material/node `Coffee`.
- `chair.glb`: approximately .8 wide, 1.1 high, caster wheels.
- `environment.glb`: match `shared/level.js` exactly. Include the single seated waiting human, authored coffee equipment, cabinet details, shared surfaces, plants, posters, and coherent warm sage/cream/terracotta materials. Do not bake in dynamic chairs or the animated gate. Export meshes and animation without scene cameras/lights.

Blender was installed on the Mac; the VPS needs its own headless Blender installation or a suitable asset-authoring alternative. Do not reuse Mac application paths on Linux.

### Renderer and camera

Replace `client/scene.js` with modular asset loading, AnimationMixer action transitions, persistent mug transforms and ownership, interpolated snapshots, contact shadows, local brewing/coffee indicators, particles, and a dedicated camera director. Keep the normal arena readable. Implement meaningful smooth zoom/dezoom, phase framing, overview and optional following; do not constantly hide competitors to chase incidents.

Proposed public API: `new CoffeeScene(container)`, `update(state)`, `setCamera('auto'|'overview'|'track')`, `focusRunner(id)`, `setZoom(value)`, `dispose()`. Emit `scene-ready` and `runnerselect` (`detail.id`) DOM events.

### Full-screen HUD and phone betting

Replace `client/App.jsx`, `client/styles.css`, and `client/main.jsx`. The game fills the viewport, with chunky readable game HUD, competitor indicators, compact pool information, large clock, intentional start/result staging, QR/menu/audio/fullscreen controls and camera/zoom controls. No editorial website hero, large persistent betting sidebar, or feed competing with the arena. Do not copy recipe tickets for nonexistent recipes.

Phone `/join` remains a focused, responsive betting interface and must not download the 3D scene unnecessarily. Retain reconnect handling, actual pool percentages, wallet, replacement wagers, QR code, accessibility, and functioning sound/camera controls.

Existing socket contract: `state` snapshots; `join {playerId,name}` -> `player`; `bet {runnerId,amount}` with ack; `host:start` and `host:reset` with callback only. Preserve betting correctness tests. Fix potential React conditional-button reuse/default-submit issues when changing wagers.

## Server and operational work

- Existing `server/betting.js` has tested virtual-wallet and pari-mutuel logic. Preserve it unless integration requires changes.
- `server/index.js` currently starts the old synchronous simulation. Add async Rapier initialization, disposal on round change, and a fixed-step accumulator. Keep network snapshots separate from the render loop.
- `server/planner.js` optionally calls OpenAI for tactics; absent a key, the mode must honestly say local agents. Update its instructions from separate desks to the shared human and include new object/station state. Never expose keys to browsers or logs.
- Do not run multiple Vite instances sharing `node_modules/.vite`: this previously caused duplicate React hook errors. `npm run dev` watches server/shared only, avoiding an infinite restart loop caused by Vite temp imports.
- Main verification commands are `npm test` and `npm run build`; browser-review full rounds, HUD, camera, object interactions, phones, bets, and settlement. Do not report Level 4 achieved unless the comparative quality bar is actually met.

## OVH and deployment

- Host alias `dev-vps`, user `dev`, address `192.99.246.144`.
- Development workspace: `/home/dev/Projects/openai-hackathon`.
- Public game: `https://coffee.colvenalabs.com`.
- Live release is `/srv/coffee-run/current`, served by `coffee-run.service` on port 5173 behind Caddy. This is a release directory, not the development workspace.
- Use a different port such as 5174 for development. Preserve the live site and the separate `play.colvenalabs.com` service while rebuilding.
- Existing GitHub repository: `https://github.com/AxENSRennes/openai-hackathon` (private). Main pushes trigger the deployment workflow. Keep unfinished work on the rebuild branch; never accidentally push a partial rewrite to main.
- Read `deploy/README.md` and preserve the existing release/rollback deployment path. Do not print credentials, copy environment files into Git, alter unrelated VPS applications, or replace production with an unfinished rebuild.
- Codex CLI and GitHub CLI are already authenticated on the VPS. Follow the destination host's configured model; no specific model was requested.

## Continuation behavior

The user wants a remote agent to continue the actual rebuild, not just document plans. Work on the VPS, use parallel workers where useful, keep a progress log, make reviewable commits on the rebuild branch, finish the integrated game and required checks, and report honest remaining gaps. The original agent on the Mac must not continue editing after transfer.
