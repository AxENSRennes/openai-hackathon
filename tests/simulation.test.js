import test from 'node:test';
import assert from 'node:assert/strict';
import { CoffeeSimulation, MAP, RUNNERS } from '../shared/simulation.js';

const tick = 1 / 30;
const obstacleAt = (agent, radius = .28) => MAP.obstacles.some(o =>
  Math.abs(agent.x - o.x) < o.w / 2 + radius && Math.abs(agent.z - o.z) < o.d / 2 + radius);

test('the same round reproduces the same physical incidents and outcome', () => {
  const first = new CoffeeSimulation({ round: 7 });
  const second = new CoffeeSimulation({ round: 7 });
  for (let frame = 0; frame < 1800; frame++) {
    first.step(tick);
    second.step(tick);
  }
  assert.deepEqual(first.snapshot(), second.snapshot());
});

test('desk assignments are complete, visible, and change between rounds', () => {
  const first = new CoffeeSimulation({ round: 1 }).snapshot();
  const second = new CoffeeSimulation({ round: 2 }).snapshot();
  assert.equal(new Set(first.agents.map(a => a.homeIndex)).size, RUNNERS.length);
  assert.notDeepEqual(first.agents.map(a => a.homeIndex), second.agents.map(a => a.homeIndex));
  for (const agent of first.agents) {
    const desk = MAP.desks[agent.homeIndex];
    assert.deepEqual(agent.home, { x: desk.targetX, z: desk.targetZ });
  }
});

test('races produce varied legitimate winners without getting stuck or crossing furniture', () => {
  const winners = new Set();
  let completed = 0;
  for (let round = 1; round <= 20; round++) {
    const sim = new CoffeeSimulation({ round });
    for (let frame = 0; frame < 3000 && !sim.finished; frame++) {
      sim.step(tick);
      for (const agent of sim.agents) {
        assert.ok(Number.isFinite(agent.x) && Number.isFinite(agent.z), `Non-finite position for ${agent.id}`);
        assert.ok(Math.abs(agent.x) <= 10.5 && Math.abs(agent.z) <= 6.5, `Out of bounds: ${agent.id}`);
        assert.ok(!obstacleAt(agent), `Agent entered furniture: ${agent.id} in round ${round}`);
        assert.ok(agent.coffee >= 0 && agent.coffee <= 100, `Invalid coffee amount: ${agent.id}`);
      }
    }
    if (!sim.finished) continue;
    completed++;
    const winner = sim.agents.find(a => a.id === sim.winner);
    assert.ok(winner?.delivered);
    assert.ok(winner.coffee >= 55);
    assert.ok(Math.hypot(winner.x - winner.home.x, winner.z - winner.home.z) <= .3);
    winners.add(winner.id);
  }
  assert.ok(completed >= 19, `Only ${completed} of 20 races completed within 100 seconds`);
  assert.ok(winners.size >= 4, `Only ${winners.size} distinct winners`);
});

test('a shove can transfer a cup without duplicating its contents', () => {
  const sim = new CoffeeSimulation();
  const [thief, victim] = sim.agents;
  Object.assign(thief, { x: 2, z: -1, coffee: 20, carrying: true, cooldown: -1, wait: 2 });
  Object.assign(victim, { x: 2.5, z: -1, coffee: 83, carrying: true, cooldown: 10 });
  thief.strategy.aggression = 1;
  sim.rand = () => 0;
  sim.collide(thief, victim, .1);
  assert.equal(thief.coffee, 83);
  assert.equal(victim.coffee, 0);
  assert.equal(thief.wait, 0);
  assert.equal(thief.stage, 'delivery');
  assert.equal(thief.steals, 1);
  assert.ok(sim.events.some(e => e.type === 'steal'));
});

test('falling pauses brewing rather than conjuring a full coffee on the floor', () => {
  const sim = new CoffeeSimulation();
  const agent = sim.agents[0];
  Object.assign(agent, { x: MAP.machine.x, z: MAP.machine.z, stage: 'machine', goal: MAP.machine, wait: 1, fallen: true, fallTimer: 2, carrying: true, coffee: 0 });
  sim.step(.1);
  assert.equal(agent.coffee, 0);
  assert.equal(agent.wait, 1);
});

test('empty navigation cannot claim delivery from the other side of the office', () => {
  const sim = new CoffeeSimulation();
  const agent = sim.agents[0];
  Object.assign(agent, { x: -8, z: -3.5, coffee: 100, stage: 'delivery', path: [], goal: agent.home, routeLeg: false });
  sim.step(tick);
  assert.equal(sim.winner, null);
  assert.equal(agent.delivered, false);
  assert.ok(agent.path.length > 0);
});

test('large knockback cannot tunnel through the partition', () => {
  const sim = new CoffeeSimulation();
  const body = { x: -2, z: -3, vx: 60, vz: 0 };
  sim.move(body, .1);
  assert.ok(body.x < -.8);
  assert.ok(!obstacleAt(body));
});

test('timed-out rounds draw and completed rounds stop changing', () => {
  const sim = new CoffeeSimulation();
  assert.equal(sim.finish(), null);
  assert.equal(sim.finished, true);
  assert.equal(sim.snapshot().timedOut, true);
  assert.ok(sim.events.some(e => e.type === 'draw'));
  const completed = sim.snapshot();
  sim.step(1);
  assert.deepEqual(sim.snapshot(), completed);
});

test('invalid tick durations and strategies cannot poison the world state', () => {
  const sim = new CoffeeSimulation();
  const agent = sim.agents[0];
  sim.setStrategy(agent.id, { pace: 'unknown', route: 'unknown', aggression: Infinity });
  for (const dt of [NaN, Infinity, -1, 0]) sim.step(dt);
  assert.equal(sim.elapsed, 0);
  assert.ok(Number.isFinite(agent.strategy.aggression));
  assert.equal(agent.strategy.route, 'direct');
  assert.equal(agent.strategy.pace, 'fast');
});
