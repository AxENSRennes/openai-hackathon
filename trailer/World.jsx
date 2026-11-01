import React, { useLayoutEffect, useRef, useState } from 'react';
import { cancelRender, continueRender, delayRender, staticFile } from 'remotion';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createMascot } from '../client/mascots.js';
import { createTakeawayCup } from '../client/mascot-view.js';
import { MASCOT_SCALE } from '../shared/mascots.js';
import takes from './generated/takes.json';

function batchFixed(root) {
  const groups = []; root.traverse(o => { if (o.isGroup) groups.push(o); });
  for (const group of groups) {
    const batches = new Map();
    for (const mesh of group.children) {
      if (!mesh.isMesh || mesh.name === 'eye') continue;
      if (!batches.has(mesh.material)) batches.set(mesh.material, []);
      batches.get(mesh.material).push(mesh);
    }
    for (const [material, meshes] of batches) {
      if (meshes.length < 2) continue;
      const geometries = meshes.map(m => { m.updateMatrix(); return (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix); });
      group.add(new THREE.Mesh(mergeGeometries(geometries), material));
      geometries.forEach(g => g.dispose()); meshes.forEach(m => m.removeFromParent());
    }
  }
}

function cameraFor(shot, state, frame) {
  const hero = state.agents[0], cup = state.cups[0];
  const orbit = -.15 + shot.time * .025;
  const common = { angle: orbit, height: 10, distance: 12 };
  if (shot.id === 'question') return { target: [cup.x - .7, cup.y + .42, cup.z], span: .95, angle: -.35 + shot.time * .035, height: 4, distance: 6 };
  if (shot.id === 'lineup') return { ...common, target: [4.8, .7, 3.6], span: 3.9 - shot.time * .075 };
  if (shot.id === 'brew') return { target: [-5.8, 1.1, -4.45], span: 2.15 - shot.time * .05, angle: .12, height: 8, distance: 12 };
  if (shot.id === 'carry') return { ...common, target: [hero.x + .3, .65, hero.z], span: 2.8, height: 8 };
  if (shot.id === 'slow') {
    const push = Math.max(0, 1 - Math.abs(shot.time - 1.5) / .2);
    const shake = Math.sin(frame * 2.7) * push * .025;
    return { target: [cup.holderId ? hero.x : cup.x, .65, cup.holderId ? hero.z : cup.z], span: 1.9, angle: -.25 + shot.time * .065 + shake, height: 6, distance: 10 };
  }
  if (shot.id === 'aftermath') return { ...common, target: [1.5, .4, .4], span: 6.8 };
  if (shot.id === 'customer') return { target: [7, 1.15, -1.8], span: 2.25 - shot.time * .035, angle: .04, height: 7, distance: 12 };
  if (shot.id === 'instructions') return { ...common, target: [hero.x + .3, .6, hero.z], span: 3.3, height: 9 };
  if (shot.id === 'bet') return { ...common, target: [hero.x - 1.1, .6, hero.z], span: 3.3, height: 9 };
  if (shot.id === 'delivery') return { ...common, target: [7, .9, -.45], span: 2.6, height: 8 };
  return { ...common, target: [3.5, .7, 2.8], span: 6.4 };
}

export function World({ shot, frame }) {
  const host = useRef(null), view = useRef(null), released = useRef(false);
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender('Preparing the office and original mascots'));
  useLayoutEffect(() => {
    let disposed = false;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(1280, 720); renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.04;
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';
    host.current.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#324b3c');
    scene.add(new THREE.HemisphereLight('#fff3d9', '#69816c', 1.6));
    const sun = new THREE.DirectionalLight('#fff0d3', 2.7); sun.position.set(-8, 22, 9); scene.add(sun);
    const fill = new THREE.DirectionalLight('#d9e9ff', .8); fill.position.set(10, 12, -9); scene.add(fill);
    const camera = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, .1, 100);
    const mascots = new Map(), cups = new Map(), chairs = new Map(), puddles = new Map();
    const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 64;
    const ctx = shadowCanvas.getContext('2d'), gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(1, '#ffffff00'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
    const soft = new THREE.CanvasTexture(shadowCanvas);
    for (const agent of takes.lineup.frames[0].agents) {
      const mascot = createMascot(agent.id); batchFixed(mascot.root); mascot.root.scale.setScalar(MASCOT_SCALE);
      const socket = new THREE.Object3D(); socket.position.y = -.075; mascot.rig.cup.add(socket); mascot.socket = socket;
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ color: '#263d2d', map: soft, transparent: true, opacity: .3, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2; mascot.shadow = shadow;
      scene.add(mascot.root, shadow); mascots.set(agent.id, mascot);
    }
    for (const cup of takes.lineup.frames[0].cups) { const mesh = createTakeawayCup(); scene.add(mesh); cups.set(cup.id, mesh); }
    const loader = new GLTFLoader();
    Promise.all(['environment', 'chair'].map(name => loader.loadAsync(staticFile(`assets/${name}.glb`))))
      .then(([environment, chair]) => {
        if (disposed) return;
        scene.add(environment.scene);
        for (const prop of takes.lineup.frames[0].props) { const mesh = clone(chair.scene); scene.add(mesh); chairs.set(prop.id, mesh); }
        view.current = { renderer, scene, camera, mascots, cups, chairs, puddles, environment: environment.scene };
        setReady(true);
      }).catch(error => { if (!disposed) cancelRender(error); });
    return () => {
      disposed = true; view.current = null;
      const geometries = new Set(), materials = new Set(), textures = new Set();
      scene.traverse(o => {
        if (o.geometry) geometries.add(o.geometry);
        for (const mat of o.material ? Array.isArray(o.material) ? o.material : [o.material] : []) {
          materials.add(mat); for (const v of Object.values(mat)) if (v?.isTexture) textures.add(v);
        }
      });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
      renderer.dispose(); renderer.domElement.remove();
    };
  }, []);
  useLayoutEffect(() => {
    if (!ready || !view.current) return;
    try {
      const take = takes[shot.take || shot.id];
      const state = take.frames[Math.min(Math.round(shot.source * take.fps), take.frames.length - 1)];
      const time = shot.source, { renderer, scene, camera, mascots, cups, chairs, puddles, environment } = view.current;
      environment.visible = shot.id !== 'question';
      scene.background.set(shot.id === 'question' ? '#fff3d5' : '#324b3c');
      for (const agent of state.agents) {
        const m = mascots.get(agent.id), { rig } = m;
        const pose = agent.delivered ? 'victory' : agent.fallen ? 'stunned' : agent.action === 'push' ? 'punch' : agent.moving ? 'run' : agent.carrying ? 'carry' : 'idle';
        m.update(pose === 'punch' ? Math.max(0, .48 - agent.pushRemaining) / .48 * Math.PI / 5 : time, pose, { carrying: agent.carrying });
        if (agent.moving && agent.carrying) { rig.arms[1].rotation.x = -1; rig.arms[1].rotation.z = -.13; }
        if (agent.interaction) {
          const progress = 1 - agent.interaction.remaining / agent.interaction.duration, reach = Math.sin(progress * Math.PI);
          rig.arms[1].rotation.x = THREE.MathUtils.lerp(agent.carrying ? -1 : 0, -1.45, reach); rig.body.rotation.x += reach * .15;
        }
        if (agent.fallen) {
          const event = take.events.filter(e => e.type === 'fall' && e.actorId === agent.id && e.time <= time).at(-1);
          let amount = THREE.MathUtils.smoothstep((time - (event?.time ?? time)) / .38, 0, 1);
          if (agent.standingUp) amount = THREE.MathUtils.smoothstep(agent.recovery / 1.75, 0, 1);
          rig.body.rotation.set(-.15 * amount, 0, -Math.PI / 2 * amount); rig.body.position.set(.18 * amount, .73 - .28 * amount, .1 * amount);
          rig.arms[0].rotation.set(-.5 * amount, 0, -.8 * amount); rig.arms[1].rotation.set(-.3 * amount, 0, 1.1 * amount);
        }
        rig.cup.quaternion.copy(rig.arms[1].quaternion).invert();
        // Update the hand matrix before hiding the mascot's decorative cup.
        rig.cup.visible = false;
        m.root.position.set(agent.x, .016, agent.z); m.root.rotation.y = agent.heading; m.root.updateMatrixWorld(true);
        if (agent.fallen) {
          const box = new THREE.Box3(); let lowest = Infinity;
          rig.body.traverseVisible(node => {
            if (!node.isMesh) return;
            if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
            box.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld);
            lowest = Math.min(lowest, box.min.y);
          });
          if (lowest < .016) rig.body.position.y += (.016 - lowest) / MASCOT_SCALE;
          m.root.updateMatrixWorld(true);
        }
        m.root.visible = shot.id !== 'question';
        m.shadow.position.set(agent.x, .025, agent.z); m.shadow.visible = m.root.visible;
      }
      for (const cup of state.cups) {
        const mesh = cups.get(cup.id); mesh.visible = !cup.broken && (shot.id !== 'question' || cup === state.cups[0]);
        mesh.scale.setScalar(shot.id === 'question' ? 2.7 : .9);
        if (cup.holderId) {
          const holder = mascots.get(cup.holderId); holder.socket.getWorldPosition(mesh.position); mesh.rotation.set(0, holder.root.rotation.y, 0);
        } else { mesh.position.set(cup.x, cup.y, cup.z); mesh.quaternion.set(cup.rotation.x, cup.rotation.y, cup.rotation.z, cup.rotation.w); }
        mesh.getObjectByName('Coffee').visible = cup.coffee > 0;
      }
      for (const prop of state.props) { const mesh = chairs.get(prop.id); mesh.visible = shot.id !== 'question'; mesh.position.set(prop.x, Math.max(0, prop.y - .52), prop.z); mesh.quaternion.set(prop.rotation.x, prop.rotation.y, prop.rotation.z, prop.rotation.w); }
      for (const mesh of puddles.values()) mesh.visible = false;
      for (const spill of state.spills) {
        let mesh = puddles.get(spill.id);
        if (!mesh) { mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshStandardMaterial({ color: '#664028', roughness: .2, transparent: true, opacity: .85 })); mesh.rotation.x = -Math.PI / 2; scene.add(mesh); puddles.set(spill.id, mesh); }
        mesh.visible = true; mesh.position.set(spill.x, .027, spill.z); mesh.scale.set(spill.radius, spill.radius * .7, 1);
      }
      const c = cameraFor(shot, state, frame), target = new THREE.Vector3(...c.target);
      camera.left = -c.span * 16 / 9; camera.right = c.span * 16 / 9; camera.top = c.span; camera.bottom = -c.span;
      camera.position.set(target.x + Math.sin(c.angle) * c.distance, target.y + c.height, target.z + Math.cos(c.angle) * c.distance);
      camera.lookAt(target); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      renderer.render(scene, camera);
      if (!released.current) { released.current = true; continueRender(handle); }
    } catch (error) { cancelRender(error); }
  }, [shot.id, shot.source, frame, ready, handle]);
  return <div ref={host} style={{ position: 'absolute', inset: 0 }} />;
}
