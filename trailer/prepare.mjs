import { mkdir, readFile, writeFile, copyFile, cp } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { recordPhysics, collisionTake } from './record-physics.mjs';
import { LEVEL } from '../shared/level.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const generated = path.join(root, 'generated');
await mkdir(generated, { recursive: true });

function position(agent, x, z, heading = 0) {
  agent.x = x; agent.z = z; agent.heading = heading;
  agent.vx = 0; agent.vz = 0;
  agent.body.setTranslation({ x, y: .78, z }, true);
  agent.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
}
function hold(sim, agent, coffee = 100) {
  position(agent, LEVEL.cupRack.x, LEVEL.cupRack.z);
  assert.ok(sim.takeCup(agent, sim.cups[0]));
  sim.cups[0].coffee = coffee; agent.coffee = coffee;
}
function background(sim) {
  const placements = [[-7, 1.5], [-6, 2.2], [-2.5, -3], [3, -5.4], [5.6, -4], [8, 5]];
  for (const [i, a] of sim.agents.slice(1).entries()) position(a, ...placements[i]);
}
function move(agentId, x, z, durationMs = 1000, pace = 'careful') {
  return { agentId, command: { type: 'move', x, z, durationMs, pace } };
}
const takes = {};
async function take(id, config) {
  const full = await recordPhysics({ round: 17, fps: 30, ...config });
  takes[id] = {
    ...full,
    initialConditions: config.description,
    frames: full.frames.map(({ agents, cups, props, stations, spills, gate, elapsed, frame, tick, winner, finished }) => ({
      frame, tick, elapsed, winner, finished, cups, props, stations, spills, gate,
      agents: agents.map(({ availableActions, contextualAction, command, lastCommand, decision, state, ...visual }) => visual),
    })),
  };
  console.log(`${id}: ${full.frames.length} states; ${full.events.map(e => e.type).join(', ')}`);
}

await take('question', { durationSeconds: 4, description: 'An empty cup on the existing rack. No live model controller.' });
await take('lineup', { durationSeconds: 5, description: 'The seven original mascots at their normal starting positions.' });
await take('brew', {
  durationSeconds: 9, description: 'Astra starts beside the machine with an empty cup. Brewing and pickup use the real game commands.',
  setup(sim) { background(sim); hold(sim, sim.agents[0], 0); position(sim.agents[0], -5.8, -3.7, Math.PI); },
  commands: [
    { tick: 0, agentId: 'astra', command: { type: 'brew', targetId: 'brew-b' } },
    { tick: 456, agentId: 'astra', command: { type: 'take', targetId: 'cup-17-1' } },
  ],
});
assert.ok(takes.brew.events.some(e => e.type === 'ready'));
assert.equal(takes.brew.frames.at(-1).agents[0].carrying, true);

await take('chaos', {
  durationSeconds: 9,
  description: 'Astra starts with freshly filled coffee. Opus waits in the passage. All motion, shove, drop, spill, and cup flight after setup come from Rapier and valid game commands.',
  setup(sim) {
    background(sim); hold(sim, sim.agents[0]);
    position(sim.agents[0], -1.3, .75, Math.PI / 2);
    position(sim.agents[1], 2.0, .75, -Math.PI / 2);
    sim.agents[1].cooldown = 0;
  },
  commands: [
    { tick: 0, ...move('astra', 1, 0) },
    { tick: 60, ...move('astra', 1, 0) },
    { tick: 120, ...move('astra', 1, 0) },
    { tick: 210, agentId: 'opus', command: { type: 'push', targetId: 'astra' } },
    { tick: 420, agentId: 'astra', command: { type: 'stand_up' } },
  ],
});
assert.ok(takes.chaos.events.some(e => e.type === 'push'));
assert.ok(takes.chaos.events.some(e => e.type === 'drop'));
assert.ok(takes.chaos.frames.some(f => f.cups[0].y < .4));

await take('customer', { durationSeconds: 3, description: 'The existing waiting customer. The seven mascots remain elsewhere in the office.' });
const route = [{ x: -.9, z: 4.9 }, { x: 1.5, z: 4.9 }, { x: 6.8, z: 4.9 }, { x: 7, z: 1.2 }];
let waypoint = 0;
await take('safe', {
  durationSeconds: 7, description: 'Astra carries a full cup along a directed south-aisle route at the game careful pace. The instruction overlay describes this staged route, not a live speech-recognition session.',
  setup(sim) { background(sim); hold(sim, sim.agents[0]); position(sim.agents[0], -.9, 3.2); },
  direct(sim, tick) {
    const a = sim.agents[0];
    if (a.command || a.fallen || tick % 6) return [];
    const goal = route[waypoint];
    if (Math.hypot(goal.x - a.x, goal.z - a.z) < .25) waypoint = Math.min(route.length - 1, waypoint + 1);
    const next = route[waypoint], dx = next.x - a.x, dz = next.z - a.z, d = Math.max(.001, Math.hypot(dx, dz));
    return [move('astra', dx / d, dz / d, 100)];
  },
});
assert.ok(takes.safe.frames.at(-1).agents[0].coffee >= 55);

await take('delivery', {
  durationSeconds: 3, description: 'Astra starts in legal delivery range with coffee above the 55% threshold. Serving uses the actual deliver command.',
  setup(sim) { background(sim); hold(sim, sim.agents[0]); position(sim.agents[0], 7, 1.25, Math.PI); },
  commands: [{ tick: 30, agentId: 'astra', command: { type: 'deliver' } }],
});
assert.ok(takes.delivery.events.some(e => e.type === 'win'));

await writeFile(path.join(generated, 'takes.json'), JSON.stringify(takes));
await writeFile(path.join(root, 'physics-take.json'), JSON.stringify(await recordPhysics(collisionTake)));
await mkdir(path.join(generated, 'public', 'audio'), { recursive: true });
await cp(path.join(root, 'assets'), path.join(generated, 'public'), { recursive: true });
await cp(path.join(root, '../public/assets'), path.join(generated, 'public/assets'), { recursive: true });
const script = JSON.parse(await readFile(path.join(root, 'script.json'), 'utf8'));
const voiceJobs = process.env.COFFEE_VOICE_JOBS_DIR || path.join(os.homedir(), '.local/share/coffee-trailer/voice-jobs');
const inbox = path.join(voiceJobs, script.jobId);
await mkdir(inbox, { recursive: true });
await copyFile(path.join(root, 'script.json'), path.join(inbox, 'request.json'));
await copyFile(path.join(root, '../video/assets/openai_hackathon.m4a'), path.join(generated, 'public/audio/music.m4a'));
console.log(`Voice request ready: ${inbox}/request.json`);
console.log('PASS: brewing, pickup, physical shove/drop, careful carry, and legal delivery verified.');
