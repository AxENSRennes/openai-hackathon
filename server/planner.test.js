import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentPlanner, decisionOptions } from './planner.js';
import { CoffeeSimulation, RUNNERS, initializePhysics } from '../shared/simulation.js';

await initializePhysics();
const flush = () => new Promise(resolve => setImmediate(resolve));
const movement = { type: 'move', x: 1, z: 0, durationMs: 250, pace: 'careful' };
function fixture(fetchImpl = async () => { throw new Error('Unexpected network request'); }, apiKey = 'test-key') {
  const simulation = new CoffeeSimulation();
  const planner = new AgentPlanner(RUNNERS, { apiKey, fetchImpl });
  return { simulation, planner, close() { planner.dispose(); simulation.dispose(); } };
}

test('without a key all runners wait; model modes are rejected and external control still works', () => {
  const f = fixture(undefined, '');
  try {
    assert.equal(f.planner.mode, 'idle');
    assert.equal(f.planner.configure(f.simulation, 'astra', { mode: 'decisions' }).ok, false);
    assert.equal(f.planner.configure(f.simulation, 'astra', { mode: 'responses' }).ok, false);
    assert.equal(f.planner.configure(f.simulation, 'astra', { mode: 'external' }).ok, true);
    f.planner.update(f.simulation);
    assert.equal(f.simulation.agents[0].command, null);
  } finally { f.close(); }
});

for (const mode of ['responses', 'decisions']) {
  test(`${mode} chooses an actual physical command using the full observed world`, async () => {
    let request, endpoint;
    const f = fixture(async (url, options) => {
      endpoint = url; request = JSON.parse(options.body);
      return { ok: true, json: async () => mode === 'responses' ? { output: [{ content: [{ type: 'output_text', text: JSON.stringify(movement) }] }] } : { answers: [{ type: 'choice', name: 'next_command', choice: 'move:east:careful:250' }] } };
    });
    try {
      f.planner.configure(f.simulation, 'astra', { mode, instruction: 'Move east carefully.' });
      f.planner.update(f.simulation); await flush();
      assert.equal(endpoint, `https://api.openai.com/v1/${mode}`);
      assert.deepEqual(f.simulation.agents[0].command.type, 'move');
      const before = f.simulation.agents[0].x;
      for (let i = 0; i < 40; i++) f.simulation.step(1 / 60);
      assert.ok(f.simulation.agents[0].x > before + .2);
      assert.equal(f.simulation.agents[0].lastCommand.status, 'completed');
      const observation = mode === 'responses' ? JSON.parse(request.input) : request.input[1].content[0].data;
      assert.equal(observation.self.id, 'astra');
      assert.equal(observation.instruction, 'Move east carefully.');
      assert.ok(observation.map.obstacles.length && observation.cups.length);
      assert.equal(observation.rules.noAutomaticNavigation, true);
      assert.equal(f.simulation.agents[1].command, null, 'A runner decision never controls another runner');
      if (mode === 'decisions') assert.ok(request.questions[0].choices.every(c => typeof c.value === 'string'));
    } finally { f.close(); }
  });
}

test('Decisions refuses invalid choices; model errors leave characters idle without fallback', async () => {
  for (const answer of [{ ok: false, status: 429 }, { ok: true, json: async () => ({ answers: [{ type: 'refusal', name: 'next_command' }] }) }, { ok: true, json: async () => ({ answers: [{ type: 'choice', name: 'next_command', choice: 'teleport' }] }) }]) {
    const f = fixture(async () => answer);
    try {
      f.planner.configure(f.simulation, 'astra', { mode: 'decisions' });
      f.planner.update(f.simulation); await flush();
      for (let i = 0; i < 120; i++) f.simulation.step(1 / 60);
      assert.equal(f.simulation.agents[0].command, null);
      assert.match(f.planner.summaries()[0].status, /Model unavailable; character waiting/);
      assert.equal(f.planner.mode, 'decisions');
    } finally { f.close(); }
  }
});

for (const change of ['instruction', 'round', 'human', 'replace']) {
  test(`a delayed model response cannot survive a ${change} change`, async () => {
    let resolve;
    const f = fixture(() => new Promise(done => { resolve = done; }));
    try {
      f.planner.configure(f.simulation, 'astra', { mode: 'responses' });
      f.planner.update(f.simulation);
      if (change === 'instruction') f.planner.instruct(f.simulation, 'astra', 'Wait here.');
      if (change === 'round') f.planner.reset(f.simulation);
      if (change === 'human') f.simulation.setControl('astra', true);
      if (change === 'replace') f.planner.configure(f.simulation, 'astra', { mode: 'external' });
      resolve({ ok: true, json: async () => ({ output_text: JSON.stringify(movement) }) });
      await flush();
      assert.equal(f.simulation.agents[0].command, null);
    } finally { f.close(); }
  });
}

test('external commands require current round, instruction version, ordered sequence, and idempotent retries', () => {
  const f = fixture();
  try {
    const session = f.planner.configure(f.simulation, 'astra', { mode: 'external' });
    assert.ok(f.planner.authorized('astra', session.token));
    assert.equal(f.planner.authorized('opus', session.token), false);
    const envelope = { round: 1, revision: session.revision, sequence: 1, command: movement };
    const accepted = f.planner.issue(f.simulation, 'astra', envelope);
    assert.equal(accepted.ok, true);
    assert.deepEqual(f.planner.issue(f.simulation, 'astra', envelope), accepted);
    assert.equal(f.planner.issue(f.simulation, 'astra', { ...envelope, command: { type: 'stop' } }).ok, false);
    assert.equal(f.planner.issue(f.simulation, 'astra', { ...envelope, sequence: 9 }).ok, false);
    const updated = f.planner.instruct(f.simulation, 'astra', 'Wait.');
    assert.equal(f.simulation.agents[0].command, null);
    assert.equal(f.simulation.agents[0].lastCommand.status, 'cancelled');
    assert.equal(f.planner.issue(f.simulation, 'astra', { ...envelope, sequence: 2 }).ok, false);
    assert.equal(f.planner.issue(f.simulation, 'astra', { ...envelope, revision: updated.revision, command: { type: 'stop' } }).ok, true);
    assert.equal(f.planner.summaries().some(c => 'token' in c), false);
  } finally { f.close(); }
});

test('Decisions action menu contains explicit reachable targets and standing up, without goal macros', () => {
  const f = fixture();
  try {
    let observation = f.planner.observe(f.simulation, 'astra');
    let choices = decisionOptions(observation);
    assert.ok(choices.some(c => c.command.type === 'move'));
    assert.equal(choices.some(c => ['move_to', 'win', 'find_path'].includes(c.command.type)), false);
    f.simulation.fall(f.simulation.agents[0], 0, 0);
    observation = f.planner.observe(f.simulation, 'astra');
    choices = decisionOptions(observation);
    assert.deepEqual(choices.map(c => c.command.type), ['wait', 'stand_up']);
  } finally { f.close(); }
});

test('a timed-out model request releases its busy flag and leaves the runner waiting', async () => {
  const f = fixture((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })));
  try {
    f.planner.timeoutMs = 20;
    f.planner.configure(f.simulation, 'astra', { mode: 'responses' });
    f.planner.update(f.simulation);
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(f.planner.summaries()[0].busy, false);
    assert.match(f.planner.summaries()[0].status, /Model unavailable/);
    assert.equal(f.simulation.agents[0].command, null);
  } finally { f.close(); }
});
