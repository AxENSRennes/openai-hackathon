# Coffee Run assets

## Seven Coffee Royale mascots

Astra, Opus, Grokbot, Argon, DeepSeek, Kimi, and Mistral retain their original
names, palettes, mesh designs, and seven procedural poses from
[the original mascot library, PR #3](https://github.com/AxENSRennes/openai-hackathon/pull/3).
They are original parody characters, not official brand mascots.

- `shared/mascots.js` is the shared identity and color catalog.
- `client/mascots.js` contains the original Three.js factory and its `idle`,
  `run`, `carry`, `punch`, `stunned`, `wobble`, and `victory` poses. Meshes are
  constructed locally; no character downloads or external textures are needed.
- `client/mascot-view.js` keeps the original poses, adds physical action states,
  blends transitions, and combines the original running legs with the carry arm.
  Interaction progress, recovery, possession, slosh, and victory follow server state.
- `portrait-{id}.png` is a transparent crop of the original 512-pixel still.
  To reproduce a portrait from the PR's `exports/sprites/{id}-still.png`, use
  `ffmpeg -i input.png -vf 'crop=320:320:96:64,scale=192:192' output.png`.

The game uses +Y up, +Z forward, and feet at Y = 0. A uniform scale of .67 keeps
the original proportions and relative heights, fitting the existing arena and
colliders. Team colors identify each runner without recoloring their materials.

`HandSocket` is the persistent cup's base position. The library's decorative
`coffee-cup` stays hidden in every pose, including victory. One separate world
cup follows the socket's position and the runner's heading, so wrist rotations
cannot tilt its contents. Ownership, spills, theft, breakage, and delivery all
use the server's persistent cup. The takeaway cup preserves the original ivory,
tan sleeve, and dark lid design. Only its `Coffee` mesh responds to liquid state;
exact contents remain visible in the existing HUD.

Falls settle into a held grounded pose. Recovery follows the server's remaining
recovery time, and round resets clear animation transitions. Wobble responds to
actual cup slosh. The delivered runner plays the original victory pose while
the delivered cup stays with the customer.

## Blender environment and chairs

`scripts/build-assets.py` authors `environment.glb` and `chair.glb`, including
original embedded bitmap PBR materials. Regenerate from the repository root:

```sh
blender --background --python scripts/build-assets.py
blender --background --python scripts/build-assets.py -- --environment-only
```

Blender requires NumPy in its Python environment. Source texture images in
`textures/` are generated deterministically with NumPy. No online asset library
or copied texture is used for the environment.

The environment follows obstacle footprints loaded from `shared/level.js`, with
two brewing machines, one customer desk, and one seated human customer. Dynamic
chairs and the gate are separate. Floor tops are at Y = 0; the peripheral office
continues beyond the walkable arena. The chair origin is at its casters.

The seven mascots share the existing arena, resource stations, and physical rules.
Asset presence and functional checks alone do not establish the complete visual
quality target in `QUALITY_BAR.md`.
