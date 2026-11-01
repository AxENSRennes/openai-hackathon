# Coffee Run: Photo Cameo Chaos

## Destination

Ship a brief, photo-inspired troublemaker cameo in Coffee Run. The cameo should be dramatic and funny for viewers, cause a random mix of coffee spills and coffee-machine delays, then leave while the six agents continue their coffee delivery race.

## Notes

- The six agents compete to deliver at least 55% full coffee to their own desks. The simulation controls movement and race physics; the optional OpenAI controller chooses pace, route, and aggression.
- The cameo is a visible character, appears briefly, causes a disruption, and escapes. The agents never catch them.
- The interruption should be immediately noticeable to viewers. Keep the race readable and the mishaps harmless.
- Keep this map and its ticket files as the repo source documents; mirror decisions to the Linear issues.
- Carry execution through child Task issues until the cameo is shipped.
- Implementation must fit the existing broadcast and multiplayer simulation. Preserve betting fairness and the authoritative server simulation.

Implementation spec: [Coffee Run Cameo Implementation Spec](https://linear.app/tsaimc2/document/coffee-run-cameo-implementation-spec-00090e870ab6).

## Decisions so far

- The troublemaker appears as a visible cameo, causes a quick comic interruption, and leaves before agents can catch them.
- The cameo is dramatic enough that viewers immediately notice it.
- The disruption can include a spill, a coffee-machine delay, or both.
- The agents' mission and existing race rules remain the center of the game.
- [Choose the photo-to-character flow](tickets/photo-to-character.md): the host submits a photo during the race; if it is unsuitable or the character is not ready in time, the host chooses a pre-captured cameo. The live character keeps a recognizable, stylized likeness.
- [Define cameo timing and race effects](tickets/event-rules.md): the host can trigger unlimited visits during a race, serialized until each cameo leaves; queued visits are discarded at race end. Each visit rolls a 45% spill, 45% machine delay, or 10% both; effects are bounded and the race clock never extends.
- [Specify cameo state across broadcast and phone clients](tickets/client-sync.md): both clients consume the existing authoritative Socket.IO snapshot, including current cameo phase, queued count, and stable-ID incident feed; reconnects restore state without replaying old effects.
- [Define betting and result handling for cameo events](tickets/betting-outcomes.md): bets stay locked at race start; cameo effects can influence race state but not winner rules or payouts, and a timed-out draw refunds every wager.
- [Specify cameo staging and event messaging](tickets/cameo-staging.md): each visit uses a five-second enter/effect/escape beat, one stable-ID incident, optional sound, and no catch or collision.
- [Define the cameo asset and simulation seam](tickets/asset-pipeline.md): upload a bounded, browser-normalized WebP over HTTP into ephemeral server memory; a server-side director owns queue and effects while clients only present snapshots.

## Not yet specified

- No additional decisions are known. Implementation work is tracked in child Task issues.

## Out of scope

- Letting players catch, control, or bet on the troublemaker.
- Audience sabotage or direct audience control of race events.
- Replacing the agents' coffee-delivery objective or allowing the cameo to decide the winner directly.
- Adding voice or advice features.

## Frontier

- [Implement authoritative cameo scheduling and effects](https://linear.app/tsaimc2/issue/TSA-86/implement-authoritative-cameo-scheduling-and-effects)
- [Add bounded photo upload and ephemeral cameo assets](https://linear.app/tsaimc2/issue/TSA-89/add-bounded-photo-upload-and-ephemeral-cameo-assets)
- [Add host cameo controls and phone status](https://linear.app/tsaimc2/issue/TSA-87/add-host-cameo-controls-and-phone-status)
- [Render the cameo in the 3D office scene](https://linear.app/tsaimc2/issue/TSA-88/render-the-cameo-in-the-3d-office-scene)
