# Direct agent control

Each runner waits for explicit commands. The server handles physics, animations, rules, and elapsed world processes such as coffee brewing. It never chooses a goal, computes a route for a controller, avoids a rival, unsticks a runner, picks up a nearby mug, shoves, serves, or stands up on behalf of an agent. Navigation helpers retained on `CoffeeSimulation` are used explicitly by test controllers; the simulation tick never calls them.

## Controller modes

| Mode | Decision source | Credentials |
| --- | --- | --- |
| `idle` | No decisions; wait | None |
| `external` | A coding agent or controller program submits HTTP commands | Per-runner game token returned on claim |
| `responses` | A separate model call for each runner returns one physical command | Server-side `OPENAI_API_KEY`, optional `OPENAI_MODEL` |
| `decisions` | `/v1/decisions` chooses one explicit physical command from a menu | Server-side `OPENAI_API_KEY`, optional `OPENAI_DECISIONS_MODEL` |

Responses defaults to `gpt-4.1-mini`. Decisions defaults to `gpt-6-luna`, following the current [Decisions documentation](https://developers.openai.com/api/docs/guides/decisions). The menu contains movement in eight directions at two paces and two durations, facing directions, waiting, and currently reachable interactions with explicit targets. It contains no goal or route macros. On a model error or refusal the runner waits and retries after five seconds; no local strategy takes over.

The model acts only after the previous command finishes. Its observation includes its identity, current human instruction, a map with obstacle bounds, positions and velocities, exact interaction targets, cups and ownership, machines and brewing progress, the gate, spills, current and last command results, and recent command/event history. The current server exposes the full arena to every controller, rather than simulating limited visibility. Model decision latency is shown in controller state; it is not a measured guarantee of responsiveness.

## External coding agents

Start an isolated local server, leaving the published service on port 5173 alone:

```sh
PORT=5180 NODE_ENV=production npm start
```

The production-mode local server needs a prior `npm run build`. Development mode works too. Connect an agent using the CLI:

```sh
GAME_URL=http://localhost:5180 node scripts/agent-client.mjs claim pip 'Deliver a coffee carefully.'
GAME_URL=http://localhost:5180 node scripts/agent-client.mjs observe pip
```

Start the race in the browser, then submit explicit commands:

```sh
GAME_URL=http://localhost:5180 node scripts/agent-client.mjs command pip '{"type":"move","x":-1,"z":0,"durationMs":800,"pace":"careful"}'
GAME_URL=http://localhost:5180 node scripts/agent-client.mjs command pip '{"type":"look","heading":3.14159}'
GAME_URL=http://localhost:5180 node scripts/agent-client.mjs instruct pip 'Wait here.'
GAME_URL=http://localhost:5180 node scripts/agent-client.mjs release pip
```

The CLI stores the per-runner game token under ignored `.coffee-agent/<host>/`, with restricted filesystem permissions. It waits for command completion and reports the actual result, including failures and cancellations. A coding agent can call the CLI through its shell tool or import `GameAgentClient` from `scripts/agent-client.mjs`. This transport does not itself start Codex or write a character's policy: the connected coding agent supplies its own decisions or code.

## Commands

| Type | Required fields | Behavior |
| --- | --- | --- |
| `move` | `x`, `z`, `durationMs` | Apply world-space axes in [-1,1]; normalize diagonals. Optional `pace`: `careful` or `fast`. No pathfinding. |
| `look` | `heading` | Face an explicit angle in radians; heading = atan2(x,z). |
| `wait` | `durationMs` | Explicitly stay still. |
| `stop` | None | Cancel the current command and interaction, release movement. |
| `take` | `targetId` | Attempt to take this specific mug within reach. |
| `brew` | `targetId` | Place the held mug in this empty machine and start brewing. |
| `place` | `targetId` | Put the held mug on this worktop. |
| `drop` | None | Release the held mug into the physical world. |
| `push` | `targetId` | Shove this reachable runner if the cooldown allows it. |
| `deliver` | None | Serve at the customer with at least 55% coffee. |
| `stand_up` | None | Start the explicit 1.75-second recovery animation after falling. |

Movement and waiting last 50–1000 milliseconds. Releasing movement lets the existing physical smoothing settle the character; it does not teleport or freeze collision impulses. Actions take physical time and may fail if a rival claims their target first. A failed pickup never chooses a replacement target. The agent must inspect `self.lastCommand` and issue a new command. Human keyboard control retains its contextual interaction button; agent commands always specify the interaction and target.

## HTTP contract

| Endpoint | Purpose |
| --- | --- |
| `GET /api/agents/:id/observe` | Current observation, phase, and public controller status; no token required |
| `POST /api/agents/:id/claim` | Claim an unassigned runner with `{ "mode": "external", "instruction": "..." }`; returns a token |
| `POST /api/agents/:id/command` | Submit `{ "round": 1, "revision": 2, "sequence": 1, "command": { ... } }` |
| `POST /api/agents/:id/instruction` | Replace the instruction with `{ "instruction": "..." }` |
| `POST /api/agents/:id/release` | Release the runner and stop its command |
| `POST /api/voice/transcribe` | Transcribe an audio request body up to 2 MiB, requiring a server API key |

Command, instruction, and release requests require `Authorization: Bearer <game-token>`. Commands are accepted only during racing. Use the observation's current round, instruction revision, and the next sequence number. A rejected command consumes its sequence number if its envelope was current; read the observation before trying again. An exact retry of the most recently submitted envelope is idempotent. Changed payloads at the same sequence, reordered commands, and stale rounds or instruction versions are rejected.

A human instruction cancels the current command and pending model request, increments the instruction revision, and causes a fresh observation on the next model decision. Starting a race also increments the revision. A new round releases all agent claims. Human keyboard takeover invalidates the agent controller; releasing keyboard control leaves the runner idle.

The browser's `host:agent` event can configure, instruct, or stop a controller. Like the pre-existing start/reset host controls, it assumes a trusted demo audience. Per-runner HTTP tokens prevent accidental cross-controller commands, but are not an account-level host authorization system. Public controller state never includes bearer tokens or API credentials.

## Voice

Open **Agent instructions**, select a runner and model controller, and choose **Record instruction**. Choose **Stop recording and send** to submit it. Recording stops after 20 seconds. The browser sends recorded audio to the server, which transcribes it through `/v1/audio/transcriptions` and returns text. The browser submits that text as the new instruction. Existing external agents can also receive typed or transcribed instructions.

Recording requires HTTPS or localhost, browser microphone support, and permission. Closing the dialog stops its microphone tracks and cancels pending transcription. This is utterance recording plus transcription, not a persistent Realtime connection or spoken agent replies. Without a server key, model and microphone controls are disabled and the UI explains why.

## Validation

```sh
npm test
npm run build
python .agents/skills/antislop-human/contrast-check.py --selftest
```

The external courier simulation test completes pickup, unattended brewing, and delivery using only explicit commands and real Rapier physics. The HTTP tests exercise external ownership, stale stopping, instruction changes, Responses and Decisions commands, and transcription with a test-only transport. No request reaches OpenAI in these tests.

A full wall-clock HTTP round uses the explicit waypoint controller in `scripts/smoke-agent.mjs`:

```sh
GAME_URL=http://127.0.0.1:5180 node scripts/smoke-agent.mjs
```

This is a scripted controller correctness test, not a measurement of model intelligence. Its route choices live outside the game. It writes `test-results/agent/live-external.json`.

For browser review, start a second isolated server with the test-only model transport, then run the review script. The token below is a dummy fixture value; network calls to OpenAI are intercepted in this process.

```sh
PORT=5181 NODE_ENV=production OPENAI_API_KEY=test-only-no-network node --import ./tests/fixtures/mock-openai.mjs server/index.js
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/review-agents.mjs
```

The browser review covers Responses, Decisions, instruction updates, recording submission with a synthetic microphone, transcription failure, stopping, Escape/focus restoration, mobile overflow, and missing-key states. Reports and screenshots are saved under `test-results/agent/`. Real OpenAI decision quality, latency, and microphone transcription require a later live API test. This change does not provision API credentials.
