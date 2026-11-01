import test from 'node:test';
import assert from 'node:assert/strict';
import { CoffeeSimulation, LEVEL, RUNNERS, initializePhysics } from '../shared/simulation.js';

await initializePhysics();
const tick = 1 / 60;
const advance = (sim, seconds) => { for (let i = 0; i < Math.round(seconds / tick) && !sim.finished; i++) sim.step(tick); };
function isolate(sim) {
  for (const a of sim.agents) {
    a.rethink = Infinity; a.target = null; a.task = null; a.path = []; a.cooldown = Infinity;
    a.vx = 0; a.vz = 0; a.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }
}
function position(a, x, z) {
  a.x = x; a.z = z; a.vx = 0; a.vz = 0;
  a.body.setTranslation({ x, y: .78, z }, true);
  a.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
}
function ownership(snapshot) {
  const held = snapshot.cups.filter(c => c.holderId);
  assert.equal(new Set(held.map(c => c.holderId)).size, held.length, 'One held cup per runner');
  for (const cup of snapshot.cups) {
    assert.ok(cup.coffee >= 0 && cup.coffee <= 100);
    assert.ok(Number.isFinite(cup.x + cup.y + cup.z));
    if (cup.holderId) {
      assert.equal(cup.stationId, null);
      assert.equal(cup.surfaceId, null);
      assert.equal(cup.broken, false);
      assert.equal(snapshot.agents.find(a => a.id === cup.holderId)?.cupId, cup.id);
    }
    if (cup.surfaceId) assert.equal(snapshot.surfaces.find(s => s.id === cup.surfaceId)?.cupId, cup.id);
    if (cup.stationId) assert.equal(snapshot.stations.find(s => s.id === cup.stationId)?.cupId, cup.id);
  }
  for (const a of snapshot.agents) {
    assert.equal(a.carrying, !!a.cupId);
    if (a.cupId) assert.equal(snapshot.cups.find(c => c.id === a.cupId)?.holderId, a.id);
  }
}

test('seeded Rapier worlds reproduce complete rounds and ownership changes', () => {
  const first = new CoffeeSimulation({ round: 7 }), second = new CoffeeSimulation({ round: 7 });
  try {
    for (let frame = 0; frame < 3000 && !first.finished; frame++) { first.step(tick); second.step(tick); }
    assert.ok(first.finished);
    assert.deepEqual(first.snapshot(), second.snapshot());
  } finally { first.dispose(); second.dispose(); }
});

test('a placed mug keeps brewing after its owner leaves and can be stolen without duplicating coffee', () => {
  const sim = new CoffeeSimulation();
  try {
    isolate(sim);
    const [owner, rival] = sim.agents, cup = sim.cups[0], station = sim.stations[0];
    position(owner, LEVEL.cupRack.x, LEVEL.cupRack.z);
    assert.ok(sim.takeCup(owner, cup));
    position(owner, station.x, station.z);
    assert.ok(sim.placeCup(owner, station));
    position(owner, 4, 4);
    advance(sim, station.duration + .1);
    assert.equal(cup.holderId, null);
    assert.equal(cup.coffee, 100);
    assert.equal(station.ready, true);
    position(rival, station.x, station.z);
    assert.ok(sim.takeCup(rival, cup));
    assert.equal(cup.holderId, rival.id);
    assert.equal(owner.cupId, null);
    assert.equal(station.cupId, null);
    ownership(sim.snapshot());
    assert.ok(sim.events.some(e => e.type === 'steal' && e.actorId === rival.id));
  } finally { sim.dispose(); }
});

test('held mugs cannot be taken; a physical drop spills, settles, and can be recovered', () => {
  const sim = new CoffeeSimulation();
  try {
    isolate(sim);
    const [owner, rival] = sim.agents, cup = sim.cups[0];
    position(owner, LEVEL.cupRack.x, LEVEL.cupRack.z);
    assert.ok(sim.takeCup(owner, cup)); cup.coffee = 100;
    position(rival, owner.x + .8, owner.z);
    assert.equal(sim.takeCup(rival, cup), false);
    position(owner, -1.5, 1);
    sim.dropCup(owner, .2, 0);
    assert.equal(cup.holderId, null);
    assert.equal(owner.cupId, null);
    assert.ok(cup.coffee < 100);
    advance(sim, 1.8);
    assert.ok(cup.body.translation().y < .7, 'Gravity settles a dropped mug on the floor');
    assert.equal(cup.broken, false);
    const p = cup.body.translation(); position(rival, p.x + .55, p.z);
    assert.ok(sim.takeCup(rival, cup));
    ownership(sim.snapshot());
    assert.ok(sim.spills.length);
  } finally { sim.dispose(); }
});

test('an opponent must shove and physically drop the held mug before recovering it', () => {
  const sim = new CoffeeSimulation();
  try {
    isolate(sim);
    const [thief, owner] = sim.agents, cup = sim.cups[0];
    position(owner, LEVEL.cupRack.x, LEVEL.cupRack.z); sim.takeCup(owner, cup); cup.coffee = 100; owner.coffee = 100;
    position(owner, -.7, 1); position(thief, -1.5, 1);
    thief.strategy.aggression = 1; thief.cooldown = 0; sim.rand = () => .9;
    assert.equal(sim.takeCup(thief, cup), false);
    sim.rand = () => 0; sim.contest(); sim.rand = () => .9;
    assert.equal(owner.fallen, true);
    assert.equal(cup.holderId, null);
    assert.equal(thief.cupId, null, 'A shove never transfers held ownership directly');
    assert.equal(thief.action, 'push');
    advance(sim, .3);
    assert.equal(thief.action, 'push', 'Push survives several network snapshot intervals');
    advance(sim, 1.3);
    const p = cup.body.translation(); position(thief, p.x + .55, p.z);
    assert.ok(sim.takeCup(thief, cup));
    assert.equal(cup.holderId, thief.id);
    assert.ok(cup.coffee < 100);
    ownership(sim.snapshot());
  } finally { sim.dispose(); }
});

test('a hard physical impact breaks a mug and its agent can prepare a replacement', () => {
  const sim = new CoffeeSimulation();
  try {
    isolate(sim); const a = sim.agents[0], cup = sim.cups[0];
    position(a, LEVEL.cupRack.x, LEVEL.cupRack.z); sim.takeCup(a, cup); cup.coffee = 100;
    position(a, -1.5, 1); sim.dropCup(a);
    cup.body.setTranslation({ x: -1.5, y: 4, z: 1 }, true);
    cup.body.setLinvel({ x: 0, y: -4, z: 0 }, true);
    position(a, -2, 2.5);
    isolate(sim); advance(sim, 1.2);
    assert.equal(cup.broken, true);
    assert.equal(cup.coffee, 0);
    assert.equal(cup.body.numColliders(), 0, 'Rendered shards must not retain an invisible intact-mug collider');
    assert.ok(sim.events.some(e => e.type === 'break'));
    a.rethink = 0;
    for (let i = 0; i < 1200 && !a.cupId; i++) sim.step(tick);
    assert.ok(a.cupId && a.cupId !== cup.id, 'The agent obtains a replacement after breakage');
    ownership(sim.snapshot());
  } finally { sim.dispose(); }
});

test('failed cups can be refilled and a fallen runner recovers instead of being eliminated', () => {
  const sim = new CoffeeSimulation();
  try {
    isolate(sim); const a = sim.agents[0], cup = sim.cups[0], station = sim.stations[1];
    position(a, LEVEL.cupRack.x, LEVEL.cupRack.z); sim.takeCup(a, cup); cup.coffee = 20;
    position(a, station.x, station.z); assert.ok(sim.placeCup(a, station));
    position(a, -2, 1); sim.fall(a, 0, 1, 'lost balance');
    advance(sim, 2);
    assert.equal(a.fallen, false);
    assert.equal(a.falls, 1);
    assert.ok(cup.coffee > 20, 'Unattended brewing continues while the owner recovers');
    advance(sim, 4);
    assert.equal(cup.coffee, 100);
  } finally { sim.dispose(); }
});

test('real rigid-body collisions stop high speed runners at furniture and move chairs', () => {
  const sim = new CoffeeSimulation();
  try {
    isolate(sim);
    const a = sim.agents[0];
    position(a, -1.3, -3.8);
    a.body.setLinvel({ x: 60, y: 0, z: 0 }, true);
    sim.world.timestep = .1; sim.world.step();
    assert.ok(a.body.translation().x < LEVEL.obstacles.find(o => o.id === 'partition-north').x - .3);
    const chair = sim.props[0].body, start = chair.translation();
    chair.applyImpulse({ x: 5, y: 0, z: 1 }, true);
    for (let i = 0; i < 30; i++) { sim.world.timestep = tick; sim.world.step(); }
    assert.ok(Math.hypot(chair.translation().x - start.x, chair.translation().z - start.z) > .15);
  } finally { sim.dispose(); }
});

test('the timed gate closes the direct corridor and navigation finds the south route', () => {
  const sim = new CoffeeSimulation();
  try {
    isolate(sim); advance(sim, 9.1);
    assert.equal(sim.gate.closed, true);
    const path = sim.pathTo({ x: -1.5, z: 0 }, { x: 1.4, z: 0 });
    assert.ok(path.length);
    assert.ok(path.some(p => p.z > 4.2));
    assert.ok(path.every(p => !sim.blocked(p)));
    const north = sim.pathTo({ x: -1.2, z: -4.5 }, { x: 1.2, z: -4.5 });
    assert.ok(north.length && north.some(p => p.z <= -5.7), 'The northern service aisle is a real alternate loop');
    assert.ok(north.every(p => !sim.blocked(p)));
    advance(sim, 5);
    assert.equal(sim.gate.closed, false);
    const middle = sim.pathTo({ x: -1.5, z: 0 }, { x: 1.4, z: 0 });
    assert.ok(middle.length && middle.every(p => p.z > -1.5 && p.z < 1.1), 'The open middle passage is the short third route');
  } finally { sim.dispose(); }
});

test('all six spawns reach shared resources through the denser arena with either gate state', () => {
  const sim = new CoffeeSimulation();
  try {
    for (const closed of [false, true]) {
      sim.gate.closed = closed;
      for (const spawn of LEVEL.spawns) {
        assert.equal(sim.blocked(spawn), false);
        for (const target of [LEVEL.cupRack, ...LEVEL.stations, LEVEL.customer.delivery]) {
          const path = sim.pathTo(spawn, target);
          assert.ok(path.length, `A spawn cannot reach (${target.x}, ${target.z}) with gate closed=${closed}`);
          assert.ok(path.every(p => !sim.blocked(p)));
        }
      }
    }
  } finally { sim.dispose(); }
});

test('navigation removes grid zigzags while every remaining segment clears furniture', () => {
  const sim = new CoffeeSimulation();
  try {
    const straight = sim.pathTo({ x: -8, z: 2 }, { x: -6, z: 2 });
    assert.equal(straight.length, 1, 'An unobstructed lane needs one purposeful destination');
    const diagonalLane = sim.pathTo({ x: -8, z: 2 }, { x: -6, z: 3 });
    assert.deepEqual(diagonalLane, [{ x: -6, z: 3 }], 'An open diagonal lane does not turn at every grid cell');
    const start = { x: -6, z: -2.2 }, goal = { x: -2, z: 1.3 };
    const aroundIsland = sim.pathTo(start, goal);
    assert.ok(aroundIsland.length > 1 && aroundIsland.length < 10);
    let from = start;
    for (const point of aroundIsland) {
      assert.ok(sim.lineClear(from, point));
      from = point;
    }
  } finally { sim.dispose(); }
});

test('measured turns spill a fast carried coffee; careful pace protects it and cooldown prevents repeated losses', () => {
  const sim = new CoffeeSimulation();
  try {
    isolate(sim); const [fast, careful] = sim.agents;
    for (const a of [fast, careful]) {
      position(a, LEVEL.cupRack.x, LEVEL.cupRack.z);
      const cup = sim.cups.find(c => c.rack); sim.takeCup(a, cup); cup.coffee = 100;
      a.previousVelocity = { x: 2.6, z: 0 };
      a.body.setLinvel({ x: 0, y: 0, z: 2.6 }, true);
    }
    fast.strategy.pace = 'fast'; careful.strategy.pace = 'careful';
    sim.carryRisk(fast, .1); sim.carryRisk(careful, .1);
    const fastCup = sim.cupFor(fast), carefulCup = sim.cupFor(careful);
    assert.ok(fastCup.coffee < carefulCup.coffee && carefulCup.coffee <= 100);
    assert.ok(fastCup.coffee >= 93, 'A sharp corner is a readable small spill, not automatic failure');
    const afterSpill = fastCup.coffee;
    fast.body.setLinvel({ x: -2.6, y: 0, z: 0 }, true); sim.carryRisk(fast, .1);
    assert.equal(fastCup.coffee, afterSpill, 'One turn cannot drain a cup on every physics tick');
    assert.ok(sim.spills.some(s => Math.hypot(s.dx, s.dz) > .9), 'Spilled liquid follows measured inertia');
    assert.ok(sim.events.some(e => e.type === 'spill'));
    fast.previousVelocity = { x: -2.6, z: 0 };
    sim.elapsed += 2;
    for (let i = 0; i < 60; i++) sim.carryRisk(fast, tick);
    assert.equal(fastCup.coffee, afterSpill, 'Constant speed on a straight lane does not spill');
  } finally { sim.dispose(); }
});

test('shared island surfaces retain a placed mug and permit contextual rival pickup', () => {
  const sim = new CoffeeSimulation();
  try {
    isolate(sim); const [owner, rival] = sim.agents, cup = sim.cups[0], surface = sim.surfaces[0];
    position(owner, LEVEL.cupRack.x, LEVEL.cupRack.z); sim.takeCup(owner, cup);
    position(owner, surface.x, surface.z); assert.ok(sim.placeOnSurface(owner, surface));
    assert.equal(owner.cupId, null); assert.equal(cup.holderId, null); assert.equal(cup.surfaceId, surface.id);
    position(owner, 4, 4); isolate(sim); advance(sim, 2);
    const placed = sim.snapshot().cups.find(c => c.id === cup.id);
    assert.ok(Math.abs(placed.y - surface.cupY) < .01);
    position(rival, surface.x, surface.z); assert.ok(sim.takeCup(rival, cup));
    assert.equal(cup.surfaceId, null); assert.equal(surface.cupId, null); assert.equal(cup.holderId, rival.id);
    assert.ok(sim.events.some(e => e.type === 'place'));
    ownership(sim.snapshot());
  } finally { sim.dispose(); }
});

test('manual movement uses physics collisions, normalized input, stale stopping, and resumes autonomous decisions', () => {
  const sim = new CoffeeSimulation();
  try {
    isolate(sim); const a = sim.agents[0]; position(a, -1.3, -3.8);
    assert.ok(sim.setControl(a.id, true));
    const strategy = { ...a.strategy }; sim.setStrategy(a.id, { pace: 'careful', route: 'detour', aggression: 0 });
    assert.deepEqual(a.strategy, strategy, 'Autonomous tactics cannot override a directly controlled runner');
    for (let i = 0; i < 120; i++) { if (i % 10 === 0) sim.setInput(a.id, { x: 1, z: 0 }); sim.step(tick); }
    assert.ok(a.x < .4 - .16 - .28, 'Manual runners cannot pass through the partition');
    assert.equal(sim.snapshot().agents[0].controlled, true);
    position(a, 3, 5); sim.setInput(a.id, { x: 1, z: 1 });
    assert.ok(Math.abs(Math.hypot(a.input.x, a.input.z) - 1) < 1e-9);
    advance(sim, .8); const stopped = { x: a.x, z: a.z }; advance(sim, .5);
    assert.ok(Math.hypot(a.x - stopped.x, a.z - stopped.z) < .02, 'Missing input packets stop movement');
    sim.setControl(a.id, false); sim.step(tick);
    assert.equal(a.controlled, false); assert.ok(a.task, 'The bot makes a new useful decision after release');
  } finally { sim.dispose(); }
});

test('manual contextual input picks up, places, brews, and drops the same persistent mug', () => {
  const sim = new CoffeeSimulation();
  try {
    isolate(sim); const a = sim.agents[0]; position(a, LEVEL.cupRack.x, LEVEL.cupRack.z); sim.setControl(a.id, true);
    assert.equal(sim.snapshot().agents[0].contextualAction.type, 'take');
    sim.setInput(a.id, { interact: true }); advance(sim, .5);
    const id = a.cupId; assert.ok(id);
    const surface = sim.surfaces[0]; position(a, surface.x, surface.z); a.heading = Math.PI;
    sim.setInput(a.id, {}); sim.setInput(a.id, { interact: true }); advance(sim, .65);
    assert.equal(a.cupId, null); assert.equal(sim.cups.find(c => c.id === id).surfaceId, surface.id);
    sim.setInput(a.id, {}); sim.setInput(a.id, { interact: true }); advance(sim, .5);
    assert.equal(a.cupId, id);
    const station = sim.stations[0]; position(a, station.x, station.z); a.heading = Math.PI;
    sim.setInput(a.id, {}); sim.setInput(a.id, { interact: true }); advance(sim, .75);
    assert.equal(a.cupId, null); assert.equal(station.cupId, id); assert.ok(station.progress > 0);
    sim.setInput(a.id, {}); sim.setInput(a.id, { interact: true }); advance(sim, .5);
    assert.equal(a.cupId, id, 'A human may take an unfinished brew, then refill it later');
    sim.setInput(a.id, { drop: true }); sim.step(tick);
    assert.equal(a.cupId, null); assert.equal(sim.cups.find(c => c.id === id).holderId, null);
    ownership(sim.snapshot());
  } finally { sim.dispose(); }
});

test('manual shove uses the same recoverable fall and never steals a held mug directly', () => {
  const sim = new CoffeeSimulation();
  try {
    isolate(sim); const [player, victim] = sim.agents, cup = sim.cups[0];
    position(victim, LEVEL.cupRack.x, LEVEL.cupRack.z); sim.takeCup(victim, cup); cup.coffee = 100;
    position(victim, -.5, 1); position(player, -1.3, 1); player.heading = Math.PI / 2;
    sim.setControl(player.id, true); player.cooldown = 0;
    sim.setInput(player.id, { push: true }); sim.step(tick);
    assert.equal(player.action, 'push'); assert.equal(victim.fallen, true);
    assert.equal(cup.holderId, null); assert.equal(player.cupId, null);
    assert.ok(player.pushTimer > .4); assert.ok(cup.coffee < 100);
    ownership(sim.snapshot());
  } finally { sim.dispose(); }
});

test('busy action pulses are discarded, repeated control claims are idempotent, and expired input clears queued commands', () => {
  const sim = new CoffeeSimulation();
  try {
    isolate(sim); const a = sim.agents[0], cup = sim.cups[0], station = sim.stations[0];
    position(a, LEVEL.cupRack.x, LEVEL.cupRack.z); sim.takeCup(a, cup); sim.setControl(a.id, true);
    position(a, station.x, station.z); a.heading = Math.PI;
    sim.setInput(a.id, { interact: true }); advance(sim, .1);
    const interaction = a.interaction; assert.ok(interaction);
    sim.setControl(a.id, true); assert.equal(a.interaction, interaction, 'An acknowledged retry cannot cancel an action');
    sim.setInput(a.id, {}); advance(sim, .2);
    sim.setInput(a.id, { interact: true }); sim.step(tick);
    for (let i = 0; i < 70; i++) { if (i % 10 === 0) sim.setInput(a.id, {}); sim.step(tick); }
    assert.equal(a.cupId, null, 'A pulse during brewing anticipation must not take the mug back afterward');
    assert.equal(station.cupId, cup.id);
    position(a, LEVEL.cupRack.x, LEVEL.cupRack.z); sim.takeCup(a, sim.cups.find(c => c.rack));
    const held = a.cupId; sim.setInput(a.id, { drop: true }); sim.stopInput(a.id); sim.step(tick);
    assert.equal(a.cupId, held, 'Expiration clears an unconsumed action pulse as well as movement');
  } finally { sim.dispose(); }
});

test('the first delivery ends the tick atomically with one winner and an immutable delivered cup', () => {
  const sim = new CoffeeSimulation();
  try {
    isolate(sim); const [first, second] = sim.agents;
    for (const [index, a] of [first, second].entries()) {
      position(a, LEVEL.cupRack.x, LEVEL.cupRack.z); const cup = sim.cups.find(c => c.rack); sim.takeCup(a, cup); cup.coffee = 100;
      position(a, LEVEL.customer.delivery.x + (index ? .3 : -.3), LEVEL.customer.delivery.z);
      a.interaction = { type: 'deliver', remaining: .001, duration: .65 };
    }
    sim.step(tick);
    assert.equal(sim.winner, first.id); assert.equal(first.delivered, true); assert.equal(second.delivered, false);
    assert.equal(sim.events.filter(e => e.type === 'win').length, 1);
    const delivered = sim.cups.find(c => c.delivered);
    assert.equal(sim.takeCup(second, delivered), false);
    assert.equal(second.carrying, true);
    ownership(sim.snapshot());
  } finally { sim.dispose(); }
});

test('only a reachable coffee above the threshold can serve the single shared customer', () => {
  const sim = new CoffeeSimulation();
  try {
    isolate(sim); const a = sim.agents[0], cup = sim.cups[0];
    position(a, LEVEL.cupRack.x, LEVEL.cupRack.z); sim.takeCup(a, cup); cup.coffee = 100;
    a.interaction = { type: 'deliver' }; sim.completeInteraction(a);
    assert.equal(sim.winner, null, 'A distant agent cannot claim delivery');
    position(a, LEVEL.customer.delivery.x, LEVEL.customer.delivery.z); cup.coffee = 54.99;
    a.interaction = { type: 'deliver' }; sim.completeInteraction(a);
    assert.equal(sim.winner, null);
    cup.coffee = 55; a.interaction = { type: 'deliver' }; sim.completeInteraction(a);
    assert.equal(sim.winner, a.id);
    assert.equal(a.delivered, true);
    assert.equal(cup.delivered, true);
    assert.equal(cup.holderId, null);
    assert.equal(a.carrying, false);
    ownership(sim.snapshot());
  } finally { sim.dispose(); }
});

test('varied complete rounds preserve all cup ownership, bounds, furniture, and delivery invariants', () => {
  const winners = new Set(), incidents = { fall: 0, steal: 0, break: 0 };
  for (let round = 1; round <= 20; round++) {
    const sim = new CoffeeSimulation({ round });
    try {
      for (let frame = 0; frame < 6000 && !sim.finished; frame++) {
        sim.step(tick);
        if (frame % 30 !== 0) continue;
        const state = sim.snapshot(); ownership(state);
        for (const a of state.agents) {
          assert.ok(Number.isFinite(a.x + a.z));
          assert.ok(a.x >= LEVEL.bounds.minX && a.x <= LEVEL.bounds.maxX && a.z >= LEVEL.bounds.minZ && a.z <= LEVEL.bounds.maxZ);
          assert.ok(!LEVEL.obstacles.some(o => Math.hypot(Math.max(0, Math.abs(a.x - o.x) - o.w / 2), Math.max(0, Math.abs(a.z - o.z) - o.d / 2)) < .28), `${a.id} intersected furniture in round ${round}`);
        }
      }
      assert.ok(sim.finished, `Round ${round} did not complete within 100 seconds`);
      const winner = sim.agents.find(a => a.id === sim.winner);
      assert.ok(winner?.delivered && winner.coffee >= 55);
      assert.ok(Math.hypot(winner.x - LEVEL.customer.delivery.x, winner.z - LEVEL.customer.delivery.z) < .85);
      winners.add(sim.winner);
      incidents.fall += sim.agents.reduce((n, a) => n + a.falls, 0);
      incidents.steal += sim.agents.reduce((n, a) => n + a.steals, 0);
      incidents.break += sim.cups.filter(c => c.broken).length;
    } finally { sim.dispose(); }
  }
  assert.ok(winners.size > 1, 'Seeds must change the competitive outcome');
  assert.ok(incidents.fall > 0 && incidents.steal > 0 && incidents.break > 0, 'Real rounds exercise recoverable incidents');
});

test('fixed substeps agree across frame rates; invalid inputs and disposal are safe', () => {
  const first = new CoffeeSimulation({ round: 3 }), second = new CoffeeSimulation({ round: 3 });
  try {
    for (let i = 0; i < 300; i++) first.step(1 / 30);
    for (let i = 0; i < 600; i++) second.step(1 / 60);
    assert.deepEqual(first.snapshot(), second.snapshot());
    const before = first.snapshot();
    for (const dt of [NaN, Infinity, -1, 0]) first.step(dt);
    assert.deepEqual(first.snapshot(), before);
    first.setStrategy(RUNNERS[0].id, { pace: 'unknown', route: 'unknown', aggression: Infinity });
    assert.ok(Number.isFinite(first.agents[0].strategy.aggression));
  } finally { first.dispose(); first.dispose(); second.dispose(); }
});

test('timed out races are a draw and finished worlds stop changing', () => {
  const sim = new CoffeeSimulation();
  try {
    assert.equal(sim.finish(), null);
    assert.equal(sim.snapshot().timedOut, true);
    assert.ok(sim.events.some(e => e.type === 'draw'));
    const before = sim.snapshot(); sim.step(1); assert.deepEqual(sim.snapshot(), before);
  } finally { sim.dispose(); }
});
