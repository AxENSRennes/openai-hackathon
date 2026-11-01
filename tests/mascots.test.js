import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RUNNERS, LEVEL } from '../shared/level.js';
import { createMascot, POSES } from '../client/mascots.js';
import { createRunnerMascot, createTakeawayCup } from '../client/mascot-view.js';
import { CUP_HOLD } from '../shared/mascots.js';

const expected = ['Astra', 'Opus', 'Grokbot', 'Argon', 'DeepSeek', 'Kimi', 'Mistral'];
const position = object => object.getWorldPosition(new THREE.Vector3());
function finite(root) {
  root.traverse(object => assert.ok([...object.position, ...object.quaternion, ...object.scale].every(Number.isFinite), object.name));
}

function visibleGeometry(root) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3(); let meshes = 0, triangles = 0;
  const vertex = new THREE.Vector3();
  root.traverseVisible(node => {
    if (!node.isMesh) return;
    meshes++; triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
    const positions = node.geometry.attributes.position;
    for (let index = 0; index < positions.count; index++) bounds.expandByPoint(vertex.fromBufferAttribute(positions, index).applyMatrix4(node.matrixWorld));
  });
  return { meshes, triangles, bounds };
}

test('merging fixed parts preserves the original seven silhouettes and triangles while reducing draw calls', () => {
  for (const runner of RUNNERS) {
    const original = createMascot(runner.id), view = createRunnerMascot(runner.id);
    try {
      original.root.scale.copy(view.root.scale); original.root.position.copy(view.root.position);
      const before = visibleGeometry(original.root), after = visibleGeometry(view.root);
      assert.equal(before.triangles, after.triangles, runner.id);
      assert.ok(after.meshes < before.meshes, runner.id);
      assert.ok(before.bounds.min.distanceTo(after.bounds.min) < 1e-6, runner.id);
      assert.ok(before.bounds.max.distanceTo(after.bounds.max) < 1e-6, runner.id);
    } finally { original.dispose(); view.dispose(); }
  }
});

test('all seven original identities have a spawn and animate every original pose', () => {
  assert.deepEqual(RUNNERS.map(runner => runner.name), expected);
  assert.equal(LEVEL.spawns.length, RUNNERS.length);
  for (const runner of RUNNERS) {
    const mascot = createMascot(runner.id);
    try {
      for (const pose of POSES) for (const t of [0, .3, 1.1, 3.7]) {
        mascot.update(t, pose, { carrying: true }); finite(mascot.root);
      }
    } finally { mascot.dispose(); }
  }
});

test('every runner walks while carrying, stops its legs at rest, and exposes one persistent cup socket', () => {
  for (const runner of RUNNERS) {
    const view = createRunnerMascot(runner.id);
    try {
      const agent = { action: 'carry', carrying: true, moving: true, vx: 1.5, vz: 0 };
      view.update(.2, .2, agent, 'racing');
      const leg = view.rig.legs[0].quaternion.clone(), socket = position(view.socket);
      view.update(.1, .3, agent, 'racing');
      assert.ok(leg.angleTo(view.rig.legs[0].quaternion) > .05, runner.id);
      assert.equal(view.rig.cup.visible, false, 'Only the authoritative world cup is rendered');
      assert.ok(socket.distanceTo(position(view.socket)) > .001);
      const still = { ...agent, moving: false, vx: 0 };
      view.update(.2, .5, still, 'racing');
      const stopped = view.rig.legs[0].quaternion.clone();
      view.update(.2, .7, still, 'racing');
      assert.ok(stopped.angleTo(view.rig.legs[0].quaternion) < 1e-6);
      assert.ok(Math.abs(view.rig.arms[1].rotation.x + 1) < 1e-6);
      view.update(.2, 0, still, 'racing');
      const cupBase = position(view.socket);
      assert.ok(cupBase.distanceTo(new THREE.Vector3(CUP_HOLD.right, CUP_HOLD.bodyY - .17, CUP_HOLD.forward)) < .02, 'The physical release position must match the carry socket');
      finite(view.root);
    } finally { view.dispose(); }
  }
});

test('all seven falls stay down, recover to standing, reach for objects, and celebrate without a phantom cup', () => {
  for (const runner of RUNNERS) {
    const view = createRunnerMascot(runner.id);
    try {
      const standingHeight = position(view.rig.head).y;
      view.update(.5, .5, { fallen: true, action: 'fall' }, 'racing');
      const fallenHeight = position(view.rig.head).y;
      assert.ok(fallenHeight < standingHeight * .7);
      assert.ok(visibleGeometry(view.root).bounds.min.y >= -1e-5, 'Fallen geometry must not sink through the floor');
      view.update(3, 3.5, { fallen: true, action: 'fall' }, 'racing');
      assert.ok(Math.abs(position(view.rig.head).y - fallenHeight) < 1e-6, 'A fallen runner must not loop back to standing');
      view.update(.2, 3.7, { fallen: true, action: 'recover', recovery: .4 }, 'racing');
      view.update(.4, 4.1, { fallen: true, action: 'recover', recovery: 0 }, 'racing');
      assert.ok(Math.abs(position(view.rig.head).y - standingHeight) < .02);
      view.update(.2, 4.3, { action: 'interact', interaction: { remaining: .3, duration: .6 } }, 'racing');
      assert.ok(view.rig.arms[1].rotation.x < -1.4);
      view.update(.2, 4.5, { delivered: true }, 'results');
      assert.equal(view.root.userData.pose, 'victory');
      assert.equal(view.rig.cup.visible, false, 'Delivery leaves the persistent cup with the customer');
      assert.ok(Math.abs(view.rig.arms[0].rotation.z) > 2);
      view.reset(); view.update(.2, 0, {}, 'betting');
      assert.equal(view.root.userData.pose, 'idle');
      finite(view.root);
    } finally { view.dispose(); }
  }
});

test('wobble follows actual sloshing and the takeaway cup has one independent liquid surface', () => {
  const view = createRunnerMascot('mistral'), cup = createTakeawayCup();
  try {
    const agent = { action: 'carry', carrying: true, moving: true, vx: 2 };
    view.update(.2, .2, agent, 'racing', { slosh: .8 });
    assert.equal(view.root.userData.pose, 'wobble');
    view.update(.2, .4, agent, 'racing', { slosh: 0 });
    assert.equal(view.root.userData.pose, 'run');
    const liquids = []; cup.traverse(node => { if (/coffee/i.test(node.name)) liquids.push(node); });
    assert.equal(liquids.length, 1);
    assert.equal(liquids[0].isMesh, true, 'Liquid updates must never move the cup attachment group');
    assert.ok(new THREE.Box3().setFromObject(cup).min.y > -1e-6);
  } finally {
    view.dispose(); cup.traverse(node => { node.geometry?.dispose(); node.material?.dispose(); });
  }
});
