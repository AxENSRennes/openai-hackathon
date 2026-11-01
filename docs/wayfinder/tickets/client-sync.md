# Specify cameo state across broadcast and phone clients

Type: Grilling (human decision)
Status: In progress
Assignee: Codex

## Question

What state and event data should the authoritative server publish so the shared broadcast and phone clients stay consistent about host-triggered cameo visits, queued triggers, randomized effects, and the live incident feed? Define what each client displays and when it updates.

## Decision

Use the existing authoritative Socket.IO `state` snapshot as the sole synchronization contract. The server publishes snapshots at its current cadence (about 15 per second), including on connection and after host commands. Do not add a second lifecycle event stream. This keeps the broadcast and phone clients on one source of truth and lets a reconnecting client render the current visit immediately.

Extend each snapshot with:

- `cameo.current`: `null` or `{ visitId, characterId, phase, effect }`, where `phase` is one of `entering`, `causing-effect`, or `leaving`; `effect` is the server-rolled outcome and affected runner/delay details when known.
- `cameo.queuedCount`: number of accepted visits waiting behind the current visit.
- `events`: the existing newest-first incident feed, extended with `visitId` for cameo incidents. Keep each event's stable `id`, `type`, `text`, `actorId`, and race-relative `time`; the server owns outcome and text.

The host trigger acknowledgement reports whether the request was accepted and, when accepted, its `visitId` and queue position. The acknowledgement is for immediate host feedback; the snapshot remains authoritative. Event IDs deduplicate feed entries and one-shot client effects. On reconnect, clients replace local state from the latest snapshot, show the current phase and queued count, and render the included incident history without replaying old one-shot effects.

The broadcast renders the cameo from `cameo.current`, shows the accepted queue count, and displays the shared incident feed. The phone renders the same current visit status, queue count, and incident feed without loading the 3D scene. Both update only from server snapshots; host acknowledgements may show request feedback but cannot locally advance cameo state. Race end clears the current visit and queued count, and the server publishes that final state before the next round.
