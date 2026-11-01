import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, timeout = 3000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await predicate()) return;
    await pause(25);
  }
  assert.fail('Timed out waiting for authoritative server state');
}
async function freePort() {
  const reservation = createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  return port;
}
const acknowledge = (socket, event, payload) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`No acknowledgement for ${event}`)), 2000);
  const done = result => { clearTimeout(timer); resolve(result); };
  if (payload === undefined) socket.emit(event, done);
  else socket.emit(event, payload, done);
});

test('socket controllers have exclusive ownership, racing-only input, stale stopping, switching, and disconnect release', { timeout: 15000 }, async () => {
  const port = await freePort(), url = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [fileURLToPath(new URL('../server/index.js', import.meta.url))], {
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production', OPENAI_API_KEY: '' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let diagnostics = '';
  child.stderr.on('data', data => { diagnostics += data; });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  const clients = [];
  try {
    await until(async () => {
      if (child.exitCode !== null) assert.fail(`Server exited during initialization: ${diagnostics}`);
      try { return (await fetch(`${url}/api/health`)).ok; } catch { return false; }
    });
    async function connect() {
      const client = { socket: io(url, { autoConnect: false, transports: ['websocket'], reconnection: false }), state: null };
      clients.push(client);
      client.socket.on('state', state => { client.state = state; });
      client.socket.connect();
      await new Promise((resolve, reject) => { client.socket.once('connect', resolve); client.socket.once('connect_error', reject); });
      await until(() => client.state !== null);
      return client;
    }
    const first = await connect(), second = await connect();
    assert.deepEqual(await acknowledge(first.socket, 'agent:control', { id: 'pip', enabled: true }), { ok: true, agentId: 'pip' });
    assert.equal((await acknowledge(second.socket, 'agent:control', { id: 'pip', enabled: true })).ok, false);
    assert.deepEqual(await acknowledge(first.socket, 'agent:control', { id: 'gary', enabled: true }), { ok: true, agentId: 'gary' });
    assert.equal((await acknowledge(second.socket, 'agent:control', { id: 'pip', enabled: true })).ok, true, 'Switching releases the previous runner');
    const agent = () => first.state.agents.find(a => a.id === 'gary');
    const beforeRace = agent().x;
    first.socket.emit('agent:input', { x: 1, z: 0 }); await pause(150);
    assert.equal(agent().x, beforeRace, 'Choosing a runner before the race does not move them');
    assert.equal((await acknowledge(first.socket, 'host:start')).ok, true);
    for (let i = 0; i < 10; i++) { first.socket.emit('agent:input', { x: 1, z: 0 }); await pause(50); }
    await until(() => agent().x > beforeRace + .4);
    await pause(750); const stopped = agent().x; await pause(350);
    assert.ok(Math.abs(agent().x - stopped) < .035, 'Expired movement packets must stop a controlled runner');
    first.socket.disconnect();
    await until(() => !second.state.agents.find(a => a.id === 'gary').controlled);
    assert.equal((await acknowledge(second.socket, 'agent:control', { id: 'gary', enabled: true })).ok, true, 'A disconnected controller cannot retain ownership');
    assert.deepEqual(await acknowledge(second.socket, 'agent:control', { enabled: false }), { ok: true, agentId: null });
    assert.equal(second.state.agents.find(a => a.id === 'gary').controlled, false);
    assert.equal((await acknowledge(second.socket, 'agent:control', { id: 'gary', enabled: true })).ok, true);
  } finally {
    child.kill('SIGTERM');
    let timer;
    const result = await Promise.race([exited, new Promise(resolve => { timer = setTimeout(() => resolve(null), 6000); })]);
    clearTimeout(timer);
    for (const client of clients) client.socket.disconnect();
    if (!result) child.kill('SIGKILL');
    assert.ok(result, 'The server must terminate with active or recently disconnected controllers');
    assert.equal(result.code, 0, diagnostics);
  }
});
