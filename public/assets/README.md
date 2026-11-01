# Coffee Run assets

The GLBs are authored by `scripts/build-assets.py`, using Blender geometry,
original bitmap PBR materials, articulated object hierarchies, and animation
tracks. Base color, roughness, and tangent normal images are embedded in each
GLB. The source images in `textures/` are generated deterministically with NumPy;
no online asset library or copied texture is used.

Regenerate from the repository root:

```sh
blender --background --python scripts/build-assets.py
```

Use `-- --characters-only`, `-- --environment-only`, or `-- --portraits-only`
after the script path to rebuild one part. Character builds also refresh their
transparent 192-pixel portraits.

The distribution build of Blender requires NumPy in its Python environment. On
this VPS NumPy 1.26.4 is installed in the development user's Python site packages;
the script adds that location to Blender's Python search path.

## Runtime contract

- GLB coordinates: Y up, employee faces +Z, feet at Y = 0.
- `character.glb` is Pip. The five other employees use `character-bolt.glb`,
  `character-miso.glb`, `character-clawd.glb`, `character-byte.glb`, and
  `character-gary.glb`.
- Every employee has the same articulated hierarchy and exact `Uniform`
  material name. Clone that material before recoloring a runner instance.
- `HandSocket` is the mug's base attachment position. Position an upright mug at
  the socket's world position and use the employee's heading; inheriting the
  wrist's rotation would tilt the liquid. The handle meets the right palm in
  `Carry`.
- All employees contain `Idle`, `Run`, `Carry`, `CarryIdle`, `Interact`, `Push`,
  `Fall`, and `Recover`. Loop the first four; use `CarryIdle` for a stationary
  holder. Play the remaining clips once; clamp `Fall`
  until recovery begins. A mixer crossfade preserves transitions.
- `mug.glb` contains a hollow ceramic wall, a separate handle, and the `Coffee`
  mesh/material. Adjust the liquid's local Y position for volume or hide it for
  an empty cup.
- `chair.glb` has its casters at the origin and is about 0.8 units wide.
- `environment.glb` is merged by material for fewer draw calls. It uses the
  shared level's obstacle footprints (loaded directly from `shared/level.js`),
  two brewing machines, one shared desk,
  and one seated waiting customer. Dynamic chairs and the gate are excluded.
  The surrounding office floor continues beyond the camera, with peripheral
  archive furniture outside the walkable arena. Floor tops are at Y = 0.
- `portrait-{identity}.png` is a transparent head-and-shoulders render of the
  corresponding GLB, using the runner's actual uniform color.

Wood uses anisotropic grain and knots; tiles use mottling and scuffs; cabinets
use painted variation; ceramics use glaze flecks; uniforms use a neutral woven
fabric texture that accepts the runtime team color. Mesh UVs are projected at
world scale before material and joint meshes are merged.

The artwork needs to be assessed in complete gameplay sequences together with
camera, lighting, animation transitions, and object ownership. The presence of
these files does not by itself establish the Level 4 quality bar.
