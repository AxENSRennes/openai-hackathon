# Coffee Run cameo implementation spec

## Goal

Ship a brief, photo-inspired troublemaker cameo in Coffee Run. The host can trigger visits during a race. Each visit briefly interrupts the office, applies a bounded spill and/or machine delay, and escapes while the six-agent race continues.

## Fixed rules

- Bets lock when the race starts. Cameos may affect the race indirectly but cannot choose a winner, change the 55% delivery threshold, alter the betting pool, or change payouts.
- The server simulation remains authoritative. The first agent to deliver at least 55% coffee wins. If the 100-second clock expires first, the round is a draw and all wagers are refunded.
- Visits run one at a time. Each trigger is queued behind the current visit. Queued visits are discarded at race end and never carry into the next round.
- Each visit rolls 45% spill, 45% machine delay, or 10% both. A spill removes 10–15 coffee percentage points from one random eligible racer carrying coffee. A machine delay pauses the shared machine queue for three seconds. If no racer is eligible, skip only the spill. The race clock never pauses or extends.
- Each visit has three display phases: enter for one second, effect for three seconds, escape for one second. The effect begins at the start of the effect phase. Agents cannot catch or collide with the cameo.

## Authoritative state contract

Continue using the existing Socket.IO `state` snapshot, published at its current cadence and on connection. Extend it with:

```js
cameo: {
  current: null | {
    visitId,
    characterId,
    assetUrl,
    phase,             // entering | causing-effect | leaving
    phaseElapsedMs,
    effect             // null before effect; resolved outcome facts after
  },
  queuedCount
}
```

Keep `events` newest-first. Each cameo visit adds one stable-ID event with `type: "cameo"`, `visitId`, race-relative `time`, server-authored `text`, and structured effect facts: rolled outcome, affected runner and coffee points if spilled, and delay duration if applied. Stable IDs deduplicate one-shot sound and animation. On reconnect, clients replace local state from the latest snapshot, render the current phase, and do not replay prior feed events or cues.

Use `host:trigger` for bundled preset cameos. Its acknowledgement returns `{ ok, visitId, queuedPosition }`. For a photo visit, the broadcast client posts a single browser-normalized WebP to `POST /api/cameo-visits`; the server validates and stores it, queues the visit atomically, then returns the same acknowledgement fields. The shared snapshot carries only the character ID and same-origin asset URL, never image bytes. Mark a Socket.IO connection as host only when its same-origin `Referer` path is `/`; reject host commands when it is `/join` or missing. The upload route accepts `X-Coffee-Host-Socket` only when it references a currently connected host socket.

## Photo lifecycle

The host chooses a photo for a visit. The browser center-crops it to 512×512 WebP and encodes at or below 256 KB. The server checks MIME, WebP signature, and size. Uploaded bytes stay in memory while the visit is current or queued, are served through an opaque character ID, and are deleted when no visit references them. Clear all remaining photo assets at round reset and server shutdown. Never persist the source photo. If upload, validation, or readiness fails, trigger the bundled `preset:rascal` cameo instead and tell the host.

Render the uploaded image as a framed, color-treated billboard in the existing 3D scene. The bundled fallback uses a small procedural illustration made from the game's existing materials. The phone does not load the 3D scene; it shows the same cameo phase, effect summary, queue count, and incident feed as text with a small image preview when available.

## Module ownership

- A server-side `CameoDirector` owns trigger acceptance, queue order, visit IDs, phase timing, secure outcome rolls, asset references, and the compact snapshot state.
- `CoffeeSimulation` applies the director's resolved effect data: subtract coffee from the selected eligible racer or pause machine service for three seconds. It does not choose a visual or client state.
- `CoffeeScene` renders the current presentation state and asset. It cannot roll outcomes, choose a target, or mutate simulation state.
- `BettingBook` behavior remains unchanged; the server settles from the final simulation winner or refunds everyone on a draw.

## Presentation and copy

Place the cameo near the office scene edge, away from the center of the race. Keep the office readable throughout the five-second visit. Play one short entry cue and one brief effect cue only when sound is enabled. Reduced-motion preferences skip the travel animation while preserving phase and incident updates.

Publish one incident per visit. Examples:

- Spill: “The cameo splashed 12% from Pip’s coffee.”
- Delay: “The cameo stalled the coffee machine for 3 seconds.”
- Both: “The cameo splashed 12% from Pip’s coffee and stalled the machine for 3 seconds.”
- No spill target: “The cameo found no coffee to spill, but stalled the machine for 3 seconds.”

The server derives the text from resolved outcome facts; clients display it verbatim. A muted client still gets the visual phase and feed entry.

## Delivery order

1. Add the server director, queue, snapshot contract, simulation effects, and round cleanup.
2. Add bounded photo upload, host-only validation, opaque asset serving, and cleanup.
3. Add host controls, phone status, and incident-feed presentation.
4. Add the 3D billboard, five-second staging animation, effect cues, and reduced-motion behavior.
