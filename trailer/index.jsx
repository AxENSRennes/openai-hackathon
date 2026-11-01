import React, { useLayoutEffect, useRef, useState } from 'react';
import { AbsoluteFill, Composition, cancelRender, continueRender, delayRender, registerRoot, staticFile, useCurrentFrame } from 'remotion';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createMascot } from '../client/mascots.js';
import { createTakeawayCup } from '../client/mascot-view.js';
import { MASCOT_SCALE } from '../shared/mascots.js';
import replay from './physics-take.json';

// A camera/physics proof, separate from the eventual trailer edit.
function PhysicsTake() {
  const frame = useCurrentFrame();
  const host = useRef(null), view = useRef(null);
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender('Loading the recorded office take'));
  const released = useRef(false);
  useLayoutEffect(() => {
    let disposed = false;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(1280, 720);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.03;
    host.current.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#4b6457');
    scene.add(new THREE.HemisphereLight('#fff3d9', '#69816c', 1.6));
    const sun = new THREE.DirectionalLight('#fff0d3', 2.7);
    sun.position.set(-8, 22, 9); scene.add(sun);
    const fill = new THREE.DirectionalLight('#d9e9ff', .8);
    fill.position.set(10, 12, -9); scene.add(fill);
    const camera = new THREE.OrthographicCamera(-6.4, 6.4, 3.6, -3.6, .1, 100);
    const mascots = new Map(), cups = new Map(), chairs = new Map();
    for (const agent of replay.frames[0].agents) {
      const mascot = createMascot(agent.id);
      mascot.root.scale.setScalar(MASCOT_SCALE);
      scene.add(mascot.root); mascots.set(agent.id, mascot);
    }
    for (const cup of replay.frames[0].cups) {
      const mesh = createTakeawayCup(); scene.add(mesh); cups.set(cup.id, mesh);
    }
    const loader = new GLTFLoader();
    Promise.all(['environment', 'chair'].map(name => loader.loadAsync(staticFile(`assets/${name}.glb`))))
      .then(([environment, chair]) => {
        if (disposed) return;
        scene.add(environment.scene);
        for (const prop of replay.frames[0].props) {
          const mesh = clone(chair.scene); scene.add(mesh); chairs.set(prop.id, mesh);
        }
        view.current = { renderer, scene, camera, mascots, cups, chairs };
        setReady(true);
      }).catch(error => { if (!disposed) cancelRender(error); });
    return () => {
      disposed = true; view.current = null;
      for (const mascot of mascots.values()) mascot.dispose();
      const geometries = new Set(), materials = new Set(), textures = new Set();
      scene.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        for (const mat of object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : []) {
          materials.add(mat);
          for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
        }
      });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
      renderer.dispose(); renderer.domElement.remove();
    };
  }, []);
  useLayoutEffect(() => {
    if (!ready || !view.current) return;
    try {
      const { renderer, scene, camera, mascots, cups, chairs } = view.current;
      const state = replay.frames[Math.min(frame, replay.frames.length - 1)];
      const time = state.tick / replay.physicsFps;
      for (const agent of state.agents) {
        const mascot = mascots.get(agent.id);
        const pose = agent.fallen ? 'stunned' : agent.action === 'push' ? 'punch' : agent.moving ? 'run' : agent.carrying ? 'carry' : 'idle';
        const punchTime = Math.max(0, .48 - (agent.pushRemaining || 0)) / .48 * Math.PI / 5;
        mascot.update(pose === 'punch' ? punchTime : time, pose, { carrying: agent.carrying });
        if (agent.fallen) {
          const fallEvent = replay.events.filter(e => e.type === 'fall' && e.actorId === agent.id && e.time <= time).at(-1);
          const amount = THREE.MathUtils.smoothstep((time - (fallEvent?.time ?? time)) / .38, 0, 1);
          mascot.rig.body.rotation.z = -Math.PI / 2 * amount;
          mascot.rig.body.position.y -= .28 * amount;
        }
        mascot.root.position.set(agent.x, agent.y || .016, agent.z);
        mascot.root.rotation.y = agent.heading;
      }
      for (const cup of state.cups) {
        const mesh = cups.get(cup.id); mesh.visible = !cup.broken;
        mesh.position.set(cup.x, cup.y, cup.z);
        mesh.quaternion.set(cup.rotation.x, cup.rotation.y, cup.rotation.z, cup.rotation.w);
      }
      for (const prop of state.props) {
        const mesh = chairs.get(prop.id); mesh.position.set(prop.x, Math.max(0, prop.y - .52), prop.z);
        mesh.quaternion.set(prop.rotation.x, prop.rotation.y, prop.rotation.z, prop.rotation.w);
      }
      // Camera motion depends only on the requested frame, never on wall time.
      const target = new THREE.Vector3(3.5, .7, 2.8);
      const angle = -.14 + frame / replay.fps * .025;
      camera.position.set(target.x + Math.sin(angle) * 12, 12, target.z + Math.cos(angle) * 12);
      camera.lookAt(target); camera.updateMatrixWorld();
      renderer.render(scene, camera);
      if (!released.current) { released.current = true; continueRender(handle); }
    } catch (error) { cancelRender(error); }
  }, [frame, ready, handle]);
  return <AbsoluteFill style={{ background: '#4b6457', fontFamily: 'Arial, sans-serif' }}>
    <div ref={host} />
    <div style={{ position: 'absolute', top: 32, left: 40, color: '#fff5dc', fontSize: 20, letterSpacing: 3 }}>COFFEE RUN / CAMERA TEST</div>
    <div style={{ position: 'absolute', bottom: 30, left: 40, color: '#fff5dc', fontSize: 16 }}>Directed physics replay · Rapier 60 Hz · Frame {frame}</div>
  </AbsoluteFill>;
}

registerRoot(() => <Composition id="PhysicsTake" component={PhysicsTake} width={1280} height={720} fps={replay.fps} durationInFrames={replay.frames.length - 1} />);
