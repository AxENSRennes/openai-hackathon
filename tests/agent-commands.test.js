import test from 'node:test';
import assert from 'node:assert/strict';
import { CoffeeSimulation, LEVEL, initializePhysics } from '../shared/simulation.js';

await initializePhysics();
const advance = (sim, seconds) => { for (let i = 0; i < Math.ceil(seconds * 60) && !sim.finished; i++) sim.step(1 / 60); };
function position(a, x, z) {
  Object.assign(a, { x, z, vx: 0, vz: 0 });
  a.body.setTranslation({ x, y: .78, z }, true); a.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
}
function run(sim, command) {
  const result = sim.executeCommand('astra', command);
  assert.equal(result.ok, true, result.error);
  for (let i = 0; i < 180 && sim.agents[0].command && !sim.finished; i++) sim.step(1 / 60);
  assert.equal(sim.agents[0].lastCommand.status, 'completed', JSON.stringify(sim.agents[0].lastCommand));
  return result;
}

test('unassigned agents never move, fetch mugs, push, or stand up on their own', () => {
  const sim = new CoffeeSimulation();
  try {
    const before = sim.agents.map(a => ({ x: a.x, z: a.z }));
    advance(sim, 20);
    for (const [i, a] of sim.agents.entries()) {
      assert.ok(Math.hypot(a.x - before[i].x, a.z - before[i].z) < .01);
      assert.equal(a.cupId, null); assert.equal(a.task, null);
    }
    const [a, rival] = sim.agents;
    position(a, LEVEL.cupRack.x, LEVEL.cupRack.z);
    advance(sim, 2); assert.equal(a.cupId, null);
    sim.takeCup(a, sim.cups[0]); sim.cups[0].coffee = 100;
    position(rival, a.x + .8, a.z); rival.cooldown = 0; rival.strategy.aggression = 1;
    advance(sim, 3); assert.equal(a.fallen, false, 'Proximity never triggers a shove');
    sim.fall(a, 0, 0); advance(sim, 5); assert.equal(a.fallen, true);
    run(sim, { type: 'stand_up' }); assert.equal(a.fallen, false);
  } finally { sim.dispose(); }
});

test('bounded movement collides with furniture and never reroutes or applies unsticking impulses', () => {
  const sim = new CoffeeSimulation();
  try {
    const a = sim.agents[0]; position(a, -1.3, -3.8);
    for (let i = 0; i < 4; i++) run(sim, { type: 'move', x: 1, z: 0, durationMs: 1000 });
    assert.ok(a.x < .4 - .16 - .28);
    assert.ok(Math.abs(a.z + 3.8) < .02, 'A wall does not make the game choose a detour');
    assert.ok(Math.hypot(a.lastCommand.end.x - a.lastCommand.start.x, a.lastCommand.end.z - a.lastCommand.start.z) < .02);
    advance(sim, 1); const stopped = { x: a.x, z: a.z }; advance(sim, 2);
    assert.ok(Math.hypot(a.x - stopped.x, a.z - stopped.z) < .01);
  } finally { sim.dispose(); }
});

test('commands reject malformed input, unavailable targets, busy runners, and human-controlled runners', () => {
  const sim = new CoffeeSimulation();
  try {
    for (const command of [null, { type: 'teleport' }, { type: 'move', x: NaN, z: 0, durationMs: 100 }, { type: 'move', x: 1, z: 0, durationMs: 5000 }, { type: 'look', heading: Infinity }, { type: 'take' }, { type: 'push', targetId: 'opus' }, { type: 'take', targetId: sim.cups[0].id }]) assert.equal(sim.executeCommand('astra', command).ok, false);
    assert.equal(sim.executeCommand('astra', { type: 'wait', durationMs: 500 }).ok, true);
    assert.equal(sim.executeCommand('astra', { type: 'look', heading: 0 }).ok, false);
    assert.equal(sim.executeCommand('astra', { type: 'stop' }).ok, true);
    sim.setControl('astra', true);
    assert.equal(sim.executeCommand('astra', { type: 'move', x: 1, z: 0, durationMs: 500 }).ok, false);
  } finally { sim.dispose(); }
});

test('a contested pickup reports failure instead of silently choosing another nearby cup', () => {
  const sim = new CoffeeSimulation();
  try {
    const [a, rival] = sim.agents; position(a, -7.3, 3.5); position(rival, -6.6, 3.5); a.heading = 0;
    assert.equal(sim.executeCommand('astra', { type: 'take', targetId: sim.cups[0].id }).ok, true);
    assert.equal(sim.takeCup(rival, sim.cups[0]), true);
    advance(sim, .5);
    assert.equal(a.cupId, null); assert.equal(a.lastCommand.status, 'failed');
    assert.equal(sim.cups[0].holderId, rival.id);
  } finally { sim.dispose(); }
});

test('an explicit external courier controller completes pickup, unattended brewing, and delivery through real physics', () => {
  const sim = new CoffeeSimulation();
  const a = sim.agents[0];
  // This test controller chooses paths and commands outside the simulation's control loop.
  function drive(goal) {
    for (let attempt = 0; attempt < 250 && Math.hypot(a.x - goal.x, a.z - goal.z) > .55; attempt++) {
      const points = sim.pathTo(a, goal);
      const next = points.find(point => Math.hypot(a.x - point.x, a.z - point.z) > .2) || goal;
      const dx = next.x - a.x, dz = next.z - a.z, d = Math.hypot(dx, dz);
      run(sim, { type: 'move', x: dx / d, z: dz / d, durationMs: Math.max(50, Math.min(500, d / sim.movementSpeed(a) * 800)), pace: 'careful' });
    }
    assert.ok(Math.hypot(a.x - goal.x, a.z - goal.z) <= .55, `External test controller failed to reach ${JSON.stringify(goal)}`);
    run(sim, { type: 'stop' });
    advance(sim, .2);
    run(sim, { type: 'look', heading: Math.atan2(goal.x - a.x, goal.z - a.z) });
  }
  try {
    drive(LEVEL.cupRack);
    const cup = sim.cups[0]; run(sim, { type: 'take', targetId: cup.id });
    assert.equal(a.cupId, cup.id);
    drive(LEVEL.stations[0]); run(sim, { type: 'brew', targetId: 'brew-a' });
    assert.equal(a.cupId, null); advance(sim, 7);
    run(sim, { type: 'take', targetId: cup.id });
    assert.equal(a.coffee, 100);
    drive(LEVEL.customer.delivery); run(sim, { type: 'deliver' });
    assert.equal(sim.winner, 'astra'); assert.equal(cup.delivered, true); assert.ok(cup.coffee >= 85);
    assert.equal(sim.agents.slice(1).some(a => a.cupId || a.command), false);
  } finally { sim.dispose(); }
});
