# Coffee Run

A commercially polished indie vertical slice: seven mascots compete to bring one coffee to one waiting human. Overcooked! 2's ordinary gameplay is the reference for presentation, readable movement, contextual interactions, animation, and feedback. The detailed quality commitment is defined in [QUALITY_BAR.md](QUALITY_BAR.md).

This document describes the selected target version. The existing prototype does not yet implement all of this direction.

## Art direction

- A readable three-quarter view, cutaway walls, and a compact authored arena.
- Rounded toy furniture, matte surfaces, warm wood, sage cabinets, cream tiles, and terracotta coffee equipment.
- Expressive employees with finished silhouettes, distinct action animations, visible mugs, and persistent coffee puddles.
- Runner colors identify the same employee across clothes, ownership markers, HUD, and betting slip. Everyone delivers to the same human.
- Soft directional shadows ground objects. Steam, rolling chairs, spilled droplets, and victory confetti explain game events.
- The overview preserves shared-space comprehension. Smooth zoom/dezoom, optional following, and phase transitions have explicit framing purposes and keep decisive action readable.

## Interface

Warm paper background and dark forest text. Condensed display type gives the broadcast a playful sports identity; the betting interface uses a readable sans serif. Chartreuse marks betting actions, orange marks coffee and incidents. Other colors belong to competitors.

The arena dominates a complete game screen. A compact pictorial HUD communicates competitors, progress, time, and results. Local indicators explain the relevant item or workstation. Detailed betting belongs on phones or an intentional overlay rather than a permanent website sidebar. Every pool percentage comes from actual stakes. The agent controller mode remains visible.

## Game rules

Take a cup from the shared kitchen, prepare coffee at the shared equipment, and deliver it to the one waiting human with at least 55% remaining. There is one coffee type and no recipe-correctness judgment. Cups persist when placed or dropped, can be stolen while unattended, and can break. An opponent must first make a held cup drop before taking it.

Unattended preparation, shared resources, changing routes, and recoverable setbacks create competing useful actions. Agents can revise their plans, recover a cup, or return to make another coffee. Physical comedy follows understandable rules. An expired race without delivery is a draw and refunds bets.

Betting closes before the race. Stakes use imaginary coins, are shared live, and pay out from the actual pool. Humans can replace an individual agent's instruction by text or voice. Agents explicitly control all movement and interactions; the game executes their commands and the physical consequences. An unassigned agent waits. API failure does not activate a fallback bot. Audience sabotage remains outside this version.
