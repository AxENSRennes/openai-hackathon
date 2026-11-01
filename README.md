# Coffee Run

Six agent-controlled colleagues compete to deliver one coffee to one waiting customer with at least **55% remaining**. Agents explicitly choose every movement and interaction. The kitchen, equipment, routes, furniture, and persistent mugs are shared. Spectators join on their phones and bet virtual coins.

The rebuild targets the commercial indie vertical slice defined in [QUALITY_BAR.md](QUALITY_BAR.md). Feature presence alone does not establish that quality. Current implementation and remaining gaps are recorded in [PROGRESS.md](PROGRESS.md).

## Development on the VPS

Requires Node.js 22.12 or later. The published service owns port 5173. Run development separately:

```sh
npm ci
PORT=5174 PUBLIC_URL=http://YOUR_VPS_ADDRESS:5174 npm run dev
```

Open `http://localhost:5174`. Use **Join & bet** to display the phone QR code. Set `PUBLIC_URL` to the development origin reachable by spectators; `/api/info` reports the generated join URL. Do not point development phones at the production origin.

Rounds cycle through betting, racing, and results. **Start run** closes betting and starts the race. The menu exposes overview, automatic framing, optional following, zoom, sound, fullscreen, and a round reset. `/join` loads the betting interface without the Three.js renderer.

## Foundations

- `shared/level.js` defines the single arena, static collider geometry, stations, circulation paths, and six identities.
- `shared/physics.js` initializes Rapier; `shared/simulation.js` executes bounded physical commands and owns persistent cup ownership, unattended brewing, collisions, and delivery. It never chooses a runner's destination or action.
- `client/scene.js` loads authored glTF assets, interpolates network snapshots, and coordinates animation, physical mugs, local indicators, and effects. `client/camera.js` and `client/audio.js` handle framing and event sound.
- `scripts/build-assets.py` authors the original models and animation clips in Blender. Exported GLBs are committed in `public/assets`.
- `server/betting.js` maintains virtual wallets and pari-mutuel settlement. Socket.IO distributes authoritative snapshots and wager results.

The legacy simulation, procedural renderer, separate delivery desks, and website layout have been replaced. The prototype exists only in Git history on `archive/coffee-run-prototype-20261101`; it is not a second runtime or an asset fallback.

## Assets

```sh
/usr/bin/blender --background --python scripts/build-assets.py
/usr/bin/blender --background --python scripts/build-assets.py -- --characters-only
/usr/bin/blender --background --python scripts/build-assets.py -- --environment-only
```

Blender's glTF exporter requires NumPy. On Debian installations without that Python module, install it in Blender's Python environment or the user's Python site packages. The script reads arena geometry from `shared/level.js` and exports meshes without scene cameras or lights.

## Agent controllers

Runners wait until a human or agent supplies commands. There is no automatic navigation, avoidance, pickup, shoving, delivery, standing up, or fallback bot. Each runner can use an external coding agent over HTTP, a Responses API agent, or the Decisions API. Model controllers choose their own physical commands separately for each runner.

Open **Agent instructions** beside the camera controls to select Responses or Decisions, send or replace a written instruction, record a spoken instruction, or stop the agent. Voice records a short utterance, transcribes it server-side, and submits it as the agent's new instruction. It does not require a continuous Realtime session. Model and voice controls require `OPENAI_API_KEY`; without one, external agents and direct keyboard control still work. This change does not provision API credentials; model and voice integration tests use simulated responses.

For an external agent, use `scripts/agent-client.mjs` or the HTTP API. See [agent control and testing](docs/agent-control.md) for commands, context, ownership, versioning, and reproducible tests.

## Betting

Guests receive 1,000 imaginary coins. A wager can be replaced before the race. Payouts divide the actual pool among winning stakes, using integer amounts. Draws, aborted rounds, and unbacked winners refund stakes. Wallets and rounds are in server memory; a restart resets them. Guest identity is remembered in browser local storage.

## Validation and deployment

```sh
npm test
npm run build
```

Tests cover actual Rapier collisions, command expiry, explicit actions, exclusive ownership, unattended preparation, breakage, legal delivery, draw handling, and fixed-step determinism. HTTP tests exercise external control and both model transports. Model responses and speech transcription are simulated: real model performance and live speech recognition remain unverified without an API key. Browser scenarios inspect instruction changes, controller selection, recording submission, error feedback, keyboard focus, and mobile layout.

See [deployment operations](deploy/README.md). Push unfinished work only to `rebuild/level4-vps`; `main` triggers production deployment. The running release is `/srv/coffee-run/current`, managed by `coffee-run.service`. Preserve it and unrelated VPS applications.

## Credits

Original models, environment, animations, simulation, and interface authored for this project with Codex and Blender. Runtime libraries include Rapier, Three.js, React, Vite, Express, Socket.IO, and QRCode. Fonts: Barlow Condensed and DM Sans. Overcooked! 2 is a quality reference; its artwork is not shipped in the game.
