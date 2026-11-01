# Coffee Run

Seven mascots. One customer. Deliver the coffee before someone ruins it.

**Team: Coffee Run** · Built for the DevDay Exchange Community Hackathon in London, 1 November 2026.

[Open the live game](https://coffee.colvenalabs.com/) · [Join on your phone](https://coffee.colvenalabs.com/join) · [Watch the 42-second demo](https://youtu.be/kAH-2jfMVwI)

Coffee Run is a browser-based 3D party game for people watching together. Seven agent-controlled mascots share an office kitchen and compete to deliver a coffee to one waiting customer with **at least 55% remaining**. They must collect a cup, brew it, and get it across the room while navigating furniture, other runners, spills, and a moving gate. Spectators pick a favorite and bet imaginary coins from their phones.

The idea is to turn agent decisions into something an audience can watch, influence, and play: a small physical task with a visible outcome, shared resources, and plenty of opportunities to get it wrong.

## Try it

1. Open [coffee.colvenalabs.com](https://coffee.colvenalabs.com/) on a desktop browser and let the office load.
2. Select a mascot along the bottom. Choose **Control** to play it yourself, or open **Agent instructions** to give a model a written or recorded instruction when server-side API credentials are configured.
3. Choose **Start run**, or wait for the betting countdown. Collect a cup from the kitchen rack, start brewing at a coffee machine, take the finished cup, and serve the customer. The first delivery with at least 55% coffee wins.
4. On a second device, scan **Join & bet** or open [the phone betting slip](https://coffee.colvenalabs.com/join). You start with **1,000 virtual coins**. Choose a mascot and confirm a wager before betting closes.
5. Watch the delivery result and payout. The next round starts automatically.

No account or player API key is needed for manual play or phone betting. Runners wait for a human or agent controller; starting a round alone does not make them race. A new round releases controller assignments, so select a controller again when needed. Microphone instructions require HTTPS or localhost and microphone permission.

| Keyboard | Action |
| --- | --- |
| WASD or arrow keys | Move the controlled mascot |
| Shift | Move carefully to protect the coffee |
| E | Perform the nearby interaction shown on screen: pick up, brew, recover, or serve |
| Q | Drop the cup |
| Space | Shove |

Touch controls appear while controlling a mascot. Camera controls let spectators follow a selected runner or view the whole office.

## What we built

- **A shared physical arena:** a Three.js office with Rapier collisions, two coffee machines, movable chairs, a timed gate, and persistent cups that can be dropped, recovered, spilled, or broken. Brewing continues while a cup is unattended; another runner can take it.
- **Seven original playable mascots:** Astra, Opus, Grokbot, Argon, DeepSeek, Kimi, and Mistral, with distinct designs and running, carrying, shoving, falling, recovery, and victory animations.
- **Direct agent control:** each runner can receive explicit commands from an external coding agent over HTTP or from the integrated Responses and Decisions controllers. Observations include the map, physical state, available interactions, and previous command results. The simulation enforces the rules; controllers choose their actions.
- **Human instructions:** change an agent's goal with text or a short recorded voice instruction. The server transcribes the recording and sends the resulting text as the new instruction, cancelling commands from the previous instruction.
- **A live audience experience:** synchronized desktop viewing, QR joining, a lightweight phone betting interface, replaceable wagers before the race, pool-based payouts, and refunds for draws or unbacked winners. All coins are imaginary.
- **Delivery infrastructure:** a Node.js server, WebSocket updates, an HTTPS deployment, progressive scene loading, and compressed assets.

The mascot names are character identities, not a claim that seven different providers' models are connected. Each mascot's controller is configured separately.

## How Codex helped

We used Codex throughout the build to implement and revise the React interface, Three.js scene and procedural characters, Rapier simulation, agent command API, phone betting, and automated checks.

Two concrete examples:

- **Making delivery verifiable:** Codex helped build an external controller and tests that explicitly collect a cup, start brewing, recover the cup, and deliver it through the same command interface an agent uses. The recorded HTTP-controller check completed a round with 100% coffee remaining. This verified the game loop with scripted commands; it was not a live model competition.
- **Fixing slow scene loading:** Codex helped extract shared textures, precompress assets, add visible loading progress and retry feedback, and check the result in a throttled browser. The implementation and recorded checks are documented in [PROGRESS.md](PROGRESS.md).

## Run locally

Requires **Node.js 22.12 or later** and npm. A browser with WebGL support is needed for the 3D view.

```sh
npm ci
npm run dev
```

Open **http://localhost:5173**. For phones on the same network, use the network address printed by the server. Set `PUBLIC_URL` in `.env` to the origin reachable by your audience so the QR code uses the right address. Venue Wi-Fi may isolate devices; a shared hotspot can help.

To run alongside an existing service on port 5173:

```sh
PORT=5174 npm run dev
```

### Optional model and voice control

Copy `.env.example` to `.env` and set `OPENAI_API_KEY` on the server. Optional settings are `OPENAI_MODEL`, `OPENAI_DECISIONS_MODEL`, and `OPENAI_TRANSCRIPTION_MODEL`; the example file lists the current defaults. Credentials stay on the server and must not be committed.

Open **Agent instructions** to choose a controller and enter an instruction. Recorded voice instructions use short audio transcription, rather than a continuous voice conversation. Without a server API key, manual controls and external HTTP controllers remain available.

See [the agent control guide](docs/agent-control.md) for the HTTP contract, command examples, controller ownership, and reproducible scenarios.

### Production

```sh
npm ci
npm run build
npm start
```

The production server defaults to port 5173. Use an HTTPS reverse proxy with WebSocket support and set `PUBLIC_URL` to your public origin. See [deployment instructions](deploy/README.md).

## Validation and current limits

```sh
npm test
npm run build
```

The suite covers physical commands, cup ownership, brewing and delivery, controller ownership and instruction changes, virtual-coin settlement, asset compression, and trailer replay. Recorded browser reviews cover manual delivery, phone wagers, loading recovery, and the agent instruction interface. Details are in [PROGRESS.md](PROGRESS.md).

Model transport and speech tests use simulated API responses. Live model decision quality, API latency, and speech recognition are not established by those tests. Controller availability in the hosted game depends on its server configuration.

This hackathon build has one shared room and trusted-audience host controls. Rounds and wallets are held in server memory and reset on restart. Cups are finite within each round. There are no persistent accounts or real-money transactions.

## Credits and assets

The game code, office environment, procedural character models, animations, simulation, and interface were authored for this project with Codex, Three.js, and Blender. The seven mascots were integrated from [our Coffee Royale character work in PR #3](https://github.com/AxENSRennes/openai-hackathon/pull/3); see [asset sources and reproduction](public/assets/README.md). They are original parody characters, not official brand mascots. Overcooked! 2 informed the visual direction; its assets are not included.

Existing libraries and tools include React, Three.js, Rapier, Vite, Express, Socket.IO, QRCode, Blender, and Remotion. Fonts are Barlow Condensed and DM Sans from Google Fonts; bundled trailer fonts include their license notices.

The optional [42-second trailer pipeline](trailer/README.md) uses directed gameplay takes, supplied music, and scratch synthetic narration. These takes show staged physical commands rather than live model decisions. Music provenance is recorded in [video assets](video/assets/README.md); narration sources and license restrictions are documented in the trailer guide.
