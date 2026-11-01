import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentPlanner } from './planner.js';

const runners = [{ id: 'pip', name: 'Pip', trait: 'Careful' }];
const snapshot = { elapsed: 1, finished: false, agents: [], spills: [], events: [] };
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('no API key keeps local controllers active without network calls', () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const planner = new AgentPlanner(runners);
    planner.update({ setStrategy() { assert.fail('No model strategy should be applied'); } }, snapshot);
    assert.equal(planner.mode, 'local');
    assert.equal(planner.busy, false);
    planner.dispose();
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

test('validated model decisions affect only existing runners and constrain aggression', async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = 'test-key';
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ decisions: [
    { id: 'pip', pace: 'careful', route: 'detour', aggression: 7 },
    { id: 'unknown', pace: 'fast', route: 'direct', aggression: 1 },
  ] }) }] }] }) });
  try {
    const calls = [];
    const planner = new AgentPlanner(runners);
    planner.update({ setStrategy: (...args) => calls.push(args) }, snapshot);
    await flush();
    assert.deepEqual(calls, [['pip', { pace: 'careful', route: 'detour', aggression: 1 }]]);
    assert.equal(planner.mode, 'openai');
    planner.dispose();
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test('a delayed model response from an ended round cannot control a new race', async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = 'test-key';
  let resolveResponse;
  globalThis.fetch = () => new Promise((resolve) => { resolveResponse = resolve; });
  try {
    const calls = [];
    const planner = new AgentPlanner(runners);
    planner.update({ setStrategy: (...args) => calls.push(args) }, snapshot);
    planner.reset();
    resolveResponse({ ok: true, json: async () => ({ output_text: JSON.stringify({ decisions: [{ id: 'pip', pace: 'fast', route: 'direct', aggression: 1 }] }) }) });
    await flush();
    assert.equal(calls.length, 0);
    assert.equal(planner.mode, 'local');
    planner.dispose();
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test('model context describes the shared customer and authoritative persistent objects', async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = 'test-key';
  let request;
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return { ok: true, json: async () => ({ output_text: '{"decisions":[]}' }) };
  };
  try {
    const planner = new AgentPlanner(runners);
    const state = { ...snapshot, cups: [{ id: 'cup-1', holderId: null, coffee: 100 }], stations: [{ id: 'brew-a', ready: true }], gate: { closed: true } };
    await planner.plan(state);
    assert.match(request.instructions, /single shared waiting customer/);
    assert.match(request.instructions, /held mugs must first be dropped/);
    const context = JSON.parse(request.input);
    assert.deepEqual(context.cups, state.cups);
    assert.deepEqual(context.stations, state.stations);
    assert.deepEqual(context.gate, state.gate);
    planner.dispose();
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test('model tactics cannot change a runner under direct player control', async () => {
  const planner = new AgentPlanner(runners), calls = [];
  planner.enabled = true;
  planner.plan = async () => [{ id: 'pip', pace: 'careful', route: 'detour', aggression: 1 }];
  planner.update({ setStrategy: (...args) => calls.push(args) }, { ...snapshot, agents: [{ id: 'pip', controlled: true }] });
  await flush();
  assert.deepEqual(calls, []);
  planner.dispose();
});
