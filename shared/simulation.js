import { LEVEL, RUNNERS } from './level.js';
import { createPhysicsWorld, RAPIER } from './physics.js';
import { validateCommand } from './commands.js';
export { RUNNERS, LEVEL } from './level.js';
export { initializePhysics } from './physics.js';

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const STEP = 1 / 60;
const RADIUS = .32;
const GRID = .4;
const ORIGIN = { x: -9.2, z: -6.2 };
const WIDTH = 47, DEPTH = 32;
function randomFrom(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const inRectangle = (point, obstacle, margin) => Math.abs(point.x - obstacle.x) < obstacle.w / 2 + margin && Math.abs(point.z - obstacle.z) < obstacle.d / 2 + margin;

export class CoffeeSimulation {
  constructor({ round = 1 } = {}) {
    this.round = round; this.rand = randomFrom(round * 9199 + 42);
    this.elapsed = 0; this.accumulator = 0; this.winner = null; this.finished = false;
    this.events = []; this.spills = []; this.eventId = 0; this.cupSequence = 0;
    this.world = createPhysicsWorld();
    this.gate = { ...LEVEL.gate, closed: false, nextChange: 14 };
    this.createBox({ x: 0, z: 0, w: 22, d: 16, h: .2 }, -.2);
    for (const o of LEVEL.obstacles) this.createBox(o);
    const b = LEVEL.bounds;
    this.createBox({ x: b.minX - .15, z: 0, w: .3, d: 14, h: 2 });
    this.createBox({ x: b.maxX + .15, z: 0, w: .3, d: 14, h: 2 });
    this.createBox({ x: 0, z: b.minZ - .15, w: 20, d: .3, h: 2 });
    this.createBox({ x: 0, z: b.maxZ + .15, w: 20, d: .3, h: 2 });
    this.gateBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.gate.x, -2, this.gate.z));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(this.gate.w / 2, .65, this.gate.d / 2), this.gateBody);
    this.stations = LEVEL.stations.map(s => ({ ...s, cupId: null, ownerId: null, progress: 0, busy: false, ready: false }));
    this.surfaces = [{ id: 'island-stage', x: -4.1, z: 1.55, cupX: -4.1, cupY: 1.08, cupZ: .65, cupId: null }, { id: 'prep-stage', x: -3.45, z: 2.6, cupX: -2.55, cupY: 1.02, cupZ: 2.6, cupId: null }];
    this.cups = [];
    for (let i = 0; i < 12; i++) this.createCup();
    this.agents = RUNNERS.map((r, i) => {
      const p = LEVEL.spawns[i];
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, .78, p.z).lockRotations().enabledTranslations(true, false, true).setLinearDamping(4).setCcdEnabled(true));
      this.world.createCollider(RAPIER.ColliderDesc.capsule(.44, RADIUS).setMass(4).setFriction(.05).setRestitution(0).setCollisionGroups(((1 << (i + 1)) << 16) | 0xffff), body);
      return { ...r, ...p, y: 0, body, vx: 0, vz: 0, heading: Math.PI, coffee: 0, carrying: false, cupId: null,
        state: 'Waiting for an agent command', action: 'idle', moving: false, fallen: false, progress: 0, delivered: false,
        decision: 'Waiting for an agent command', strategy: { pace: 'fast', route: 'direct', aggression: r.aggression },
        cooldown: 1 + this.rand() * 2, pushTimer: 0, recovery: 0, safeUntil: 0, rethink: .1 + this.rand() * .65,
        path: [], target: null, task: null, interaction: null, command: null, lastCommand: null, commandSequence: 0, standingUp: false, routeTimer: 0, stuckTime: 0, lastPosition: { ...p },
        controlled: false, input: { x: 0, z: 0, interact: false, drop: false, push: false }, pendingActions: {}, inputAge: Infinity, previousVelocity: { x: 0, z: 0 }, slipExposure: 0, parkedCupId: null, variation: .91 + this.rand() * .18, stationsUsed: 0, steals: 0, falls: 0,
      };
    });
    this.props = LEVEL.chairs.map(p => {
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, .52, p.z).setLinearDamping(2.5).setAngularDamping(4).enabledRotations(false, true, false).setCcdEnabled(true));
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(.37, .5, .37).setMass(1.8).setFriction(.35), body);
      return { ...p, body };
    });
    this.log('Waiting for agent commands. First coffee above 55% wins.', 'info');
  }

  createBox(o, bottom = 0) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(o.x, bottom + o.h / 2, o.z));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(o.w / 2, o.h / 2, o.d / 2).setFriction(.6), body);
    return body;
  }
  createCup() {
    const index = this.cupSequence++;
    const x = LEVEL.cupRack.x - .85 + index % 6 * .34;
    const z = 4.45 + Math.floor(index % 12 / 6) * .38;
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, 1.25, z).setCcdEnabled(true));
    this.world.createCollider(RAPIER.ColliderDesc.cylinder(.17, .14).setMass(.24).setFriction(.65).setRestitution(.12), body);
    const cup = { id: `cup-${this.round}-${index + 1}`, body, holderId: null, stationId: null, surfaceId: null, slosh: 0, nextSlosh: 0, coffee: 0, broken: false, rack: true, lastHolderId: null, releasedAt: -100, previousVelocity: 0 };
    this.cups.push(cup);
    return cup;
  }
  cupCollider(cup) {
    return cup.body.numColliders() ? cup.body.collider(0) : this.world.createCollider(RAPIER.ColliderDesc.cylinder(.17, .14).setMass(.24).setFriction(.65).setRestitution(.12), cup.body);
  }
  log(text, type = 'info', actorId = null, position = null) {
    this.events.unshift({ id: `${this.round}-${++this.eventId}`, text, type, actorId, time: this.elapsed, ...(position ? { x: position.x, z: position.z, dx: position.dx || 0, dz: position.dz || 0 } : {}) });
    this.events.length = Math.min(32, this.events.length);
  }
  cupFor(agent) { return this.cups.find(c => c.id === agent.cupId); }
  setStrategy(id, strategy) {
    const a = this.agents.find(agent => agent.id === id);
    if (!a || a.controlled || !strategy) return;
    a.strategy = { pace: strategy.pace === 'careful' ? 'careful' : 'fast', route: strategy.route === 'detour' ? 'detour' : 'direct', aggression: Number.isFinite(strategy.aggression) ? clamp(strategy.aggression, 0, 1) : a.strategy.aggression };
    a.rethink = 0;
  }
  setControl(id, enabled) {
    const a = this.agents.find(agent => agent.id === id);
    if (!a) return false;
    if (a.controlled === !!enabled) return true;
    this.cancelCommand(id, 'Control changed');
    a.controlled = !!enabled; a.input = { x: 0, z: 0, interact: false, drop: false, push: false };
    a.pendingActions = {}; a.inputAge = Infinity; a.interaction = null; a.path = []; a.target = null; a.task = null; a.rethink = 0;
    a.decision = enabled ? 'Direct player control' : 'Waiting for an agent command';
    return true;
  }
  stopInput(id) {
    const a = this.agents.find(agent => agent.id === id);
    if (!a) return false;
    a.input = { x: 0, z: 0, interact: false, drop: false, push: false }; a.pendingActions = {}; a.inputAge = Infinity;
    return true;
  }
  setInput(id, input = {}) {
    const a = this.agents.find(agent => agent.id === id);
    if (!a?.controlled || !input || typeof input !== 'object') return false;
    let x = Number.isFinite(input.x) ? clamp(input.x, -1, 1) : 0;
    let z = Number.isFinite(input.z) ? clamp(input.z, -1, 1) : 0;
    const length = Math.hypot(x, z); if (length > 1) { x /= length; z /= length; }
    a.strategy.pace = input.steady ? 'careful' : 'fast';
    if (a.fallen && input.interact && !a.standingUp) { a.standingUp = true; a.recovery = 1.75; }
    for (const key of ['interact', 'drop', 'push']) if (input[key] && !a.input[key]) a.pendingActions[key] = true;
    a.input = { x, z, interact: !!input.interact, drop: !!input.drop, push: !!input.push }; a.inputAge = 0;
    return true;
  }
  finishCommand(a, status = 'completed', error = null) {
    if (!a.command) return;
    a.lastCommand = { ...a.command, status, error, endedAt: this.elapsed, end: { x: a.x, z: a.z } };
    a.command = null;
  }
  cancelCommand(id, reason = 'Command cancelled') {
    const a = this.agents.find(agent => agent.id === id);
    if (!a) return;
    this.finishCommand(a, 'cancelled', reason);
    a.interaction = null;
    a.standingUp = false;
  }
  executeCommand(id, command) {
    const a = this.agents.find(agent => agent.id === id);
    const error = validateCommand(command);
    if (!a || error || this.finished || this.disposed || a.controlled) return { ok: false, error: error || (!a ? 'Unknown runner.' : a.controlled ? 'Runner is controlled by a human.' : 'The round is over.') };
    if (command.type === 'stop') {
      this.cancelCommand(id);
    } else if (a.command || a.interaction || a.pushTimer > 0) return { ok: false, error: 'Runner is busy.' };
    if (a.fallen && !['stand_up', 'wait', 'stop'].includes(command.type)) return { ok: false, error: 'Runner is fallen. Use stand_up.' };
    if (command.type === 'stand_up' && !a.fallen) return { ok: false, error: 'Runner is already standing.' };
    if (['take', 'brew', 'place', 'push', 'drop', 'deliver'].includes(command.type)) {
      const available = this.availableActions(a).some(action => action.type === command.type && (!command.targetId || action.targetId === command.targetId));
      if (!available) return { ok: false, error: 'Action unavailable: check target, reach, facing, and held cup.' };
    }
    if (command.pace) a.strategy.pace = command.pace;
    a.command = { ...command, id: ++a.commandSequence, startedAt: this.elapsed, remaining: (command.durationMs || 0) / 1000, start: { x: a.x, z: a.z }, status: 'running' };
    a.decision = `Agent command: ${command.type}${command.targetId ? ` ${command.targetId}` : ''}`;
    a.state = a.decision;
    if (command.type === 'move') {
      const length = Math.max(1, Math.hypot(command.x, command.z));
      a.command.x /= length; a.command.z /= length;
    } else if (command.type === 'look') {
      a.heading = Math.atan2(Math.sin(command.heading), Math.cos(command.heading));
      this.finishCommand(a);
    } else if (command.type === 'stop') this.finishCommand(a);
    else if (command.type === 'stand_up') { a.standingUp = true; a.recovery = 1.75; }
    else if (command.type === 'drop') { this.dropCup(a); this.finishCommand(a); }
    else if (command.type === 'push') this.shove(a, this.agents.find(other => other.id === command.targetId));
    else if (['take', 'brew', 'place', 'deliver'].includes(command.type)) {
      this.startInteraction(a, command.type === 'place' ? 'surface' : command.type, command.targetId, command.type === 'take' ? .42 : command.type === 'place' ? .55 : .65);
    }
    return { ok: true, command: { ...(a.command || a.lastCommand) } };
  }
  inReach(a, target, range = 1.05) {
    const d = distance(a, target);
    return d <= range && (d < .4 || (Math.sin(a.heading) * (target.x - a.x) + Math.cos(a.heading) * (target.z - a.z)) / d > -.15);
  }
  availableActions(a) {
    if (a.fallen || a.interaction || a.pushTimer > 0) return [];
    const result = [], cup = this.cupFor(a);
    if (cup) {
      if (cup.coffee >= 55 && this.inReach(a, LEVEL.customer.delivery, .85)) result.push({ type: 'deliver', label: 'Serve coffee', targetId: 'customer' });
      for (const station of this.stations) if (!station.cupId && this.inReach(a, station)) result.push({ type: 'brew', label: cup.coffee ? 'Refill coffee' : 'Start brewing', targetId: station.id });
      for (const surface of this.surfaces) if (!surface.cupId && this.inReach(a, surface)) result.push({ type: 'place', label: 'Place mug on worktop', targetId: surface.id });
      result.push({ type: 'drop', label: 'Drop mug', targetId: cup.id });
    } else {
      const nearby = this.cups.filter(c => !c.holderId && !c.broken && !c.delivered && (c.rack || c.stationId || c.surfaceId || c.body.translation().y < .8) && this.inReach(a, this.cupTarget(c))).sort((c, d) => distance(a, this.cupTarget(c)) - distance(a, this.cupTarget(d)));
      for (const c of nearby) {
        result.push({ type: 'take', label: c.coffee > 0 ? `Take coffee (${Math.round(c.coffee)}%)` : 'Take mug', targetId: c.id });
      }
    }
    if (a.cooldown <= 0) {
      for (const rival of this.agents.filter(b => b !== a && !b.fallen && this.elapsed >= b.safeUntil && this.inReach(a, b, 1.12))) result.push({ type: 'push', label: `Shove ${rival.name}`, targetId: rival.id });
    }
    return result;
  }
  movementSpeed(a) {
    const coffee = this.cupFor(a)?.coffee || 0;
    return (coffee > 0 ? a.strategy.pace === 'careful' ? 1.85 : 2.65 : 2.7) * a.pace * a.variation * .85;
  }
  moveAgent(a, vx, vz, dt) {
    if (Math.hypot(vx, vz) > .1) a.heading += Math.atan2(Math.sin(Math.atan2(vx, vz) - a.heading), Math.cos(Math.atan2(vx, vz) - a.heading)) * Math.min(1, dt * 12);
    const smooth = 1 - Math.exp(-dt * 9);
    a.vx += (vx - a.vx) * smooth; a.vz += (vz - a.vz) * smooth;
    a.body.setLinvel({ x: a.vx, y: 0, z: a.vz }, true);
    a.moving = Math.hypot(a.vx, a.vz) > .2;
    a.action = a.interaction ? 'interact' : a.moving ? a.cupId ? 'carry' : 'run' : a.cupId ? 'carry' : 'idle';
    if (a.moving && this.elapsed > a.safeUntil) {
      const puddle = this.spills.find(s => this.elapsed - s.born > .7 && distance(a, s) < s.radius * .7);
      a.slipExposure = puddle && puddle.radius > .42 && a.strategy.pace === 'fast' && Math.hypot(a.vx, a.vz) > 1.9 ? a.slipExposure + dt : 0;
      if (a.slipExposure > .16) { a.slipExposure = 0; this.fall(a, Math.sin(a.heading), Math.cos(a.heading), 'slipped while rushing across spilled coffee'); }
    }
  }
  manualControl(a, dt) {
    if (a.inputAge > .35) { a.input = { x: 0, z: 0, interact: false, drop: false, push: false }; a.pendingActions = {}; }
    const commands = a.pendingActions; a.pendingActions = {};
    if (commands.drop) this.dropCup(a, Math.sin(a.heading) * .2, Math.cos(a.heading) * .2);
    if (commands.push) {
      const action = this.availableActions(a).find(action => action.type === 'push');
      if (action) this.shove(a, this.agents.find(b => b.id === action.targetId));
    }
    if (commands.interact && a.pushTimer <= 0) {
      const action = this.availableActions(a).find(action => !['drop', 'push'].includes(action.type));
      if (action) this.startInteraction(a, action.type === 'place' ? 'surface' : action.type, action.targetId, action.type === 'take' ? .42 : action.type === 'place' ? .55 : .65);
    }
    a.decision = 'Direct player control'; a.state = a.interaction ? 'Contextual interaction' : a.cupId ? 'Carrying a mug' : 'Player movement';
    if (a.pushTimer > 0) return;
    const speed = this.movementSpeed(a);
    this.moveAgent(a, a.interaction ? 0 : a.input.x * speed, a.interaction ? 0 : a.input.z * speed, dt);
  }
  blocked(point, margin = .39) {
    const b = LEVEL.bounds;
    return point.x < b.minX + margin || point.x > b.maxX - margin || point.z < b.minZ + margin || point.z > b.maxZ - margin || LEVEL.obstacles.some(o => inRectangle(point, o, margin)) || (this.gate.closed && inRectangle(point, this.gate, margin));
  }
  lineClear(from, to, detour = false) {
    const steps = Math.max(1, Math.ceil(distance(from, to) / .12));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, p = { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t };
      if (this.blocked(p, .4)) return false;
      if (this.props?.some(prop => distance(p, prop.body.translation()) < .74)) return false;
    }
    if (detour && (from.x - LEVEL.gate.x) * (to.x - LEVEL.gate.x) < 0) {
      const t = (LEVEL.gate.x - from.x) / (to.x - from.x);
      if (from.z + (to.z - from.z) * t < 4.4) return false;
    }
    return true;
  }
  smoothPath(from, points, detour) {
    const result = []; let anchor = from, index = 0;
    while (index < points.length) {
      let furthest = index;
      for (let i = points.length - 1; i > index; i--) {
        if (this.lineClear(anchor, points[i], detour)) { furthest = i; break; }
      }
      result.push(points[furthest]); anchor = points[furthest]; index = furthest + 1;
    }
    return result;
  }
  pathTo(from, goal, detour = false) {
    const cell = p => [clamp(Math.round((p.x - ORIGIN.x) / GRID), 0, WIDTH - 1), clamp(Math.round((p.z - ORIGIN.z) / GRID), 0, DEPTH - 1)];
    const point = (x, z) => ({ x: ORIGIN.x + x * GRID, z: ORIGIN.z + z * GRID });
    const key = (x, z) => z * WIDTH + x;
    const start = cell(from), end = cell(goal), startKey = key(...start);
    const open = [{ x: start[0], z: start[1], g: 0, f: 0 }];
    const nodes = new Map([[startKey, { parent: null }]]); const closed = new Set();
    let current;
    while (open.length) {
      open.sort((a, b) => b.f - a.f); current = open.pop();
      const currentKey = key(current.x, current.z);
      if (closed.has(currentKey)) continue;
      closed.add(currentKey);
      if (current.x === end[0] && current.z === end[1]) break;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = current.x + dx, z = current.z + dz, k = key(x, z);
        if (x < 0 || z < 0 || x >= WIDTH || z >= DEPTH || closed.has(k)) continue;
        const p = point(x, z);
        if (this.blocked(p)) continue;
        const chairCost = this.props?.some(prop => distance(p, prop.body.translation()) < .9) ? 2 : 0;
        const gateCost = detour && Math.abs(p.x - LEVEL.gate.x) < .8 && p.z < 4.4 ? 30 : 0;
        const g = current.g + 1 + chairCost + gateCost;
        if (nodes.has(k) && nodes.get(k).g <= g) continue;
        nodes.set(k, { x, z, parent: currentKey, g });
        open.push({ x, z, g, f: g + Math.abs(x - end[0]) + Math.abs(z - end[1]) });
      }
    }
    if (!current || current.x !== end[0] || current.z !== end[1]) return [];
    const points = []; let k = key(current.x, current.z);
    while (nodes.get(k)?.parent != null) { const node = nodes.get(k); points.unshift(point(node.x, node.z)); k = node.parent; }
    if (!this.blocked(goal, .33)) points.push({ x: goal.x, z: goal.z });
    return this.smoothPath(from, points, detour);
  }
  cupTarget(cup) {
    return cup.rack ? LEVEL.cupRack : cup.stationId ? this.stations.find(s => s.id === cup.stationId) : cup.surfaceId ? this.surfaces.find(s => s.id === cup.surfaceId) : cup.body.translation();
  }
  takeCup(a, cup) {
    if (!cup || cup.holderId || cup.broken || cup.delivered || a.cupId || a.fallen) return false;
    const position = cup.body.translation();
    const target = this.cupTarget(cup);
    if (distance(a, target) > 1.05 || (!cup.rack && !cup.stationId && !cup.surfaceId && position.y > .8)) return false;
    const previous = cup.lastHolderId;
    if (cup.stationId) {
      const station = this.stations.find(s => s.id === cup.stationId);
      station.cupId = null; station.ownerId = null; station.busy = false; station.ready = false; station.progress = 0;
    }
    if (cup.surfaceId) this.surfaces.find(s => s.id === cup.surfaceId).cupId = null;
    if (a.parkedCupId === cup.id) a.parkedCupId = null;
    const theft = previous && previous !== a.id;
    cup.rack = false; cup.stationId = null; cup.surfaceId = null; cup.holderId = a.id; cup.lastHolderId = a.id;
    cup.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    if (cup.body.numColliders()) this.world.removeCollider(cup.body.collider(0), true);
    cup.body.setLinvel({ x: 0, y: 0, z: 0 }, true); cup.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    a.cupId = cup.id; a.carrying = true; a.coffee = cup.coffee; a.rethink = 0;
    if (theft) { a.steals++; this.log(`${a.name} took an unattended ${cup.coffee > 0 ? 'coffee' : 'mug'}.`, 'steal', a.id, a); }
    else this.log(cup.coffee > 0 ? `${a.name} recovered a coffee.` : `${a.name} picked up a mug.`, cup.coffee > 0 ? 'recover' : 'take', a.id, a);
    return true;
  }
  placeCup(a, station) {
    const cup = this.cupFor(a);
    if (!cup || !station || station.cupId || distance(a, station) > 1.05) return false;
    cup.holderId = null; cup.stationId = station.id; cup.lastHolderId = a.id;
    this.cupCollider(cup);
    cup.body.setTranslation({ x: station.cupX, y: station.cupY + .17, z: station.cupZ }, true);
    cup.body.setNextKinematicTranslation({ x: station.cupX, y: station.cupY + .17, z: station.cupZ });
    station.cupId = cup.id; station.ownerId = a.id; station.progress = cup.coffee / 100; station.busy = true; station.ready = false;
    a.cupId = null; a.carrying = false; a.coffee = 0; a.stationsUsed++; a.rethink = 0;
    this.log(`${a.name} started a coffee. The machine keeps brewing unattended.`, 'brew', a.id, station);
    return true;
  }
  placeOnSurface(a, surface) {
    const cup = this.cupFor(a);
    if (!cup || !surface || surface.cupId || distance(a, surface) > 1.05) return false;
    cup.holderId = null; cup.stationId = null; cup.surfaceId = surface.id; cup.lastHolderId = a.id;
    this.cupCollider(cup);
    const p = { x: surface.cupX, y: surface.cupY + .17, z: surface.cupZ };
    cup.body.setTranslation(p, true); cup.body.setNextKinematicTranslation(p);
    cup.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true); cup.body.setNextKinematicRotation({ x: 0, y: 0, z: 0, w: 1 });
    surface.cupId = cup.id; a.parkedCupId = cup.id;
    a.cupId = null; a.carrying = false; a.coffee = 0; a.rethink = 0;
    this.log(`${a.name} placed a mug on the shared worktop.`, 'place', a.id, surface);
    return true;
  }
  carryRisk(a, dt) {
    const velocity = a.body.linvel(), previous = a.previousVelocity;
    a.previousVelocity = { x: velocity.x, z: velocity.z };
    const cup = this.cupFor(a);
    if (!cup || cup.coffee <= 0 || a.fallen) return;
    if (this.elapsed < cup.nextSlosh) { cup.slosh *= Math.exp(-dt * 4); return; }
    const dx = velocity.x - previous.x, dz = velocity.z - previous.z;
    const speed = Math.max(Math.hypot(velocity.x, velocity.z), Math.hypot(previous.x, previous.z));
    const acceleration = Math.hypot(dx, dz) / dt;
    const lateral = Math.abs(velocity.x * previous.z - velocity.z * previous.x) / Math.max(.1, speed) / dt;
    const careful = a.strategy.pace === 'careful';
    const stress = Math.max(0, acceleration - (careful ? 15 : 7.4)) + Math.max(0, lateral - (careful ? 12 : 5)) * .5;
    cup.slosh = clamp(cup.slosh - dt * 2 + stress * dt * (careful ? .3 : .8), 0, 3);
    if (speed < .8 || cup.slosh < .7 || this.elapsed < cup.nextSlosh) return;
    const length = Math.max(.001, Math.hypot(dx, dz)), dirX = -dx / length, dirZ = -dz / length;
    const lost = clamp(2 + cup.slosh * 2, 2, 7);
    this.spill(cup, lost, { x: a.x + dirX * .55, z: a.z + dirZ * .55, dx: dirX, dz: dirZ }, `${a.name} sloshed coffee while turning or braking. ${Math.round(Math.max(0, cup.coffee - lost))}% remains.`);
    cup.slosh = 0; cup.nextSlosh = this.elapsed + 1.2;
  }
  spill(cup, amount, position, reason = '') {
    const lost = Math.min(cup.coffee, Math.max(0, amount)); cup.coffee -= lost;
    if (lost < 2) return;
    this.spills.push({ id: `${this.round}-spill-${++this.eventId}`, x: position.x, z: position.z, dx: position.dx || 0, dz: position.dz || 0, radius: .32 + lost / 100, ttl: 34, born: this.elapsed });
    if (reason) this.log(reason, 'spill', cup.lastHolderId, position);
  }
  heldPosition(a) {
    return { x: a.x + Math.sin(a.heading) * .28 + Math.cos(a.heading) * .178, y: .857, z: a.z + Math.cos(a.heading) * .28 - Math.sin(a.heading) * .178 };
  }
  dropCup(a, dx = 0, dz = 0) {
    const cup = this.cupFor(a); if (!cup) return null;
    cup.holderId = null; cup.stationId = null; cup.surfaceId = null; cup.releasedAt = this.elapsed;
    cup.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    this.cupCollider(cup);
    cup.body.setTranslation(this.heldPosition(a), true);
    const ownerBit = 1 << (RUNNERS.findIndex(r => r.id === a.id) + 1);
    cup.body.collider(0).setCollisionGroups((1 << 16) | (0xffff & ~ownerBit));
    cup.ownerCollisionAfter = this.elapsed + .25;
    cup.body.setLinvel({ x: a.vx + dx * 2.2, y: 1.2, z: a.vz + dz * 2.2 }, true);
    cup.body.setAngvel({ x: dz * 2, y: 1.2, z: -dx * 2 }, true);
    cup.previousVelocity = 0;
    a.cupId = null; a.carrying = false; a.coffee = 0; a.rethink = 0;
    this.spill(cup, 8 + Math.hypot(a.vx, a.vz) * 4, a);
    this.log(`${a.name} dropped a mug.`, 'drop', a.id, a);
    return cup;
  }
  fall(a, dx, dz, reason = 'lost their balance') {
    if (a.fallen || this.elapsed < a.safeUntil) return false;
    this.cancelCommand(a.id, 'Runner fell');
    a.fallen = true; a.standingUp = false; a.recovery = 1.75; a.safeUntil = this.elapsed + 5;
    a.falls++; a.interaction = null; a.action = 'fall'; a.moving = false;
    a.body.collider(0).setShape(new RAPIER.Ball(RADIUS));
    a.body.collider(0).setTranslation({ x: 0, y: -.42, z: 0 });
    a.body.collider(0).setRotation({ x: Math.cos(a.heading) * Math.SQRT1_2, y: 0, z: -Math.sin(a.heading) * Math.SQRT1_2, w: Math.SQRT1_2 });
    this.dropCup(a, dx, dz);
    a.body.applyImpulse({ x: dx * 5.5, y: 0, z: dz * 5.5 }, true);
    this.log(`${a.name} ${reason}.`, 'fall', a.id, a); return true;
  }
  startInteraction(a, type, id, duration) {
    a.interaction = { type, id, remaining: duration, duration }; a.action = 'interact'; a.moving = false;
    const station = type === 'brew' ? this.stations.find(s => s.id === id) : type === 'surface' ? this.surfaces.find(s => s.id === id) : null;
    const cup = type === 'take' ? this.cups.find(c => c.id === id) : null;
    const focus = station ? { x: station.cupX, z: station.cupZ } : cup ? cup.body.translation() : LEVEL.customer.desk;
    if (focus) a.heading = Math.atan2(focus.x - a.x, focus.z - a.z);
  }
  completeInteraction(a) {
    const interaction = a.interaction; a.interaction = null;
    if (!interaction || this.finished) return false;
    if (interaction.type === 'take') return this.takeCup(a, this.cups.find(c => c.id === interaction.id));
    else if (interaction.type === 'surface') return this.placeOnSurface(a, this.surfaces.find(s => s.id === interaction.id));
    else if (interaction.type === 'brew') return this.placeCup(a, this.stations.find(s => s.id === interaction.id));
    else if (interaction.type === 'deliver') {
      const cup = this.cupFor(a);
      if (cup && !cup.broken && cup.coffee >= 55 && distance(a, LEVEL.customer.delivery) < .85) {
        cup.holderId = null; cup.delivered = true; this.cupCollider(cup);
        cup.body.setTranslation({ x: LEVEL.customer.desk.x, y: LEVEL.customer.desk.h + .17, z: -.65 }, true);
        cup.body.setNextKinematicTranslation({ x: LEVEL.customer.desk.x, y: LEVEL.customer.desk.h + .17, z: -.65 });
        cup.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        cup.body.setNextKinematicRotation({ x: 0, y: 0, z: 0, w: 1 });
        a.cupId = null; a.carrying = false;
        a.delivered = true; a.progress = 1; a.coffee = cup.coffee; a.state = 'Coffee served!'; a.action = 'interact'; a.moving = false;
        this.winner = a.id; this.finished = true;
        this.log(`${a.name} served ${Math.round(cup.coffee)}% coffee to the waiting customer!`, 'win', a.id, LEVEL.customer.delivery);
        return true;
      }
    }
    a.rethink = 0;
    return false;
  }
  control(a, dt) {
    a.cooldown -= dt; a.rethink -= dt; a.routeTimer -= dt; a.inputAge += dt;
    const p = a.body.translation(); a.x = p.x; a.z = p.z;
    if (a.fallen) {
      a.pendingActions = {};
      if (a.standingUp) a.recovery -= dt;
      a.action = a.standingUp && a.recovery < .65 ? 'recover' : 'fall';
      a.body.setLinvel({ x: a.body.linvel().x * .92, y: 0, z: a.body.linvel().z * .92 }, true);
      if (a.recovery <= 0) { a.body.collider(0).setShape(new RAPIER.Capsule(.44, RADIUS)); a.body.collider(0).setTranslation({ x: 0, y: 0, z: 0 }); a.body.collider(0).setRotation({ x: 0, y: 0, z: 0, w: 1 }); a.fallen = false; a.standingUp = false; this.finishCommand(a); this.log(`${a.name} is back on their feet.`, 'recover', a.id, a); }
      else if (a.command?.type === 'wait') { a.command.remaining -= dt; if (a.command.remaining <= 0) this.finishCommand(a); }
      return;
    }
    if (a.pushTimer > 0) {
      a.pendingActions = {};
      a.pushTimer -= dt; a.action = 'push'; a.moving = false;
      if (a.pushTimer <= 0) this.finishCommand(a);
      a.vx *= .72; a.vz *= .72;
      a.body.setLinvel({ x: a.vx, y: 0, z: a.vz }, true);
      return;
    }
    if (a.interaction) {
      a.pendingActions = {};
      a.action = 'interact'; a.moving = false; a.vx *= .7; a.vz *= .7;
      a.body.setLinvel({ x: a.vx, y: 0, z: a.vz }, true);
      a.interaction.remaining -= dt;
      if (a.interaction.remaining <= 0) {
        const success = this.completeInteraction(a);
        this.finishCommand(a, success ? 'completed' : 'failed', success ? null : 'The target changed before the action completed.');
      }
      return;
    }
    if (a.controlled) { this.manualControl(a, dt); return; }
    const command = a.command;
    if (command && ['move', 'wait'].includes(command.type)) {
      const speed = this.movementSpeed(a);
      this.moveAgent(a, command.type === 'move' ? command.x * speed : 0, command.type === 'move' ? command.z * speed : 0, dt);
      command.remaining -= dt;
      if (command.remaining <= 1e-9) this.finishCommand(a);
    } else this.moveAgent(a, 0, 0, dt);
  }
  breakCup(cup, position, message) {
    cup.broken = true; this.spill(cup, cup.coffee, position);
    const rotation = cup.body.rotation();
    cup.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    cup.body.setLinvel({ x: 0, y: 0, z: 0 }, true); cup.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    cup.body.setNextKinematicTranslation(position); cup.body.setNextKinematicRotation(rotation);
    if (cup.body.numColliders()) this.world.removeCollider(cup.body.collider(0), true);
    this.log(message, 'break', cup.lastHolderId, position);
  }
  updateCups(dt) {
    for (const cup of this.cups) {
      if (cup.broken) continue;
      if (cup.holderId) {
        const a = this.agents.find(a => a.id === cup.holderId);
        cup.body.setNextKinematicTranslation(this.heldPosition(a));
        cup.body.setNextKinematicRotation({ x: 0, y: Math.sin(a.heading / 2), z: 0, w: Math.cos(a.heading / 2) });
        a.coffee = cup.coffee;
      } else if (!cup.rack && !cup.stationId && !cup.surfaceId && !cup.delivered) {
        if (cup.ownerCollisionAfter && this.elapsed >= cup.ownerCollisionAfter) { cup.body.collider(0).setCollisionGroups(0xffffffff); cup.ownerCollisionAfter = 0; }
        const p = cup.body.translation(), velocity = cup.body.linvel();
        const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
        if (p.y < .4 && cup.previousVelocity > 3.1 && this.elapsed - cup.releasedAt > .16 && this.elapsed - (cup.lastImpact || -100) > .4) {
          cup.lastImpact = this.elapsed;
          this.spill(cup, 10 + cup.previousVelocity * 3, p, 'A dropped mug spilled on impact.');
          if (cup.previousVelocity > 6.8 || (cup.previousVelocity > 4.4 && this.rand() < .22)) {
            this.breakCup(cup, p, 'A mug broke. Its owner needs another cup.');
          }
        }
        cup.previousVelocity = speed;
        if (!cup.broken && p.y < -2) this.breakCup(cup, p, 'A lost mug must be replaced.');
      }
    }
    for (const station of this.stations) {
      if (!station.busy || !station.cupId) continue;
      const cup = this.cups.find(c => c.id === station.cupId);
      cup.coffee = Math.min(100, cup.coffee + dt * 100 / station.duration);
      station.progress = cup.coffee / 100;
      if (cup.coffee >= 100) {
        station.busy = false; station.ready = true;
        this.log('Coffee ready. Anyone can take the unattended mug.', 'ready', station.ownerId, station);
        for (const a of this.agents) a.rethink = 0;
      }
    }
  }
  shove(a, victim) {
    if (!victim || a === victim || a.fallen || victim.fallen || a.cooldown > 0 || this.elapsed < victim.safeUntil || distance(a, victim) > 1.12) return false;
    const d = Math.max(.05, distance(a, victim)), dx = (victim.x - a.x) / d, dz = (victim.z - a.z) / d;
    if (!this.fall(victim, dx, dz, `was pushed by ${a.name}`)) return false;
    a.cooldown = 4 + this.rand() * 3; a.action = 'push'; a.pushTimer = .48; a.heading = Math.atan2(dx, dz); a.moving = false;
    this.log(`${a.name} shoved ${victim.name}; the mug must drop before it can be taken.`, 'push', a.id, a);
    return true;
  }
  fixedStep(dt) {
    this.elapsed += dt;
    const closed = (this.elapsed + 8) % LEVEL.gate.period >= LEVEL.gate.period - LEVEL.gate.closedFor;
    if (closed !== this.gate.closed) {
      this.gate.closed = closed;
      this.log(closed ? 'The middle passage is closing. North and south service aisles stay open.' : 'The middle passage is open again.', 'gate', null, this.gate);
      for (const a of this.agents) { a.rethink = 0; a.routeTimer = 0; }
    }
    this.gate.nextChange = closed ? LEVEL.gate.period - ((this.elapsed + 8) % LEVEL.gate.period) : LEVEL.gate.period - LEVEL.gate.closedFor - ((this.elapsed + 8) % LEVEL.gate.period);
    this.gateBody.setNextKinematicTranslation({ x: this.gate.x, y: closed ? .65 : -2, z: this.gate.z });
    for (const a of this.agents) { this.control(a, dt); if (this.finished) return; }
    this.updateCups(dt);
    this.world.timestep = dt; this.world.step();
    for (const a of this.agents) {
      const p = a.body.translation(); a.x = p.x; a.z = p.z;
      this.carryRisk(a, dt);
      const c = this.cupFor(a); if (!a.delivered) a.coffee = c?.coffee || 0; a.carrying = !!c;
      if (!a.delivered) {
        const station = this.stations.find(s => s.ownerId === a.id && s.cupId);
        a.progress = c?.coffee >= 55 ? .63 + clamp(1 - distance(a, LEVEL.customer.delivery) / 18, 0, 1) * .35 : station ? .34 + station.progress * .25 : c ? .2 + clamp(1 - Math.min(...this.stations.map(s => distance(a, s))) / 12, 0, 1) * .12 : .06;
      }
    }
    this.spills = this.spills.filter(s => (s.ttl -= dt) > 0).slice(-32);
  }
  step(dt) {
    if (this.finished || this.disposed || !Number.isFinite(dt) || dt <= 0) return;
    this.accumulator += Math.min(dt, .25);
    while (this.accumulator + 1e-9 >= STEP && !this.finished) { this.fixedStep(STEP); this.accumulator -= STEP; }
  }
  finish() {
    if (this.finished) return this.winner;
    this.finished = true; this.winner = null; this.timedOut = true;
    this.log('Time! No valid delivery. All bets are refunded.', 'draw'); return null;
  }
  snapshot() {
    return { elapsed: this.elapsed, winner: this.winner, finished: this.finished, timedOut: !!this.timedOut,
      agents: this.agents.map(a => ({ id: a.id, name: a.name, color: a.color, trait: a.trait, x: a.x, y: a.y, z: a.z, vx: a.body.linvel().x, vz: a.body.linvel().z, heading: a.heading, coffee: a.coffee, carrying: a.carrying, cupId: a.cupId, state: a.state, action: a.action, moving: a.moving, fallen: a.fallen, recovery: a.recovery, pushRemaining: a.pushTimer, progress: a.progress, decision: a.decision, controlled: a.controlled, command: a.command ? structuredClone(a.command) : null, lastCommand: a.lastCommand ? structuredClone(a.lastCommand) : null, standingUp: a.standingUp, speed: this.movementSpeed(a), availableActions: this.availableActions(a), contextualAction: this.availableActions(a).find(action => !['drop', 'push'].includes(action.type)) || null, pace: a.strategy.pace, route: a.strategy.route, delivered: a.delivered, interaction: a.interaction ? { ...a.interaction } : null, falls: a.falls, steals: a.steals })),
      cups: this.cups.map(c => {
        const p = c.body.translation(), q = c.body.rotation();
        const offset = { x: .34 * (q.x * q.y - q.w * q.z), y: .17 * (1 - 2 * (q.x * q.x + q.z * q.z)), z: .34 * (q.y * q.z + q.w * q.x) };
        return { id: c.id, holderId: c.holderId, x: p.x - offset.x, y: p.y - offset.y, z: p.z - offset.z, rotation: { ...q }, coffee: c.coffee, broken: c.broken, stationId: c.stationId, surfaceId: c.surfaceId, slosh: Math.min(1, c.slosh), rack: c.rack, delivered: !!c.delivered };
      }),
      stations: this.stations.map(s => ({ ...s })), surfaces: this.surfaces.map(s => ({ ...s })), gate: { ...this.gate },
      props: this.props.map(p => ({ id: p.id, ...p.body.translation(), rotation: { ...p.body.rotation() } })),
      spills: this.spills.map(s => ({ ...s })), events: this.events.map(e => ({ ...e })),
    };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.world.free();
  }
}
