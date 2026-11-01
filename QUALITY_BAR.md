# Coffee Run: Level 4 Quality Contract

Status: user-selected target. This document defines the next version's ambition. It does not claim that the current prototype meets it.

## Commitment

Build a commercially polished indie vertical slice, using **Overcooked! 2's normal kitchen gameplay as the benchmark for presentation, readability, movement, animation, contextual interactions, and feedback**. Concentrate that quality in one original coffee-office arena.

The target is comparable production care in a small scene. Campaign size, content volume, and a AAA production budget are outside this commitment. More maps, recipes, libraries, or effects do not establish a higher quality level.

## Fixed game identity

- One human waits at one delivery desk.
- Seven agent-controlled mascots compete to serve that human first.
- There is one coffee type and no recipe-correctness judgment.
- The first delivered cup with at least 55% remaining wins.
- Equipment, work surfaces, routes, and loose objects are shared.
- Cups can be placed, dropped, recovered, stolen when unattended or dropped, and broken. A held cup must be dropped before another agent can take it.
- Falls, spills, and breakage are recoverable setbacks. Agents can return to prepare another coffee.
- Spectators join by QR code and place virtual wagers. Advice, audience sabotage controls, and voice remain outside this version.

## Similarity to Overcooked

The primary reference is ordinary sustained cooking gameplay. Promotional close-ups are secondary art references and do not establish normal camera behavior. Similarity is assessed dimension by dimension, never as an invented percentage.

| Dimension | Required similarity | Coffee Run interpretation |
|---|---|---|
| Composition and HUD | A compact arena dominates a complete game screen. Pictorial information sits around or near the action. | Shared customer, competitor progress, clock, compact pool information, and local item/station indicators. Detailed betting stays on phones or an intentional overlay. No decorative recipe tickets for nonexistent orders. |
| Art direction | Strong silhouettes, expressive proportions, readable carried objects, authored surfaces, coherent lighting, and grounded objects. | Original office employees, coffee equipment, furniture, and a waiting customer, all belonging to one visual world. |
| Movement | Dependable locomotion, readable turns and carrying, intentional impact response. | Acceleration, braking, turns, coffee-carrying risk, knockback, and recovery feel tuned together. |
| Animation | Actions communicate intention and outcome through distinct poses and transitions. | Reaching, taking, carrying, placing, pushing, stumbling, falling, and recovering agree with the actual item state. |
| Interactions | Contextual actions and meaningful object states compose into larger situations. | Prepare, protect, contest, steal, recover, refill, and deliver operate on persistent cups. |
| Mechanical depth | Processes, shared resources, and spatial constraints create competing useful actions. | An agent can leave a brew unattended, steal an opportunity, change routes, or restart after failure. |
| Camera and staging | Shared-space comprehension remains central. | A readable three-quarter overview, smooth zoom/dezoom, optional following, and considered opening/result transitions. |
| Feedback and audio | Important changes are apparent immediately at their source. | Distinct poses, effects, indicators, and sounds explain preparation, impact, theft, spills, breakage, and delivery. |

## Required quality, beyond feature presence

### Finished game presentation

The opening impression must be of a game. Arena, HUD, countdown, start, and results share one art direction. Competitor identities remain consistent. Local information explains the relevant item or station. A spectator should follow the lead changing without reading an activity feed.

Below target: a scene embedded in a conventional website, with a large header, side panel, and feed reducing the working area. A technically functional UI alone does not meet the visual bar.

### Characters and environment

Silhouettes, faces, clothing, props, furniture, and equipment feel designed together. Carried mugs remain identifiable at normal viewing distance. Work surfaces and walkable space are immediately distinct. Lighting, contact shadows, material variation, and selective detail support depth and legibility. A close zoom reveals coherent detail.

Below target: placeholder people, unrelated asset styles, indistinct cups, uniform materials, or a scene that only looks convincing in a still image. Primitive geometry is acceptable when it reads as a deliberate finished design; a specific modeling method is not required.

### Movement and animation

Running, stopping, turning, carrying, reaching, placing, pushing, falling, and recovery have intentional physical and animated responses. Hands, body, and object agree about the action. Anticipation, transitions, and follow-through give actions weight. Ordinary movement remains controllable before physical comedy is added.

Below target: sliding feet, a generic limb swing for every action, teleporting cups, disconnected hand gestures, or a fall represented only by rotating a standing model. Navigation defects must not manufacture comedy.

### Persistent interactions and decisions

A cup has a location, contents, condition, and at most one holder. Placing it changes who can take it. Impacts change its position, contents, or condition. Breaking it changes available plans. Workstation preparation can continue when its owner leaves. These same rules support normal play, theft, failure, and recovery.

At important moments an agent has competing useful choices: stay or leave, protect or steal, rush or carry carefully, go directly or detour, recover a cup or prepare another. One coffee type is sufficient; depth comes from the interaction of these choices and shared resources.

Below target: a fixed cup-machine-customer path decorated with random falls; a mug represented only by a quantity on an agent; numeric theft that does not explain where the visible cup went; or refills disconnected from the machine on screen.

### Camera, feedback, and round staging

The main view preserves an understanding of the shared kitchen and customer. Zoom and dezoom are smooth, deliberately bounded, and useful. Introduction, optional closer tracking, phase changes, and results can change framing. An incident close-up must not hide a simultaneous decisive action. Constant dramatic event zooming is not assumed to be an Overcooked behavior.

Visual and audio feedback distinguish preparation completion, possession changes, impacts, spills, breaking, and delivery. Effects explain direction and consequence. Generic particles and a single beep for every event fall below target.

The compact level deliberately creates conflicts and alternatives. A changed passage or moving element changes the available plan. A complete round has an opening, escalation, recoverable setbacks, a possible comeback, and a clear final delivery. Unavoidable permanent congestion or an obvious winner long before delivery fall below target.

## Defining reference scene

An agent starts a coffee and leaves its cup unattended. A rival takes the cup. A confrontation causes a drop and spill. Another agent reacts to the changed route. The first agent recovers or prepares another coffee and remains in contention. A valid cup eventually reaches the single waiting human.

This is a reference for quality and composability, not a script required in every round. Its events must arise from actual actions, decisions, and object states. It must remain understandable without developer narration.

## Review and completion

Use matched reference examples at the same display size: ordinary preparation, a crowded interaction, recovery after a spill, a camera transition, and a winning delivery. Compare normal gameplay frames for composition and visual craft; short sequences for movement, animation, camera, and feedback; and a complete unscripted round for decisions and consequences.

Assess each dimension in the similarity table as **Below target**, **At target**, or **Above target**, with a concrete observation. Level 4 is reached only when every dimension is at target. A feature being present is insufficient. Strong artwork cannot compensate for shallow mechanics, and mechanical depth cannot compensate for placeholder presentation.

Frame rate, correctness, and synchronization remain necessary engineering checks. They do not establish commercial indie quality by themselves. No particular engine, rigging method, physics library, or package installation is proof that this quality bar has been met.

Keep the content scope concentrated: one finished arena, one customer, one coffee objective. Additional recipes, levels, progression, audience powers, and voice do not substitute for reaching this quality bar.

## Reference evidence

- [Official Overcooked! 2 gameplay image](https://www.team17.com/hs-fs/hubfs/ss_088a00e30b0671f4f3a0406651983ad9d05512d7.1920x1080.jpg): composition, HUD hierarchy, local indicators, and player identification.
- [Phil Duncan: building truly cooperative play](https://www.gamedeveloper.com/design/game-design-deep-dive-building-truly-cooperative-play-in-i-overcooked-i-): task overlap, processing delays, disruptions, and contextual restrictions.
- [Phil Duncan interview](https://caneandrinse.com/ghost-town-games/): pictorial UI and deliberately authored levels.
- [Developer postmortem](https://mcvuk.com/development-news/the-develop-post-mortem-overcooked/): spatial problems and compact levels that preserve readability.

This comparison uses observable behavior and creator statements. Exact Overcooked camera code, shaders, animation graphs, and physics settings have not been established through binary analysis. Coffee Run's rivalry, betting, volume threshold, breakage, and exaggerated knockdowns are its own design commitments.
