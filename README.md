# Coffee Run

Six agents. One coffee machine. Questionable coordination.

A browser-based 3D office race with a shared live broadcast and phone betting. Employees collect a cup, queue for coffee, push and steal, slip on spills, and try to deliver a cup at least **55% full** to their own desk. The first valid delivery wins.

## Run

Requires Node.js 22.12 or later.

```sh
npm install
npm run dev
```

Open **http://localhost:5173**. Use **Join on your phone** to display the QR code. Phones must be able to reach the host on the same network. Venue Wi-Fi may isolate devices; a shared hotspot works when that happens. The console prints the LAN address, and `/api/info` reports the join URL.

Rounds cycle through betting, racing, and results automatically. **Start race** begins a round immediately. Select a competitor and switch the camera to follow them. The sound button enables short synthesized event sounds. The phone route is `/join`.

## Agent controllers

The game works immediately with deterministic local autonomous agents. The controller mode is shown below the arena. These agents navigate around furniture, queue, choose routes, push opponents, steal coffee, recover from falls, and refill after spills.

To use model-directed tactics, copy `.env.example` to `.env` and set `OPENAI_API_KEY`. The server requests pace, route, and aggression decisions for all six competitors every five simulation seconds. The local simulation remains authoritative for movement and physics. `OPENAI_MODEL` defaults to `gpt-4.1-mini`. API failures fall back to local decisions; the key stays on the server. Live API execution requires your own key and was not exercised without one.

## Betting

Guests start with 1,000 imaginary coins. One wager per round can be replaced before the race starts. Payouts divide the actual pool among winning stakes, using integer amounts. Draws, aborted rounds, and a winner with no backers refund stakes. Balances and rounds are held in server memory; restarting resets the session. Guest identities are remembered in browser local storage.

## Production

For team deployments from GitHub, see [GitHub deployment](deploy/README.md).

```sh
npm ci
npm run build
npm start
```

Serve the Node process behind an HTTPS reverse proxy with WebSocket support. Set `PUBLIC_URL` to the public origin so the QR code points there. `PORT` defaults to 5173. This is a single-room hackathon build; host controls and guest sessions are intended for a trusted demo audience. Persistent accounts, host authentication, and multiple rooms are future work.

## Checks

```sh
npm test
npm run build
```

Tests cover deterministic simulation, valid delivery, varied winners, collision boundaries, theft, brewing recovery, draw handling, betting conservation, replacement, reconnect behavior, and optional model tactics. Browser checks cover the desktop arena, mobile joining, betting, QR dialog, camera, sound, result settlement, and responsive overflow.

## Credits

Built during the hackathon with Codex. The game, scene geometry, character models, environment, simulation, and interface were created for this project. Libraries: Three.js, React, Vite, Express, Socket.IO, and QRCode. Fonts: Barlow Condensed and DM Sans via Google Fonts. Overcooked, Gang Beasts, Moving Out, and Fall Guys informed the design discussion; no assets from those games are included.
