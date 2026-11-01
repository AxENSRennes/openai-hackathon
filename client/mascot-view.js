import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createMascot, disposeSharedGeometry } from './mascots.js';
import { MASCOT_SCALE } from '../shared/mascots.js';

const clamp = THREE.MathUtils.clamp;
const smooth = value => THREE.MathUtils.smoothstep(value, 0, 1);
let instances = 0;
const retiredGeometry = new Set();

function mergeFixedParts(root) {
  // Only parent groups and eyes animate. Bake other mesh transforms by material.
  const parents = []; root.traverse(node => { if (node.isGroup) parents.push(node); });
  for (const parent of parents) {
    const batches = new Map();
    for (const mesh of parent.children) {
      if (!mesh.isMesh || mesh.name === 'eye') continue;
      if (!batches.has(mesh.material)) batches.set(mesh.material, []);
      batches.get(mesh.material).push(mesh);
    }
    for (const [material, meshes] of batches) {
      if (meshes.length < 2) continue;
      const parts = meshes.map(mesh => {
        mesh.updateMatrix();
        return (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(mesh.matrix);
      });
      const geometry = mergeGeometries(parts);
      for (const part of parts) part.dispose();
      const merged = new THREE.Mesh(geometry, material); merged.name = `Fixed-${parent.name}`;
      parent.add(merged);
      for (const mesh of meshes) { retiredGeometry.add(mesh.geometry); mesh.removeFromParent(); }
    }
  }
}

/** Keep the original seven designs and poses; add the game's physical action states. */
export function createRunnerMascot(id) {
  const mascot = createMascot(id);
  instances++;
  const { root, rig } = mascot;
  mergeFixedParts(root);
  root.scale.setScalar(MASCOT_SCALE); root.position.y = .016;
  const socket = new THREE.Object3D(); socket.name = 'HandSocket';
  socket.position.y = -.075; rig.cup.add(socket);
  const stars = root.getObjectByName('stun-stars');
  const nodes = [rig.body, rig.torso, rig.head, ...rig.arms, ...rig.legs];
  const previous = nodes.map(node => ({ position: node.position.clone(), quaternion: node.quaternion.clone() }));
  let action = null, pose = 'idle', actionTime = 0, strideTime = 0, disposed = false;
  const headPosition = new THREE.Vector3();
  const targetRotation = new THREE.Quaternion();

  function reset() { action = null; actionTime = 0; strideTime = 0; }

  function update(dt, time, agent = {}, phase = 'betting', cup = null) {
    const carrying = !!agent.carrying;
    let next = phase === 'betting' ? 'idle' : agent.delivered ? 'victory'
      : agent.fallen ? agent.action === 'recover' ? 'recover' : 'fall'
      : phase === 'results' ? carrying ? 'carry' : 'idle'
      : agent.action || 'idle';
    if (next === 'carry' && !carrying) next = agent.moving ? 'run' : 'idle';
    if (next !== action) {
      nodes.forEach((node, i) => { previous[i].position.copy(node.position); previous[i].quaternion.copy(node.quaternion); });
      action = next; actionTime = 0;
    }
    actionTime += dt;
    const speed = Math.hypot(agent.vx || 0, agent.vz || 0);
    const moving = phase === 'racing' && !!agent.moving && ['run', 'carry'].includes(action);
    strideTime += dt * (moving ? clamp(speed / .95, .5, 3.5) : 0);
    pose = action === 'push' ? 'punch' : ['fall', 'recover'].includes(action) ? 'stunned'
      : action === 'victory' ? 'victory' : action === 'interact' ? carrying ? 'carry' : 'idle'
      : moving ? 'run' : carrying ? 'carry' : 'idle';
    if (carrying && cup?.slosh > .42 && ['run', 'carry'].includes(action)) pose = 'wobble';
    const punchTime = clamp(1 - (agent.pushRemaining ?? Math.max(0, .48 - actionTime)) / .48, 0, 1) * Math.PI / 5;
    mascot.update(pose === 'punch' ? punchTime : pose === 'run' ? strideTime : time, pose, { carrying });

    if (moving && carrying) {
      // Keep the original carry arm while the original run cycle moves the legs.
      rig.arms[1].rotation.x = -1; rig.arms[1].rotation.z = -.13;
      if (pose === 'wobble') {
        rig.legs[0].rotation.x = Math.sin(strideTime * 9) * .7;
        rig.legs[1].rotation.x = -rig.legs[0].rotation.x;
      }
    }
    if (action === 'interact') {
      const interaction = agent.interaction;
      const progress = interaction ? clamp(1 - interaction.remaining / interaction.duration, 0, 1) : clamp(actionTime / .65, 0, 1);
      const reach = Math.sin(progress * Math.PI);
      rig.body.rotation.x += reach * .15;
      rig.arms[1].rotation.x = THREE.MathUtils.lerp(carrying ? -1 : 0, -1.45, reach);
      rig.arms[1].rotation.z = -.1;
      rig.head.rotation.x += reach * .12;
    }
    if (action === 'fall' || action === 'recover') {
      const fall = action === 'recover' ? 1 - smooth(1 - (agent.recovery ?? Math.max(0, .65 - actionTime)) / .65) : smooth(actionTime / .38);
      const tuck = action === 'recover' ? Math.sin(clamp(1 - (agent.recovery ?? .65) / .65, 0, 1) * Math.PI) : 0;
      rig.body.position.set(.18 * fall, .73 - .28 * fall - tuck * .12, .1 * fall);
      rig.body.rotation.set(-.15 * fall, 0, -Math.PI / 2 * fall);
      rig.torso.rotation.x = -.2 * fall - tuck * .3;
      rig.head.rotation.z = .15 * fall;
      rig.arms[0].rotation.set(-.5 * fall, 0, -.8 * fall);
      rig.arms[1].rotation.set(-.3 * fall, 0, 1.1 * fall);
      rig.legs[0].rotation.x = .65 * fall + tuck * .5;
      rig.legs[1].rotation.x = -.3 * fall - tuck * .6;
    }
    const blend = smooth(actionTime / (action === 'fall' ? .08 : .14));
    nodes.forEach((node, i) => {
      node.position.lerpVectors(previous[i].position, node.position, blend);
      targetRotation.copy(node.quaternion);
      node.quaternion.slerpQuaternions(previous[i].quaternion, targetRotation, blend);
    });
    rig.cup.quaternion.copy(rig.arms[1].quaternion).invert();
    // The persistent server cup is the only rendered cup, including during victory.
    rig.cup.visible = false;
    root.updateMatrixWorld(true);
    if (stars.visible) {
      rig.head.getWorldPosition(headPosition); root.worldToLocal(headPosition);
      stars.position.copy(headPosition); stars.position.y += .65;
    }
    root.userData.action = action; root.userData.pose = pose;
  }

  function dispose() {
    if (disposed) return;
    disposed = true; mascot.dispose();
    if (--instances === 0) {
      disposeSharedGeometry();
      for (const geometry of retiredGeometry) geometry.dispose();
      retiredGeometry.clear();
    }
  }
  update(1, 0);
  return { root, socket, rig, update, reset, dispose };
}

/** The library's ivory takeaway cup, sized for persistent world-space ownership. */
export function createTakeawayCup() {
  const root = new THREE.Group(); root.name = 'TakeawayCup';
  const ivory = new THREE.MeshStandardMaterial({ color: '#fff1d7', roughness: .38 });
  const sleeve = new THREE.MeshStandardMaterial({ color: '#c97f46', roughness: .38 });
  const dark = new THREE.MeshStandardMaterial({ color: '#263c43', roughness: .28, metalness: .16 });
  const coffee = new THREE.MeshStandardMaterial({ color: '#633923', roughness: .25 });
  const add = (geometry, material, y, name) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.y = y; mesh.name = name; root.add(mesh); return mesh;
  };
  add(new THREE.CylinderGeometry(.15, .115, .24, 24), ivory, .12, 'Cup');
  add(new THREE.CylinderGeometry(.148, .136, .085, 24), sleeve, .12, 'Sleeve');
  add(new THREE.CylinderGeometry(.16, .16, .04, 24), dark, .255, 'Lid');
  const sip = add(new THREE.BoxGeometry(.09, .022, .045), dark, .28, 'SipSlot'); sip.position.z = .04;
  // A small opening in the lid exposes the coffee; the HUD reports the exact amount.
  const liquid = add(new THREE.BoxGeometry(.062, .005, .025), coffee, .293, 'Coffee'); liquid.position.z = .04;
  liquid.userData.fillRange = [.293, .293];
  root.scale.setScalar(.9);
  return root;
}
