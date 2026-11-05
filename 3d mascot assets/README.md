# Coffee Royale mascot assets

Seven original parody robot characters: Astra, Opus, Grokbot, Argon, DeepSeek, Kimi, and Mistral. This folder contains individual assets and reusable JavaScript. It has no preview app, screenshots, bundled runtime, or ZIP.

## Files

| Path | Contents |
| --- | --- |
| `exports/coffee-royale-<id>.glb` | Self-contained 3D model with seven transform-animation clips |
| `exports/sprites/<id>-still.png` | 512 by 512 transparent character holding coffee |
| `exports/sprites/<id>-atlas.png` | 2048 by 1792 transparent action sheet, eight frames per row |
| `exports/sprites/<id>-directions.png` | Eight static idle viewing directions, 256 by 256 per frame |
| `exports/sprites/<id>.json` | Frame sizes, action rows, timing, direction angles, and feet pivot |
| `src/mascots.js` | Three.js mesh factory and pose animation for all seven characters |
| `src/canvas-sprite.js` | Canvas drawing helper with no dependencies |

Character IDs: `astra`, `opus`, `grokbot`, `argon`, `deepseek`, `kimi`, `mistral`.

## Use in the existing 2D game

Copy the files from `exports/sprites/` into the game's public asset directory. Load a character's action PNG and JSON, then use the Canvas helper in your existing animation loop:

```js
import { drawMascotSprite } from './canvas-sprite.js';

const image = new Image();
image.src = '/coffee-royale/mascots/astra-atlas.png';
await image.decode();
const metadata = await fetch('/coffee-royale/mascots/astra.json').then(r => r.json());

drawMascotSprite(ctx, image, metadata, {
  x: screenX,
  y: screenY,
  height: 125,
  pose: 'run',
  elapsedSeconds: presentationTime,
});
```

The screen position is the feet anchor. Read pose and coffee ownership from authoritative game state. Interpolate positions in the UI and deduplicate event-driven effects by event ID. These assets do not compute game outcomes.

Atlas rows are `idle`, `run`, `carry`, `punch`, `stunned`, `wobble`, and `victory`. Use each row's duration in the JSON. Animated frames have one fixed three-quarter view. The direction strip contains static idle views, not a complete directional animation set. Steam and stun stars are baked into the relevant sprite frames.

## Use the 3D models

Load a GLB with your game's existing glTF loader. Models have their origin at the feet, face +Z, and use +Y as up. They are about 2.5 to 2.9 units tall. Materials are embedded colors; there are no external textures or compression decoders to fetch.

The seven animation clip names match the atlas rows. They animate named transform groups, not skinned bones. The cup is a named attachment exported at zero scale because glTF does not encode visibility. Show it only when authoritative state says the character has coffee:

```js
gltf.scene.getObjectByName('coffee-cup').scale.setScalar(carrying ? 1 : 0);
```

GLBs include the cup's counter-rotation. Steam and stun-star effects are not included in the GLBs and must be rendered by the game UI.

To construct or modify the meshes in code, install `three@0.180.0` in the consuming project and use the factory:

```js
import { createMascot } from './mascots.js';

const mascot = createMascot('astra');
scene.add(mascot.root);
mascot.root.position.set(worldX, 0, worldZ);
mascot.update(presentationTime, 'run', { carrying: hasCoffee });
// Release this instance when its scene is removed.
mascot.dispose();
```

Call `disposeSharedGeometry()` only after disposing every mascot that uses the shared primitive geometry. Three.js is not required when using the pre-rendered 2D sprites.

## Scope and verification

The character set was checked across 49 character/pose combinations. All seven GLBs were exported and round-trip loaded before sharing; all sprite PNGs and JSON metadata were validated. These checks do not establish integration with the repository's game. Additional handover, steal, deal, pillow-hit, spill, and failure effects remain the UI's responsibility.

The designs are original parody characters, not official brand mascots. Game code, root dependencies, and simulation behavior are unchanged by this folder.
