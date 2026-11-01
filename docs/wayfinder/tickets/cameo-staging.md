# Specify cameo staging and event messaging

Type: Grilling (decision recorded)
Status: Resolved

## Question

How should the photo-inspired cameo enter, cause its selected spill or machine delay, and leave so viewers notice the interruption while still following the race? Define the visual beats, animation, sound, incident-feed message, and duration without letting agents catch the cameo.

## Decision

Use one five-second stage per serialized visit: one second to enter from the edge of the office scene, three seconds for the selected effect beat, then one second to escape. Begin the authoritative spill and/or three-second machine delay at the start of the effect beat. The next queued visit starts only after the escape completes. Keep the cameo near the machine or affected runner, but out of the center of the race view; agents never collide with or catch it.

The broadcast interpolates the three stages from the authoritative snapshot. The phone shows the same phase, effect summary, and queue count as text without a 3D character. Play one short entry cue and a brief effect cue only when sound is enabled; the visual and feed remain sufficient when muted or reduced motion is preferred.

Publish one stable-ID `cameo` incident per visit with `visitId`, rolled outcome, affected runner and coffee amount when applicable, machine delay when applicable, race-relative time, and server-authored text. If a spill has no eligible target, skip only that spill and report that it missed while preserving a rolled machine delay. Clients use the stable ID to avoid replaying sound or animation after reconnect; the latest snapshot still renders the current phase.
