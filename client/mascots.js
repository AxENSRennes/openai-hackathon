// Original Coffee Royale mesh factory and seven poses from PR #3.
// https://github.com/AxENSRennes/openai-hackathon/pull/3
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

import { MASCOTS } from '../shared/mascots.js';
export { MASCOTS } from '../shared/mascots.js';

export const POSES = ['idle', 'run', 'carry', 'punch', 'stunned', 'wobble', 'victory'];
const geometryCache = new Map();

function geometry(key, build) {
  if (!geometryCache.has(key)) geometryCache.set(key, build());
  return geometryCache.get(key);
}
function material(color, roughness = .38, metalness = .05) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
function part(parent, geo, mat, x = 0, y = 0, z = 0, name = '') {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.name = name; parent.add(mesh); return mesh;
}
function box(parent, mat, size, pos = [0, 0, 0], radius = .07, name = '') {
  const [w, h, d] = size;
  const key = `b${w},${h},${d},${radius}`;
  return part(parent, geometry(key, () => new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, w / 2, h / 2, d / 2))), mat, ...pos, name);
}
function ball(parent, mat, size, pos = [0, 0, 0], name = '') {
  const mesh = part(parent, geometry('sphere', () => new THREE.SphereGeometry(1, 24, 16)), mat, ...pos, name);
  mesh.scale.set(...(Array.isArray(size) ? size : [size, size, size])); return mesh;
}
function cylinder(parent, mat, radius, height, pos = [0, 0, 0], top = radius, name = '') {
  const key = `c${radius},${height},${top}`;
  return part(parent, geometry(key, () => new THREE.CylinderGeometry(top, radius, height, 24)), mat, ...pos, name);
}
function ring(parent, mat, radius, tube, pos = [0, 0, 0]) {
  const key = `t${radius},${tube}`;
  return part(parent, geometry(key, () => new THREE.TorusGeometry(radius, tube, 8, 32)), mat, ...pos);
}
function group(parent, name, pos = [0, 0, 0]) {
  const g = new THREE.Group(); g.name = name; g.position.set(...pos); parent.add(g); return g;
}
function star(parent, mat, size, pos, points = 4) {
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const a = i * Math.PI / points + Math.PI / 2, r = size * (i % 2 ? .34 : 1);
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: .035, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .009, bevelThickness: .009 });
  return part(parent, geo, mat, ...pos, 'star');
}

function crescent(parent, mat, radius, pos) {
  // One continuous crescent profile, with no overlapping disks or texture masks.
  const shape = new THREE.Shape();
  const outerAngle = Math.PI / 3, innerAngle = Math.PI / 2;
  shape.absarc(0, 0, radius, outerAngle, Math.PI * 2 - outerAngle, false);
  shape.absarc(radius * .5, 0, radius * Math.sqrt(3) / 2, -innerAngle, innerAngle, true);
  shape.closePath();
  return part(parent, new THREE.ExtrudeGeometry(shape, { depth: .055, bevelEnabled: true, bevelSize: .012, bevelThickness: .012, bevelSegments: 2, steps: 1, curveSegments: 24 }), mat, ...pos, 'crescent');
}

/** Real meshes, no textures or network requests. Local +Z is the face, +Y is up.
 * Root origin is at the feet. All characters fit roughly 1.55 × 2.75 × 1.2 units.
 * update() changes visuals only; caller owns gameplay, elapsed time and events.
 */
export function createMascot(id, { coffee = false } = {}) {
  if (!Object.hasOwn(MASCOTS, id)) throw new Error(`Unknown mascot: ${id}`);
  const definition = MASCOTS[id];
  const root = new THREE.Group(); root.name = `coffee-royale-${id}`;
  root.userData = { mascotId: id, license: 'Original Coffee Royale parody character', forward: '+Z', up: '+Y' };
  const shell = material(definition.color), dark = material('#263c43', .28, .16), black = material('#11262d', .24, .08);
  const ivory = material('#fff1d7', .38), metal = material('#adbcc2', .3, .5);
  const trimColors = { astra: '#359b7d', opus: '#c45e34', grokbot: '#c5ec75', argon: '#7761b3', deepseek: '#3262c2', kimi: '#e7b958', mistral: '#d95731' };
  const trim = material(trimColors[id], .37);
  const yellow = material('#ffce6b');
  const eyeMat = new THREE.MeshStandardMaterial({ color: id === 'grokbot' ? '#d4f891' : id === 'argon' ? '#f5e2af' : '#fff1d3', roughness: .3, emissive: id === 'grokbot' ? '#a8d855' : '#f9dab0', emissiveIntensity: .36 });
  const body = group(root, 'body', [0, .73, 0]);
  const torso = group(body, 'torso', [0, .35, 0]);
  const head = group(body, 'head', [0, 1.02, 0]);
  const arms = [], legs = [], eyes = [];

  // Small boots, exposed mechanical joints, chunky mittens; consistent toy scale.
  for (const side of [-1, 1]) {
    const leg = group(body, side < 0 ? 'leg-L' : 'leg-R', [side * .245, -.25, 0]);
    ball(leg, dark, .15, [0, -.025, 0]);
    cylinder(leg, metal, .105, .25, [0, -.18, 0]);
    box(leg, id === 'grokbot' ? shell : ivory, [.34, .29, .49], [0, -.34, .09], .095, 'boot');
    box(leg, trim, [.35, .065, .49], [0, -.47, .09], .025, 'sole');
    legs.push(leg);
    const arm = group(body, side < 0 ? 'arm-L' : 'arm-R', [side * .51, .56, 0]);
    ball(arm, dark, .14);
    cylinder(arm, shell, .15, .28, [0, -.14, 0]);
    cylinder(arm, trim, .16, .075, [0, -.29, 0]);
    const hand = group(arm, 'hand', [0, -.41, .025]);
    box(hand, ivory, [.28, .26, .28], [0, 0, 0], .1, 'mitten');
    ball(hand, ivory, [.09, .12, .09], [-side * .12, -.015, .075]);
    arm.rotation.z = side * .12; arms.push(arm);
  }

  if (id === 'astra') {
    box(torso, shell, [.87, .83, .62], [0, 0, 0], .19, 'spacesuit');
    box(torso, ivory, [.69, .18, .12], [0, -.25, .32], .045, 'utility-belt');
    box(torso, ivory, [.41, .29, .075], [0, .1, .35], .065, 'chest-panel');
    star(torso, trim, .095, [0, .1, .395]);
    for (let i = 0; i < 2; i++) ball(torso, yellow, .025, [.26, .14 - i * .12, .34]);
    // The flattened shell gives a recognizable astronaut silhouette.
    box(head, shell, [1.23, .99, .91], [0, .045, 0], .31, 'helmet');
    box(head, ivory, [1.12, .69, .16], [0, .025, .43], .22, 'visor-rim');
    box(head, black, [.99, .55, .12], [0, .035, .525], .20, 'visor');
    for (const side of [-1, 1]) {
      cylinder(head, ivory, .21, .13, [side * .64, .03, 0]).rotation.z = Math.PI / 2;
      cylinder(head, trim, .11, .145, [side * .66, .03, 0]).rotation.z = Math.PI / 2;
      eyes.push(box(head, eyeMat, [.11, .19, .045], [side * .205, .075, .597], .045, 'eye'));
      ball(head, trim, [.06, .024, .024], [side * .33, -.12, .59]);
    }
    box(head, eyeMat, [.1, .027, .02], [0, -.10, .598], .012, 'smile');
    cylinder(head, metal, .025, .23, [.29, .62, -.04]);
    star(head, yellow, .13, [.29, .79, -.05]);
    // Functional-looking oxygen / espresso pack, visible from behind.
    box(torso, ivory, [.58, .55, .26], [0, .02, -.42], .09, 'backpack');
    for (const side of [-1, 1]) cylinder(torso, trim, .11, .48, [side * .18, .02, -.53]);
  } else if (id === 'opus') {
    box(torso, shell, [.94, .87, .7], [0, 0, 0], .22, 'boiler-body');
    // Espresso apron and brass control buttons.
    box(torso, ivory, [.54, .6, .08], [0, -.05, .37], .08, 'apron');
    box(torso, trim, [.31, .16, .045], [0, -.19, .425], .04, 'apron-pocket');
    for (const x of [-.10, .10]) ball(torso, yellow, .038, [x, .14, .42]);
    cylinder(head, shell, .72, .48, [0, -.03, 0], .66, 'wide-head');
    ball(head, shell, [.72, .41, .64], [0, .18, 0], 'domed-head');
    cylinder(head, trim, .735, .075, [0, -.24, 0], .735, 'helmet-seam');
    box(head, black, [1.09, .4, .15], [0, -.025, .71], .17, 'visor');
    for (const side of [-1, 1]) {
      ball(head, ivory, [.15, .18, .18], [side * .73, -.06, 0], 'ear');
      eyes.push(box(head, eyeMat, [.12, .145, .035], [side * .23, -.015, .80], .04, 'eye'));
      box(head, trim, [.18, .04, .04], [side * .23, .235, .69], .018).rotation.z = -side * .18;
    }
    ring(head, eyeMat, .049, .012, [0, -.12, .80]);
    cylinder(head, trim, .027, .20, [0, .67, 0]);
    ball(head, yellow, .085, [0, .80, 0]);
    for (const side of [-1, 1]) cylinder(torso, trim, .15, .52, [side * .23, .05, -.45]);
    box(torso, metal, [.55, .12, .16], [0, .23, -.53], .035, 'backpack-handle');
  } else if (id === 'grokbot') {
    box(torso, shell, [.86, .87, .65], [0, 0, 0], .17, 'armored-hoodie');
    box(torso, dark, [.68, .60, .09], [0, -.02, .35], .09, 'chest-inset');
    box(torso, trim, [.027, .45, .03], [0, .025, .409], .01, 'zip');
    ring(torso, metal, .034, .012, [0, .14, .44]);
    for (const side of [-1, 1]) box(torso, trim, [.15, .025, .025], [side * .22, -.13, .408], .009).rotation.z = side * .3;
    box(head, shell, [1.14, .88, .83], [0, .035, 0], .20, 'cat-helmet');
    box(head, black, [1.04, .51, .11], [0, .035, .421], .14, 'visor');
    for (const side of [-1, 1]) {
      const ear = part(head, new THREE.ConeGeometry(.25, .51, 4), shell, side * .415, .63, -.015, 'pointed-ear');
      ear.rotation.y = Math.PI / 4; ear.rotation.z = -side * .14;
      const inside = part(head, new THREE.ConeGeometry(.11, .26, 3), trim, side * .425, .64, .12, 'ear-inset');
      inside.rotation.y = Math.PI;
      const eye = box(head, eyeMat, [.25, .085, .035], [side * .24, .065, .486], .03, 'eye');
      eye.rotation.z = side * .17; eyes.push(eye);
      box(head, trim, [.12, .025, .025], [side * .40, -.13, .47], .008);
    }
    box(head, eyeMat, [.15, .025, .025], [.05, -.12, .489], .008).rotation.z = .18;
    box(head, trim, [.06, .13, .04], [.34, .31, .40], .015).rotation.z = -.4;
    box(torso, dark, [.54, .50, .19], [0, .03, -.39], .08, 'backpack');
    // A crooked lightning badge is visible even at game scale.
    const bolt = new THREE.Shape();
    bolt.moveTo(.02, .18); bolt.lineTo(-.12, -.02); bolt.lineTo(-.01, -.02); bolt.lineTo(-.05, -.18); bolt.lineTo(.13, .04); bolt.lineTo(.03, .04); bolt.closePath();
    part(torso, new THREE.ExtrudeGeometry(bolt, { depth: .02, bevelEnabled: false }), trim, 0, .03, -.50, 'lightning-badge').rotation.y = Math.PI;
  } else if (id === 'argon') {
    box(torso, shell, [.80, .82, .66], [0, 0, 0], .23, 'capsule-body');
    box(torso, ivory, [.57, .26, .09], [0, .06, .35], .08, 'chest-panel');
    for (const x of [-.15, 0, .15]) box(torso, trim, [.07, .10, .035], [x, .06, .415], .025);
    ring(torso, trim, .16, .04, [0, -.25, .33]);
    box(head, shell, [.96, 1.17, .86], [0, .15, 0], .36, 'tall-capsule-helmet');
    box(head, ivory, [.85, .63, .13], [0, .12, .418], .22, 'visor-rim');
    box(head, dark, [.74, .51, .105], [0, .135, .50], .19, 'visor');
    for (const side of [-1, 1]) {
      box(head, trim, [.13, .41, .35], [side * .51, .08, -.01], .055, 'ear-fin');
      const eye = box(head, eyeMat, [.19, .06, .025], [side * .18, .13, .562], .024, 'eye');
      eye.rotation.z = side * .055; eyes.push(eye);
    }
    box(head, eyeMat, [.09, .023, .02], [0, -.02, .562], .008);
    // Asymmetric aerials distinguish Argon from the wider robots.
    cylinder(head, trim, .027, .26, [-.20, .81, 0]);
    ball(head, ivory, .064, [-.20, .97, 0]);
    cylinder(head, trim, .027, .14, [.20, .76, 0]);
    ball(head, yellow, .055, [.20, .85, 0]);
    box(torso, ivory, [.53, .47, .23], [0, .04, -.41], .13, 'backpack');
    ring(torso, trim, .15, .035, [0, .04, -.55]);
  } else if (id === 'deepseek') {
    box(torso, shell, [.91, .87, .69], [0, 0, 0], .24, 'diver-body');
    ball(torso, ivory, [.34, .34, .075], [0, -.015, .34], 'whale-belly');
    for (let i = 0; i < 3; i++) box(torso, trim, [.26, .023, .035], [0, .09 - i * .095, .415], .011, 'belly-pleat');
    // Wide whale hood, flippers and three water droplets read from a distance.
    box(head, shell, [1.29, .89, .96], [0, .045, 0], .30, 'whale-hood');
    box(head, ivory, [1.15, .56, .13], [0, -.015, .46], .20, 'belly-visor-rim');
    box(head, black, [1.02, .43, .10], [0, .005, .54], .17, 'visor');
    for (const side of [-1, 1]) {
      const flipper = ball(head, shell, [.16, .34, .18], [side * .69, -.12, -.015], 'whale-flipper');
      flipper.rotation.z = -side * .58;
      eyes.push(box(head, eyeMat, [.12, .16, .027], [side * .22, .045, .598], .04, 'eye'));
      ball(head, shell, [.07, .027, .02], [side * .35, -.09, .601], 'cheek');
    }
    const smile = new THREE.CatmullRomCurve3([new THREE.Vector3(-.09, -.1, .601), new THREE.Vector3(0, -.14, .605), new THREE.Vector3(.09, -.1, .601)]);
    part(head, new THREE.TubeGeometry(smile, 12, .014, 6, false), eyeMat, 0, 0, 0, 'smile');
    ball(head, trim, [.11, .028, .09], [0, .50, -.08], 'blowhole');
    for (const [x, y, tilt] of [[-.18, .70, -.55], [0, .83, 0], [.18, .70, .55]]) {
      const drop = ball(head, shell, [.061, .12, .06], [x, y, -.08], 'water-droplet'); drop.rotation.z = tilt;
    }
    box(torso, trim, [.50, .43, .22], [0, -.02, -.42], .11, 'dive-pack');
    const tail = group(torso, 'whale-tail', [0, .13, -.60]);
    for (const side of [-1, 1]) {
      const fluke = ball(tail, shell, [.23, .095, .13], [side * .17, .10, 0], 'tail-fluke'); fluke.rotation.z = side * .4;
    }
  } else if (id === 'kimi') {
    box(torso, shell, [.82, .87, .68], [0, 0, 0], .23, 'night-flight-suit');
    box(torso, ivory, [.60, .22, .08], [0, -.27, .35], .06, 'lunar-belt');
    crescent(torso, trim, .14, [-.04, .09, .36]);
    for (const [x, y] of [[.23, .18], [.20, -.015]]) ball(torso, ivory, .025, [x, y, .365], 'constellation');
    // Smooth round helmet and a large curved moon crest, distinct from antenna bots.
    box(head, shell, [1.05, 1.03, .91], [0, .08, 0], .34, 'lunar-helmet');
    box(head, trim, [.94, .67, .12], [0, .02, .44], .24, 'gold-visor-rim');
    box(head, black, [.83, .55, .10], [0, .03, .515], .20, 'visor');
    for (const side of [-1, 1]) {
      cylinder(head, trim, .18, .10, [side * .56, .05, -.02]).rotation.z = Math.PI / 2;
      cylinder(head, shell, .11, .12, [side * .58, .05, -.02]).rotation.z = Math.PI / 2;
      eyes.push(box(head, eyeMat, [.105, .175, .028], [side * .18, .07, .573], .042, 'eye'));
    }
    box(head, eyeMat, [.11, .023, .02], [0, -.105, .575], .009, 'smile');
    const moon = crescent(head, trim, .27, [.12, .75, -.05]); moon.rotation.z = -.20;
    star(head, ivory, .075, [.37, .83, .015], 4);
    box(torso, ivory, [.54, .51, .24], [0, .02, -.43], .13, 'moon-pack');
    for (const side of [-1, 1]) cylinder(torso, trim, .10, .20, [side * .16, -.28, -.48], .07, 'moon-pack-thruster');
  } else if (id === 'mistral') {
    box(torso, shell, [.88, .85, .67], [0, 0, 0], .16, 'windbreaker-body');
    box(torso, ivory, [.65, .59, .08], [0, -.035, .36], .06, 'racing-bib');
    const sunset = [material('#f5c34f'), trim, material('#ac3431')];
    for (let i = 0; i < 3; i++) box(torso, sunset[i], [.42, .085, .04], [0, .12 - i * .12, .423], .012, 'sunset-stripe');
    box(head, shell, [1.15, .88, .83], [0, .025, 0], .15, 'pixel-helmet');
    box(head, ivory, [1.04, .54, .13], [0, -.035, .407], .12, 'visor-rim');
    box(head, black, [.92, .43, .11], [0, -.025, .49], .09, 'visor');
    for (const side of [-1, 1]) {
      box(head, trim, [.15, .33, .38], [side * .62, .025, 0], .035, 'square-ear');
      const eye = box(head, eyeMat, [.18, .08, .025], [side * .20, .01, .552], .018, 'eye');
      eye.rotation.z = -side * .2; eyes.push(eye);
    }
    box(head, eyeMat, [.14, .027, .02], [0, -.13, .554], .01, 'smile');
    // Five stepped crown blocks give a strong pixel silhouette, unlike Opus's dome.
    for (let i = 0; i < 5; i++) {
      const h = [.19, .33, .48, .33, .19][i];
      box(head, sunset[Math.min(2, Math.floor(i / 2))], [.19, h, .23], [(i - 2) * .195, .47 + h / 2, -.035], .025, 'stepped-crest');
    }
    box(torso, trim, [.56, .46, .22], [0, .03, -.41], .075, 'turbo-pack');
    for (const side of [-1, 1]) {
      box(torso, shell, [.20, .21, .15], [side * .15, -.15, -.57], .045, 'exhaust');
      box(torso, dark, [.13, .09, .03], [side * .15, -.15, -.66], .02, 'exhaust-slot');
    }
  }

  // Cup is attached to a hand, so carrying and celebrating always remain coherent.
  const cup = group(arms[1].children.find(c => c.name === 'hand'), 'coffee-cup', [0, .04, .21]);
  cylinder(cup, ivory, .115, .24, [0, .045, 0], .15, 'cup');
  cylinder(cup, material('#c97f46'), .136, .085, [0, .045, 0], .148, 'cup-sleeve');
  cylinder(cup, dark, .16, .04, [0, .18, 0], .16, 'lid');
  box(cup, dark, [.09, .022, .045], [0, .205, .04], .009, 'sip-slot');
  const steam = group(cup, 'steam', [0, .25, 0]);
  const steamMat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: .43, roughness: .8, depthWrite: false });
  for (let i = 0; i < 3; i++) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(i * .065 - .065, 0, 0), new THREE.Vector3(i * .065 - .04, .11, 0), new THREE.Vector3(i * .065 - .085, .21, .01)]);
    part(steam, new THREE.TubeGeometry(curve, 10, .012, 5, false), steamMat);
  }
  cup.visible = coffee;

  const stars = group(root, 'stun-stars', [0, 2.85, 0]);
  for (let i = 0; i < 3; i++) star(stars, yellow, .13, [Math.cos(i * Math.PI * 2 / 3) * .43, 0, Math.sin(i * Math.PI * 2 / 3) * .43], 5);
  stars.visible = false;
  const originalMats = new Map();
  const silhouetteMat = material('#26343b', 1, 0);
  let silhouette = false;

  /** Drive with the engine's current visual action. Time is presentation time in seconds. */
  function update(t = 0, pose = 'idle', options = {}) {
    if (!POSES.includes(pose)) throw new Error(`Unknown pose: ${pose}`);
    const cycle = Math.sin(t * 9), sway = Math.sin(t * 2);
    body.position.set(0, .73, 0); body.rotation.set(0, 0, 0);
    torso.rotation.set(0, 0, 0); head.rotation.set(0, 0, 0);
    legs.forEach(leg => leg.rotation.set(0, 0, 0));
    arms.forEach((arm, i) => arm.rotation.set(0, 0, (i === 0 ? -1 : 1) * .12));
    cup.visible = options.carrying ?? (coffee || pose === 'carry');
    stars.visible = pose === 'stunned';
    body.position.y += Math.sin(t * 2.4) * .018;
    head.rotation.z = sway * .025;
    arms[0].rotation.x = Math.sin(t * 2) * .035;
    arms[1].rotation.x = -Math.sin(t * 2) * .035;
    if (pose === 'run') {
      legs[0].rotation.x = cycle * .7; legs[1].rotation.x = -cycle * .7;
      arms[0].rotation.x = -cycle * .6; arms[1].rotation.x = cycle * .6;
      body.position.y += Math.abs(Math.cos(t * 9)) * .095; body.rotation.x = .09;
    } else if (pose === 'carry') {
      arms[1].rotation.x = -1.0; arms[1].rotation.z = -.13;
      head.rotation.x = .04; arms[0].rotation.z = -.18;
    } else if (pose === 'punch') {
      const punch = Math.pow(Math.max(0, Math.sin(t * 5)), 3);
      arms[0].rotation.x = -1.1 - punch * .65; arms[0].rotation.z = -.3;
      arms[1].rotation.x = -.8; arms[1].rotation.z = -.3;
      body.rotation.y = -.2 + punch * .4; head.rotation.y = -.1;
    } else if (pose === 'stunned') {
      body.rotation.z = Math.sin(t * 11) * .07; head.rotation.z = .2;
      arms[0].rotation.z = -.7; arms[1].rotation.z = .7;
      stars.rotation.y = t * 2; stars.position.y = 2.85 + Math.sin(t * 4) * .04;
    } else if (pose === 'wobble') {
      body.rotation.z = Math.sin(t * 3) * .22; body.rotation.x = Math.cos(t * 2) * .12;
      head.rotation.z = -Math.sin(t * 3 + .6) * .14;
      arms[0].rotation.z = -.5 + sway * .2; arms[1].rotation.z = .5 + sway * .2;
      legs[0].rotation.x = Math.sin(t * 4) * .2; legs[1].rotation.x = -Math.sin(t * 4) * .2;
    } else if (pose === 'victory') {
      body.position.y += Math.abs(Math.sin(t * 5)) * .24;
      arms[0].rotation.z = -2.5 + sway * .1; arms[1].rotation.z = 2.5 - sway * .1;
      head.rotation.z = Math.sin(t * 5) * .08;
    }
    if (cup.visible && pose !== 'carry' && pose !== 'victory') arms[1].rotation.x = -.9;
    // Counter-rotate the hand attachment so the coffee stays upright as the arm bends.
    cup.quaternion.copy(arms[1].quaternion).invert();
    steam.rotation.y = Math.sin(t) * .2;
    steam.scale.y = .85 + Math.sin(t * 3) * .15;
    const blink = (t % 4.7) > 4.56 ? .12 : 1;
    eyes.forEach(eye => eye.scale.y = blink);
    root.updateMatrixWorld(true);
  }
  function setSilhouette(enabled) {
    if (silhouette === enabled) return;
    silhouette = enabled;
    root.traverse(object => {
      if (!object.isMesh) return;
      if (enabled) { originalMats.set(object, object.material); object.material = silhouetteMat; }
      else { object.material = originalMats.get(object); }
    });
    if (!enabled) originalMats.clear();
  }
  function dispose() {
    setSilhouette(false);
    const mats = new Set(), geos = new Set();
    root.traverse(o => { if (o.isMesh) { mats.add(o.material); geos.add(o.geometry); } });
    // Cached primitive geometry is shared across characters. Only dispose unique geometry here.
    const shared = new Set(geometryCache.values());
    geos.forEach(g => { if (!shared.has(g)) g.dispose(); });
    mats.forEach(m => m.dispose()); silhouetteMat.dispose(); root.removeFromParent();
  }
  update(0, 'idle');
  return { id, root, update, setSilhouette, dispose, rig: { body, head, torso, arms, legs, cup } };
}

/** Release shared geometry only after every mascot using it has been disposed. */
export function disposeSharedGeometry() {
  geometryCache.forEach(g => g.dispose()); geometryCache.clear();
}
