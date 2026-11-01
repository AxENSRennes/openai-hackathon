import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LEVEL, RUNNERS } from '../shared/level.js';
import { CameraDirector } from './camera.js';
import { GameAudio } from './audio.js';
import { createRunnerMascot, createTakeawayCup } from './mascot-view.js';

const LABELS = { steal: 'SNATCH!', push: 'SHOVE!', drop: 'DROPPED!', break: 'SMASH!', recover: 'BACK UP', ready: 'READY!' };
const damp = THREE.MathUtils.damp;
const angleLerp = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

export class CoffeeScene {
  constructor(container) {
    this.container = container;
    this.disposed = false;
    this.state = null;
    this.selected = RUNNERS[0].id;
    this.characters = new Map(); this.cups = new Map(); this.chairs = new Map(); this.puddles = new Map(); this.stationSigns = new Map();
    this.seenEvents = new Set(); this.frames = []; this.particles = []; this.popups = []; this.textures = new Set(); this.materials = new Set(); this.effectMaterials = new Map(); this.shards = new Map();
    this.lastRound = null; this.time = 0; this.audio = new GameAudio();
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#4b6457');
    this.scene.fog = new THREE.Fog('#4b6457', 62, 110);
    this.camera = new THREE.OrthographicCamera(-17, 17, 10, -10, .1, 120);
    this.director = new CameraDirector(this.camera);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    const gl = this.renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    const device = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : '';
    this.softwareRenderer = /swiftshader|llvmpipe|softpipe/i.test(device);
    this.lowPowerRendering = this.softwareRenderer && new URLSearchParams(window.location.search).get('quality') !== 'full';
    if (this.lowPowerRendering) {
      this.renderer.dispose(); this.renderer.forceContextLoss();
      this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
    }
    this.renderer.setPixelRatio(this.lowPowerRendering ? .5 : Math.min(window.devicePixelRatio || 1, 1.6));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping; this.renderer.toneMappingExposure = 1.03;
    this.renderer.shadowMap.enabled = !this.lowPowerRendering; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-label', 'Seven mascots compete to deliver a coffee through the shared office');
    this.renderer.domElement.setAttribute('role', 'img');
    container.appendChild(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight('#fff3d9', '#69816c', 1.6));
    const sunlight = new THREE.DirectionalLight('#fff0d3', 2.7); sunlight.position.set(-8, 22, 9);
    sunlight.castShadow = true; sunlight.shadow.mapSize.set(2048, 2048);
    Object.assign(sunlight.shadow.camera, { left: -16, right: 16, top: 14, bottom: -14, near: .5, far: 55 });
    sunlight.shadow.normalBias = .025; sunlight.shadow.bias = -.00015; sunlight.shadow.radius = 3;
    this.scene.add(sunlight);
    const fill = new THREE.DirectionalLight('#d9e9ff', .8); fill.position.set(10, 12, -9); this.scene.add(fill);
    this.world = new THREE.Group(); this.scene.add(this.world);
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container);
    this.onPointer = event => this.pick(event); this.renderer.domElement.addEventListener('pointerup', this.onPointer);
    this.lastTime = performance.now(); this.resize();
    this.ready = this.loadAssets().catch(error => {
      if (this.disposed) return;
      console.error('Game assets could not load', error);
      container.dispatchEvent(new CustomEvent('scene-error', { detail: { message: 'The office assets could not load. Reload to try again.' } }));
    });
    let renderedAt = 0;
    this.renderer.setAnimationLoop(now => {
      if (this.lowPowerRendering && now - renderedAt < 1000 / 24) return;
      renderedAt = now; this.animate();
    });
  }
  registerAsset(root) {
    const softwareMaterials = new Map();
    root.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = true; object.receiveShadow = true;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        this.materials.add(material);
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
          if (!material[key]) continue;
          material[key].anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
          this.textures.add(material[key]);
        }
      }
      if (this.lowPowerRendering) {
        const convert = material => {
          if (!softwareMaterials.has(material)) {
            const replacement = new THREE.MeshLambertMaterial({ color: material.color, map: material.map, emissive: material.emissive, emissiveMap: material.emissiveMap, transparent: material.transparent, opacity: material.opacity, side: material.side });
            replacement.name = material.name; this.materials.add(replacement); softwareMaterials.set(material, replacement);
          }
          return softwareMaterials.get(material);
        };
        object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
      }
    });
    return root;
  }
  async loadAssets() {
    THREE.Cache.enabled = true;
    const manager = new THREE.LoadingManager();
    const names = ['environment', 'chair'];
    const progress = new Map(names.map(name => [name, 0]));
    const report = () => {
      if (!this.disposed) this.container.dispatchEvent(new CustomEvent('scene-progress', { detail: { percent: Math.floor([...progress.values()].reduce((sum, value) => sum + value, 0) / names.length * 100) } }));
    };
    manager.onProgress = report;
    const loader = new GLTFLoader(manager);
    const [environment, chair] = await Promise.all(names.map(async name => {
      const asset = await loader.loadAsync(`/assets/${name}.glb`, event => {
        if (event.total) progress.set(name, Math.min(.85, event.loaded / event.total * .85));
        report();
      });
      progress.set(name, 1); report(); return asset;
    }));
    if (this.disposed) { for (const asset of [environment, chair]) this.disposeAsset(asset.scene); return; }
    this.world.add(this.registerAsset(environment.scene));
    this.mugAsset = this.registerAsset(createTakeawayCup());
    this.registerAsset(chair.scene);
    for (const [index, runner] of RUNNERS.entries()) {
      const mascot = createRunnerMascot(runner.id), model = this.registerAsset(mascot.root);
      const root = new THREE.Group();
      root.add(model); this.world.add(root); root.position.set(LEVEL.spawns[index].x, 0, LEVEL.spawns[index].z);
      const marker = this.floorMarker(runner.color, .42, .035); marker.position.y = .025; root.add(marker);
      const shadow = this.contactShadow(.67); root.add(shadow);
      const label = this.makeSprite(256, 96, 1.15, .43); label.sprite.position.y = 2.14; root.add(label.sprite);
      this.characters.set(runner.id, { root, model, mascot, socket: mascot.socket, runner, label, labelKey: '', agent: null });
    }
    for (const prop of LEVEL.chairs) {
      const root = clone(chair.scene); root.position.set(prop.x, 0, prop.z); this.world.add(root); root.add(this.contactShadow(.65)); this.chairs.set(prop.id, root);
    }
    this.createGate(); this.createIndicators();
    if (this.state) this.syncState(this.state);
    this.container.dispatchEvent(new CustomEvent('scene-ready', { detail: { softwareRenderer: this.softwareRenderer, lowPowerRendering: this.lowPowerRendering } }));
  }
  material(color, options = {}) {
    const Material = this.lowPowerRendering ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
    const parameters = { color, ...options }; if (this.lowPowerRendering) delete parameters.roughness; else parameters.roughness ??= .72;
    const material = new Material(parameters); this.materials.add(material); return material;
  }
  effectMaterial(color) {
    if (!this.effectMaterials.has(color)) this.effectMaterials.set(color, this.material(color, { roughness: .45, side: THREE.DoubleSide }));
    return this.effectMaterials.get(color);
  }
  softTexture() {
    if (this.softMap) return this.softMap;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d'), gradient = ctx.createRadialGradient(32, 32, 3, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
    this.softMap = new THREE.CanvasTexture(canvas); this.textures.add(this.softMap); return this.softMap;
  }
  contactShadow(size) {
    const material = new THREE.MeshBasicMaterial({ color: '#34473b', map: this.softTexture(), transparent: true, opacity: .23, depthWrite: false }); this.materials.add(material);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(size * 2, size * 2), material); shadow.rotation.x = -Math.PI / 2; shadow.position.y = .022; return shadow;
  }
  floorMarker(color, radius, thickness) {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8, depthWrite: false }); this.materials.add(material);
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius, radius + thickness, 48), material); ring.rotation.x = -Math.PI / 2; return ring;
  }
  makeSprite(width, height, worldWidth, worldHeight) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; this.textures.add(texture);
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }); this.materials.add(material);
    const sprite = new THREE.Sprite(material); sprite.scale.set(worldWidth, worldHeight, 1); sprite.renderOrder = 8;
    return { canvas, texture, sprite };
  }
  paintLabel(view, agent) {
    const coffee = Math.round(agent.coffee || 0), selected = view.runner.id === this.selected;
    const key = `${coffee}-${agent.carrying}-${agent.fallen}-${selected}`;
    if (key === view.labelKey) return; view.labelKey = key;
    const { canvas, texture } = view.label, ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = selected ? '#253e32' : '#fff7df'; ctx.beginPath(); ctx.roundRect(7, 5, 242, 77, 22); ctx.fill();
    view.label.sprite.scale.set(selected ? 1.55 : 1.15, selected ? .58 : .43, 1);
    ctx.fillStyle = view.runner.color; ctx.beginPath(); ctx.arc(34, 36, 10, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = '800 32px Arial'; ctx.fillStyle = selected ? '#fff7df' : '#253e32';
    ctx.fillText(view.runner.name, 54, 38);
    if (agent.carrying) {
      ctx.font = '800 24px Arial'; ctx.textAlign = 'right'; ctx.fillText(`${coffee}%`, 231, 38);
      ctx.fillStyle = '#bdb69e'; ctx.fillRect(26, 61, 204, 9); ctx.fillStyle = coffee >= 55 ? '#8ca94e' : '#bd4f30'; ctx.fillRect(26, 61, 204 * coffee / 100, 9);
      ctx.fillStyle = selected ? '#fff7df' : '#253e32'; ctx.fillRect(26 + 204 * .55, 58, 3, 15);
    }
    if (agent.fallen) { ctx.fillStyle = '#bd4f30'; ctx.font = '900 36px Arial'; ctx.textAlign = 'right'; ctx.fillText('!', 231, 38); }
    texture.needsUpdate = true;
  }
  createGate() {
    this.gate = new THREE.Group(); this.gate.position.set(LEVEL.gate.x, 0, LEVEL.gate.z); this.world.add(this.gate);
    const slab = new THREE.Mesh(new RoundedBoxGeometry(.22, .98, LEVEL.gate.d, 3, .045), this.material('#e8b745'));
    slab.position.y = .65; slab.castShadow = true; slab.receiveShadow = true; this.gate.add(slab);
    for (let i = 0; i < 5; i++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(.235, .11, .33), this.material('#34473c'));
      stripe.position.set(0, 1.01, -1.07 + i * .53); this.gate.add(stripe);
    }
    const label = this.makeSprite(256, 80, 1.35, .42); label.sprite.position.set(0, 1.65, 0); this.gate.add(label.sprite); this.gateLabel = label;
  }
  createIndicators() {
    for (const station of LEVEL.stations) {
      const sign = this.makeSprite(256, 112, 1.65, .72); sign.sprite.position.set(station.x, 2.75, station.z - .6); this.world.add(sign.sprite); this.stationSigns.set(station.id, { ...sign, key: '' });
    }
    this.deliveryRing = this.floorMarker('#f2cb65', .66, .07); this.deliveryRing.position.set(LEVEL.customer.delivery.x, .035, LEVEL.customer.delivery.z); this.world.add(this.deliveryRing);
    const sign = this.makeSprite(384, 96, 2.4, .6); sign.sprite.position.set(7, 2.88, -1.8); this.world.add(sign.sprite);
    const ctx = sign.canvas.getContext('2d'); ctx.fillStyle = '#fff6db'; ctx.beginPath(); ctx.roundRect(4, 5, 376, 76, 20); ctx.fill(); ctx.fillStyle = '#314a3b'; ctx.font = '800 31px Arial'; ctx.textAlign = 'center'; ctx.fillText('ONE COFFEE  ·  55% MIN', 192, 52); sign.texture.needsUpdate = true;
    this.selection = this.floorMarker('#fff3ce', .54, .055); this.selection.position.y = .04; this.world.add(this.selection);
    this.contextRing = this.floorMarker('#d6ed87', .24, .045); this.world.add(this.contextRing);
    this.contextHint = this.makeSprite(96, 96, .42, .42); this.world.add(this.contextHint.sprite);
    const hint = this.contextHint.canvas.getContext('2d'); hint.fillStyle = '#253e32'; hint.beginPath(); hint.arc(48, 48, 43, 0, Math.PI * 2); hint.fill(); hint.strokeStyle = '#d6ed87'; hint.lineWidth = 6; hint.stroke(); hint.fillStyle = '#fff7df'; hint.textAlign = 'center'; hint.font = '900 53px Arial'; hint.fillText('E', 48, 67); this.contextHint.texture.needsUpdate = true;
    this.contextRing.visible = this.contextHint.sprite.visible = false;
    this.steam = [];
    const material = new THREE.SpriteMaterial({ color: '#fff9eb', map: this.softTexture(), transparent: true, opacity: .25, depthWrite: false }); this.materials.add(material);
    for (const station of LEVEL.stations) for (let i = 0; i < 5; i++) { const sprite = new THREE.Sprite(material.clone()); this.materials.add(sprite.material); this.world.add(sprite); this.steam.push({ sprite, station, offset: i / 5 }); }
  }
  update(state) {
    if (!state || this.disposed) return;
    const changedRound = this.lastRound !== state.round;
    if (changedRound) {
      this.lastRound = state.round; this.seenEvents.clear(); this.frames = [];
      for (const view of this.characters.values()) view.mascot.reset();
      for (const cup of this.cups.values()) this.world.remove(cup); this.cups.clear();
      for (const group of this.shards.values()) { group.traverse(object => object.geometry?.dispose()); this.world.remove(group); } this.shards.clear();
      for (const puddle of this.puddles.values()) { this.world.remove(puddle); puddle.geometry.dispose(); } this.puddles.clear();
      for (const particle of this.particles) { this.world.remove(particle.mesh); particle.mesh.geometry.dispose(); } this.particles = [];
      for (const popup of this.popups) this.removePopup(popup); this.popups = [];
    }
    this.state = state;
    this.frames.push({ at: performance.now(), state }); if (this.frames.length > 7) this.frames.shift();
    if (this.mugAsset) this.syncState(state);
    for (const event of [...(state.events || [])].reverse()) {
      if (this.seenEvents.has(event.id)) continue; this.seenEvents.add(event.id);
      // Joining mid-round must not replay a backlog of old impacts or sounds.
      if (changedRound || state.elapsed - event.time > .9) continue;
      const agent = state.agents?.find(agent => agent.id === event.actorId);
      const position = new THREE.Vector3(event.x ?? agent?.x ?? 0, .6, event.z ?? agent?.z ?? 0);
      this.audio.event(event, position.x);
      const direction = event.dx || event.dz ? Math.atan2(event.dx, event.dz) : agent?.heading || 0;
      if (['drop', 'spill', 'push', 'break'].includes(event.type)) this.burst(position, event.type === 'break' ? '#fff0d1' : '#794b2b', event.type === 'break' ? 14 : 8, direction);
      const label = event.type === 'recover' ? (agent?.carrying ? 'CUP RECOVERED' : 'BACK UP') : LABELS[event.type];
      if (label) this.popup(position, label, event.type === 'steal' ? '#d9e878' : '#fff0cb');
      if (event.type === 'win') this.confetti();
    }
  }
  syncState(state) {
    for (const agent of state.agents || []) { const view = this.characters.get(agent.id); if (view) { view.agent = agent; this.paintLabel(view, agent); } }
    const cupIds = new Set();
    for (const cup of state.cups || []) {
      cupIds.add(cup.id); let root = this.cups.get(cup.id);
      if (!root) {
        root = clone(this.mugAsset); root.userData.coffeeMeshes = [];
        root.traverse(object => { if (/coffee/i.test(object.name) || /coffee/i.test(object.material?.name)) root.userData.coffeeMeshes.push(object); });
        this.world.add(root); this.cups.set(cup.id, root);
      }
      if (root.userData.target && root.userData.target.holderId !== cup.holderId) root.userData.attach = { from: root.position.clone(), at: performance.now() };
      root.userData.target = cup; root.visible = !cup.broken;
      if (cup.broken && !this.shards.has(cup.id)) {
        const group = new THREE.Group(); group.position.set(cup.x, .035, cup.z); group.userData.cupId = cup.id;
        for (let i = 0; i < 7; i++) {
          const angle = i / 7 * Math.PI * 2;
          const geometry = new THREE.CylinderGeometry(.10, .08, .025, 3, 1, false);
          const shard = new THREE.Mesh(geometry, this.effectMaterial('#f2e5ce')); shard.position.set(Math.cos(angle) * .19, 0, Math.sin(angle) * .16); shard.rotation.y = angle; shard.castShadow = true; group.add(shard);
        }
        this.world.add(group); this.shards.set(cup.id, group);
      }
      for (const liquid of root.userData.coffeeMeshes) {
        liquid.visible = cup.coffee > .5;
        const [low, high] = liquid.userData.fillRange || [.05, .27];
        liquid.position.y = THREE.MathUtils.lerp(low, high, Math.min(1, cup.coffee / 100));
      }
    }
    for (const [id, root] of this.cups) if (!cupIds.has(id)) { this.world.remove(root); this.cups.delete(id); }
    for (const station of state.stations || []) {
      const sign = this.stationSigns.get(station.id); if (!sign) continue;
      const progress = Math.round((station.progress || 0) * 100), key = `${station.busy}-${station.ready}-${progress}`;
      if (key === sign.key) continue; sign.key = key;
      const ctx = sign.canvas.getContext('2d'); ctx.clearRect(0, 0, 256, 112); ctx.fillStyle = station.ready ? '#d9e878' : '#fff5db';
      ctx.beginPath(); ctx.roundRect(3, 3, 250, 99, 22); ctx.fill(); ctx.fillStyle = '#294135'; ctx.textAlign = 'center'; ctx.font = '800 28px Arial';
      ctx.fillText(station.ready ? 'COFFEE READY' : station.busy ? 'BREWING' : 'BREW HERE', 128, 44);
      ctx.fillStyle = '#d0c7ab'; ctx.fillRect(24, 66, 208, 13); ctx.fillStyle = station.ready ? '#48764c' : '#c37843'; ctx.fillRect(24, 66, 208 * (station.ready ? 1 : station.progress || 0), 13); sign.texture.needsUpdate = true;
    }
    const spillIds = new Set();
    for (const spill of state.spills || []) {
      spillIds.add(spill.id); let mesh = this.puddles.get(spill.id);
      if (!mesh) {
        const shape = new THREE.Shape();
        for (let i = 0; i <= 40; i++) { const angle = i / 40 * Math.PI * 2, radius = 1 + Math.sin(angle * 5 + .3) * .12 + Math.cos(angle * 3) * .1; const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius * .7; if (!i) shape.moveTo(x, y); else shape.lineTo(x, y); }
        mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), this.material('#72482c', { roughness: .23, transparent: true, opacity: .85, depthWrite: false }));
        mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = Math.atan2(spill.dz || 0, spill.dx || 1); mesh.position.set(spill.x, .018, spill.z); mesh.scale.setScalar(spill.radius || .6); mesh.receiveShadow = true; this.world.add(mesh); this.puddles.set(spill.id, mesh);
      }
      mesh.material.opacity = Math.min(.88, (spill.ttl ?? 10) / 3);
    }
    for (const [id, mesh] of this.puddles) if (!spillIds.has(id)) { this.world.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); this.materials.delete(mesh.material); this.puddles.delete(id); }
    for (const prop of state.props || []) { const chair = this.chairs.get(prop.id); if (chair) chair.userData.target = prop; }
  }
  interpolated(kind, id, now) {
    const target = now - 85;
    let before = this.frames[0], after = this.frames[this.frames.length - 1];
    for (let i = 1; i < this.frames.length; i++) if (this.frames[i].at >= target) { before = this.frames[i - 1]; after = this.frames[i]; break; }
    const a = before?.state[kind]?.find(item => item.id === id), b = after?.state[kind]?.find(item => item.id === id);
    if (!b) return a;
    if (!a) return b;
    const t = THREE.MathUtils.clamp((target - before.at) / Math.max(1, after.at - before.at), 0, 1);
    let rotation = b.rotation;
    if (a.rotation && b.rotation) {
      rotation = new THREE.Quaternion(a.rotation.x, a.rotation.y, a.rotation.z, a.rotation.w).slerp(new THREE.Quaternion(b.rotation.x, b.rotation.y, b.rotation.z, b.rotation.w), t);
    }
    return { ...b, rotation, x: THREE.MathUtils.lerp(a.x, b.x, t), y: THREE.MathUtils.lerp(a.y || 0, b.y || 0, t), z: THREE.MathUtils.lerp(a.z, b.z, t), heading: angleLerp(a.heading || 0, b.heading || 0, t) };
  }
  burst(position, color, count, heading = 0) {
    const material = this.effectMaterial(color);
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(.035 + Math.random() * .045, 0), material); mesh.position.copy(position); this.world.add(mesh);
      this.particles.push({ mesh, velocity: new THREE.Vector3((Math.random() - .5) * 2.1 + Math.sin(heading) * .8, 1.7 + Math.random() * 2, (Math.random() - .5) * 2.1 + Math.cos(heading) * .8), life: .55 + Math.random() * .35 });
    }
  }
  popup(position, text, color) {
    const view = this.makeSprite(384, 88, 1.9, .44); view.sprite.position.copy(position); view.sprite.position.y = 2.5;
    const ctx = view.canvas.getContext('2d'); ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(4, 4, 376, 74, 22); ctx.fill(); ctx.fillStyle = '#304436'; ctx.textAlign = 'center'; ctx.font = '900 40px Arial'; ctx.fillText(text, 192, 53); view.texture.needsUpdate = true;
    this.world.add(view.sprite); this.popups.push({ ...view, life: 1.3 });
  }
  removePopup(popup) { this.world.remove(popup.sprite); popup.texture.dispose(); popup.sprite.material.dispose(); this.textures.delete(popup.texture); this.materials.delete(popup.sprite.material); }
  confetti() {
    for (let i = 0; i < 60; i++) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(.09, .17), this.effectMaterial(RUNNERS[i % RUNNERS.length].color)); mesh.position.set(4 + Math.random() * 5, 4 + Math.random() * 4, -1 + Math.random() * 4); this.world.add(mesh);
      this.particles.push({ mesh, velocity: new THREE.Vector3((Math.random() - .5) * 2, -.5, (Math.random() - .5) * 2), life: 4, confetti: true });
    }
  }
  animate() {
    if (this.disposed) return;
    const now = performance.now(), dt = Math.min((now - this.lastTime) / 1000, .25); this.lastTime = now; this.time += dt;
    for (const [id, view] of this.characters) {
      const agent = this.interpolated('agents', id, now) || view.agent;
      if (!agent) { view.mascot.update(dt, this.time); continue; }
      view.root.position.set(agent.x, agent.y || 0, agent.z); view.root.rotation.y = angleLerp(view.root.rotation.y, agent.heading || 0, 1 - Math.exp(-dt * 16));
      const cup = agent.cupId && this.state?.cups?.find(cup => cup.id === agent.cupId);
      view.mascot.update(dt, this.time, agent, this.state?.phase, cup);
      view.root.updateMatrixWorld(true);
      view.label.sprite.position.y = agent.fallen ? 1.05 : 2.14;
      if (id === this.selected && this.selection) this.selection.position.set(agent.x, .04, agent.z);
    }
    for (const [id, root] of this.cups) {
      const cup = this.interpolated('cups', id, now) || root.userData.target; if (!cup) continue;
      const holder = cup.holderId && this.characters.get(cup.holderId);
      if (holder?.socket) {
        holder.socket.getWorldPosition(root.position); root.rotation.set(0, holder.root.rotation.y, 0);
      } else {
        root.position.set(cup.x, cup.y, cup.z);
        const quaternion = cup.rotation || cup.quaternion;
        if (quaternion) root.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
        else root.rotation.set(0, 0, 0);
      }
      if (root.userData.attach) {
        const progress = Math.min(1, (now - root.userData.attach.at) / 150);
        root.position.lerpVectors(root.userData.attach.from, root.position.clone(), 1 - (1 - progress) ** 3);
        if (progress >= 1) root.userData.attach = null;
      }
    }
    for (const chair of this.chairs.values()) {
      const prop = chair.userData.target; if (!prop) continue;
      chair.position.set(damp(chair.position.x, prop.x, 16, dt), Math.max(0, (prop.y || .52) - .52), damp(chair.position.z, prop.z, 16, dt));
      const rotation = prop.rotation || prop.quaternion;
      if (rotation) chair.quaternion.slerp(new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w), 1 - Math.exp(-dt * 12));
      else chair.rotation.y = damp(chair.rotation.y, prop.heading || 0, 12, dt);
    }
    if (this.gate) {
      const closed = !!this.state?.gate?.closed;
      this.gate.scale.y = damp(this.gate.scale.y, closed ? 1 : .11, 5, dt);
      const key = String(closed); if (this.gateLabel.key !== key) {
        this.gateLabel.key = key; const ctx = this.gateLabel.canvas.getContext('2d'); ctx.clearRect(0, 0, 256, 80); ctx.fillStyle = closed ? '#e9bc54' : '#f3edce'; ctx.beginPath(); ctx.roundRect(5, 5, 246, 66, 17); ctx.fill(); ctx.fillStyle = '#304436'; ctx.font = '800 29px Arial'; ctx.textAlign = 'center'; ctx.fillText(closed ? 'USE SIDE AISLE' : 'PASSAGE OPEN', 128, 49); this.gateLabel.texture.needsUpdate = true;
      }
      this.gateLabel.sprite.scale.y = .42 / this.gate.scale.y; this.gateLabel.sprite.position.y = 1.65 / this.gate.scale.y;
    }
    for (const steam of this.steam || []) {
      const station = this.state?.stations?.find(item => item.id === steam.station.id), active = station?.busy && !station?.ready;
      const phase = (this.time * .45 + steam.offset) % 1;
      steam.sprite.visible = !!active; steam.sprite.position.set(steam.station.cupX + Math.sin(this.time + steam.offset * 6) * .07, 1.65 + phase * .9, steam.station.cupZ);
      steam.sprite.scale.setScalar(.18 + phase * .35); steam.sprite.material.opacity = Math.sin(phase * Math.PI) * .32;
    }
    this.particles = this.particles.filter(particle => {
      particle.life -= dt; particle.velocity.y -= dt * (particle.confetti ? .5 : 8); particle.mesh.position.addScaledVector(particle.velocity, dt);
      if (particle.confetti) { particle.mesh.rotation.x += dt * 3; particle.mesh.rotation.z += dt * 2; }
      if (particle.life <= 0 || particle.mesh.position.y < .025) { this.world.remove(particle.mesh); particle.mesh.geometry.dispose(); return false; } return true;
    });
    this.popups = this.popups.filter(popup => { popup.life -= dt; popup.sprite.position.y += dt * .22; popup.sprite.material.opacity = Math.min(1, popup.life * 3); if (popup.life <= 0) { this.removePopup(popup); return false; } return true; });
    const selected = this.characters.get(this.selected)?.agent;
    if (this.contextRing) {
      const action = selected?.controlled && this.state?.phase === 'racing' && selected.contextualAction;
      let target = null;
      if (action?.type === 'take') target = this.state.cups.find(cup => cup.id === action.targetId);
      if (action?.type === 'brew') { const station = this.state.stations.find(item => item.id === action.targetId); if (station) target = { x: station.cupX, y: station.cupY, z: station.cupZ }; }
      if (action?.type === 'place') { const surface = this.state.surfaces.find(item => item.id === action.targetId); if (surface) target = { x: surface.cupX, y: surface.cupY, z: surface.cupZ }; }
      if (action?.type === 'deliver') target = { x: LEVEL.customer.desk.x, y: LEVEL.customer.desk.h, z: -.65 };
      this.contextRing.visible = this.contextHint.sprite.visible = !!target;
      if (target) { this.contextRing.position.set(target.x, target.y + .012, target.z); this.contextHint.sprite.position.set(target.x, target.y + .62, target.z); }
    }
    this.audio.update(dt, this.state, selected); this.director.update(dt, this.state, selected);
    this.renderer.render(this.scene, this.camera);
  }
  setCamera(mode) { this.director.setMode(mode); }
  setZoom(value) { this.director.setZoom(value); }
  focusRunner(id) { if (!RUNNERS.some(runner => runner.id === id)) return; this.selected = id; for (const view of this.characters.values()) if (view.agent) this.paintLabel(view, view.agent); }
  setAudioEnabled(enabled) { return this.audio.setEnabled(enabled); }
  pick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect(), pointer = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(pointer, this.camera);
    const roots = [...this.characters.values()].map(view => view.root);
    for (const hit of raycaster.intersectObjects(roots, true)) {
      for (const [id, view] of this.characters) {
        let node = hit.object; while (node) { if (node === view.root) { this.focusRunner(id); this.container.dispatchEvent(new CustomEvent('runnerselect', { detail: { id } })); return; } node = node.parent; }
      }
    }
  }
  resize() { const width = this.container.clientWidth || 1280, height = this.container.clientHeight || 720; this.renderer.setSize(width, height, false); this.director.resize(width, height); }
  disposeAsset(root) { root.traverse(object => { object.geometry?.dispose(); for (const material of object.material ? Array.isArray(object.material) ? object.material : [object.material] : []) { material.map?.dispose(); material.dispose(); } }); }
  dispose() {
    this.disposed = true; this.renderer.setAnimationLoop(null); this.resizeObserver.disconnect(); this.renderer.domElement.removeEventListener('pointerup', this.onPointer);
    for (const view of this.characters.values()) view.mascot.dispose();
    this.disposeAsset(this.mugAsset || new THREE.Group());
    const geometries = new Set(); this.scene.traverse(object => { if (object.geometry) geometries.add(object.geometry); }); for (const geometry of geometries) geometry.dispose();
    for (const material of this.materials) material.dispose(); for (const texture of this.textures) texture.dispose();
    this.audio.dispose(); this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
