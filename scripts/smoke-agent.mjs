import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { io } from 'socket.io-client';
import { GameAgentClient } from './agent-client.mjs';

const url = process.env.GAME_URL || 'http://127.0.0.1:5180';
const address = new URL(url);
assert.ok(['127.0.0.1', 'localhost'].includes(address.hostname) && address.port && address.port !== '5173', 'Use an isolated local server.');
const socket = io(url, { transports: ['websocket'], reconnection: false });
await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
const ack = event => new Promise((resolve, reject) => socket.timeout(3000).emit(event, (error, result) => error ? reject(error) : resolve(result)));
const client = new GameAgentClient(url, 'astra');
const commands = [];
async function command(action) {
  const result = await client.command(action);
  commands.push({ action, result: result.result });
  assert.equal(result.result.status, 'completed');
  return result.observation;
}
async function drive(x, z) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const observation = await client.observe(), a = observation.self;
    const dx = x - a.x, dz = z - a.z, d = Math.hypot(dx, dz);
    if (d < .35) break;
    if (attempt === 59) throw new Error(`The explicit test route is blocked at ${a.x},${a.z}`);
    await command({ type: 'move', x: dx / d, z: dz / d, pace: 'careful', durationMs: Math.max(50, Math.min(1000, d / a.speed * 850)) });
  }
  await command({ type: 'stop' });
}
try {
  assert.equal((await ack('host:reset')).ok, true);
  await client.claim('Follow the explicit test route, brew one coffee, and deliver it.');
  assert.equal((await ack('host:start')).ok, true);
  // These waypoints are chosen by this external test controller, never by the game server.
  for (const [x, z] of [[1.5, 5.2], [-4.1, 5.2], [-4.1, 3.5], [-7, 3.5]]) await drive(x, z);
  await command({ type: 'look', heading: 0 });
  let observation = await client.observe();
  const cup = observation.cups.find(c => c.rack && !c.broken);
  await command({ type: 'take', targetId: cup.id });
  console.log('Explicit pickup verified');
  for (const [x, z] of [[-6.1, 3.2], [-6.1, -4.1], [-5.8, -4.2]]) await drive(x, z);
  await command({ type: 'look', heading: Math.PI });
  await command({ type: 'brew', targetId: 'brew-b' });
  do { await command({ type: 'wait', durationMs: 1000 }); observation = await client.observe(); } while (!observation.stations.find(s => s.id === 'brew-b').ready);
  await command({ type: 'take', targetId: cup.id });
  console.log('Explicit brew and recovery verified');
  for (const [x, z] of [[-6.1, -2.2], [-.5, -2.2], [-.5, 4.6], [1.6, 4.6], [6.6, 4.6], [6.6, .8], [7, .65]]) await drive(x, z);
  await command({ type: 'look', heading: Math.PI });
  observation = await command({ type: 'deliver' });
  assert.equal(observation.self.delivered, true);
  assert.ok(observation.self.coffee >= 55);
  const report = { scenario: 'External scripted controller over HTTP; no model API or hidden game controller', winner: 'astra', coffee: observation.self.coffee, commands, elapsed: observation.elapsed };
  await mkdir('test-results/agent', { recursive: true });
  await writeFile('test-results/agent/live-external.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ winner: 'astra', coffee: observation.self.coffee, elapsed: observation.elapsed, commands: commands.length }));
} finally { await client.release().catch(() => {}); socket.disconnect(); }
