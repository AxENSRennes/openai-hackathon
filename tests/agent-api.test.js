import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';
import { GameAgentClient } from '../scripts/agent-client.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await predicate()) return; await pause(25); }
  assert.fail('Timed out waiting for the game server');
}
async function server(mock = false) {
  const reserve = createServer();
  await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  const args = mock ? ['--import', fileURLToPath(new URL('./fixtures/mock-openai.mjs', import.meta.url))] : [];
  args.push(fileURLToPath(new URL('../server/index.js', import.meta.url)));
  const child = spawn(process.execPath, args, { env: { ...process.env, NODE_ENV: 'production', PORT: String(port), OPENAI_API_KEY: mock ? 'test-only-no-network' : '' }, stdio: ['ignore', 'ignore', 'pipe'] });
  let errors = ''; child.stderr.on('data', data => { errors += data; });
  const exited = new Promise(resolve => child.once('exit', code => resolve(code)));
  const url = `http://127.0.0.1:${port}`;
  await until(async () => { if (child.exitCode !== null) assert.fail(errors); try { return (await fetch(`${url}/api/health`)).ok; } catch { return false; } });
  const socket = io(url, { transports: ['websocket'], reconnection: false });
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  return { url, socket, ack(event, payload) { return new Promise((resolve, reject) => {
    const done = (error, result) => error ? reject(error) : resolve(result);
    if (payload === undefined) socket.timeout(3000).emit(event, done); else socket.timeout(3000).emit(event, payload, done);
  }); }, async close() {
    socket.disconnect(); child.kill('SIGTERM');
    let timer;
    const code = await Promise.race([exited, new Promise(resolve => { timer = setTimeout(() => { child.kill('SIGKILL'); resolve(-1); }, 6000); })]);
    clearTimeout(timer); assert.equal(code, 0, errors);
  } };
}

test('an external agent controls real movement through HTTP with ownership, revisions, retries, and release', { timeout: 15000 }, async () => {
  const service = await server();
  try {
    const client = new GameAgentClient(service.url, 'astra');
    await client.claim('Move east.');
    const duplicate = await fetch(`${service.url}/api/agents/astra/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(duplicate.status, 409);
    const unauthorized = await fetch(`${service.url}/api/agents/astra/command`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(unauthorized.status, 403);
    await assert.rejects(client.command({ type: 'wait', durationMs: 100 }), /only during a race/);
    assert.equal((await service.ack('host:start')).ok, true);
    const before = await client.observe();
    const result = await client.command({ type: 'move', x: 1, z: 0, durationMs: 400 });
    assert.equal(result.result.status, 'completed');
    assert.ok(result.observation.self.x > before.self.x + .4);
    await pause(700); const stopped = await client.observe(); await pause(350);
    assert.ok(Math.abs((await client.observe()).self.x - stopped.self.x) < .02);
    const previous = await client.observe();
    await client.command({ type: 'move', x: 1, z: 0, durationMs: 1000 }, { wait: false });
    const revised = await service.ack('host:agent', { action: 'instruction', id: 'astra', instruction: 'Wait here.' });
    assert.equal(revised.ok, true); assert.ok(revised.revision > previous.revision);
    const after = await client.observe(); assert.equal(after.self.command, null);
    assert.equal(after.self.lastCommand.status, 'cancelled');
    assert.equal(JSON.stringify(after).includes(client.session.token), false);
    const stale = await fetch(`${service.url}/api/agents/astra/command`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${client.session.token}` }, body: JSON.stringify({ round: previous.round, revision: previous.revision, sequence: 3, command: { type: 'stop' } }) });
    assert.equal(stale.status, 409);
    await client.release();
    const unavailable = await service.ack('host:agent', { action: 'configure', id: 'astra', mode: 'decisions' });
    assert.equal(unavailable.ok, false); assert.match(unavailable.error, /OPENAI_API_KEY/);
    const voice = await fetch(`${service.url}/api/voice/transcribe`, { method: 'POST', headers: { 'Content-Type': 'audio/webm' }, body: new Uint8Array([1]) });
    assert.equal(voice.status, 503);
  } finally { await service.close(); }
});

test('Responses and Decisions HTTP modes execute isolated physical commands and accept revised voice instructions using a mock transport', { timeout: 15000 }, async () => {
  const service = await server(true);
  try {
    for (const [id, mode] of [['astra', 'responses'], ['opus', 'decisions']]) {
      assert.equal((await service.ack('host:agent', { action: 'configure', id, mode, instruction: 'Move east.' })).ok, true);
    }
    const astra = new GameAgentClient(service.url, 'astra'), opus = new GameAgentClient(service.url, 'opus');
    const starts = [await astra.observe(), await opus.observe()];
    assert.equal((await service.ack('host:start')).ok, true);
    for (const [index, client] of [astra, opus].entries()) await until(async () => (await client.observe()).self.x > starts[index].self.x + .25);
    const voice = await fetch(`${service.url}/api/voice/transcribe`, { method: 'POST', headers: { 'Content-Type': 'audio/webm' }, body: new Uint8Array([1, 2, 3]) });
    assert.deepEqual(await voice.json(), { ok: true, text: 'Wait here.' });
    for (const id of ['astra', 'opus']) assert.equal((await service.ack('host:agent', { action: 'instruction', id, instruction: 'Wait here.' })).ok, true);
    await pause(700); const stopped = [await astra.observe(), await opus.observe()]; await pause(350);
    for (const [index, client] of [astra, opus].entries()) {
      const observation = await client.observe();
      assert.ok(Math.abs(observation.self.x - stopped[index].self.x) < .02);
      assert.equal(observation.instruction, 'Wait here.');
      assert.equal(observation.controller.mode, index ? 'decisions' : 'responses');
      assert.ok(observation.controller.history.some(item => item.command.type === 'wait'));
    }
  } finally { await service.close(); }
});

test('the agent client observes a completed winning action even when race completion increments the revision', async () => {
  const client = new GameAgentClient('http://unused.local', 'astra', { token: 'test' });
  let reads = 0;
  client.observe = async () => ++reads === 1 ? { round: 1, revision: 2, sequence: 0 } : { round: 1, revision: 3, sequence: 0, finished: true, self: { lastCommand: { id: 9, type: 'deliver', status: 'completed' } } };
  client.request = async () => ({ ok: true, command: { id: 9 }, sequence: 1, revision: 2 });
  const result = await client.command({ type: 'deliver' });
  assert.equal(result.result.status, 'completed');
  assert.equal(result.observation.finished, true);
});
