import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { io } from 'socket.io-client';
import { CoffeeSimulation, initializePhysics, RUNNERS, LEVEL } from '../shared/simulation.js';

const target = process.env.REVIEW_URL || 'http://127.0.0.1:5174';
const address = new URL(target);
assert.ok(['localhost', '127.0.0.1'].includes(address.hostname) && address.port && address.port !== '5173', 'Use an isolated development server.');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = new URL('../test-results/controls/', import.meta.url).pathname;
await mkdir(output, { recursive: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, timeout = 5000) { const start = Date.now(); while (!predicate()) { if (Date.now() - start > timeout) throw new Error('Manual review condition timed out.'); await pause(40); } }
const ack = (socket, event, payload) => new Promise((resolve, reject) => { const done = (error, result) => error ? reject(error) : resolve(result); if (payload === undefined) socket.timeout(5000).emit(event, done); else socket.timeout(5000).emit(event, payload, done); });
const clients = [], errors = [], checkpoints = [];
async function connect() { const socket = io(target, { transports: ['websocket'] }); clients.push(socket); await until(() => socket.connected); return socket; }
const host = await connect(); let state; host.on('state', value => { state = value; }); await until(() => state);
await initializePhysics(); const navigator = new CoffeeSimulation();
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: process.env.REVIEW_VIDEO === '0' ? undefined : { dir: output, size: { width: 1280, height: 720 } } });
const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
const onDemand = process.env.REVIEW_RENDER_ON_DEMAND === '1';
if (onDemand) await page.route('**/client/scene.js*', async route => {
  const response = await route.fetch();
  await route.fulfill({ response, body: (await response.text()).replace('this.container = container;', 'window.keyboardReviewScene = this; this.container = container;') });
});
const held = new Set();
async function keys(desired) {
  for (const key of [...held]) if (!desired.has(key)) { await page.keyboard.up(key); held.delete(key); }
  for (const key of desired) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
}
const agent = () => state.agents.find(item => item.id === 'astra');
async function navigate(goal) {
  const start = Date.now();
  while (Math.hypot(agent().x - goal.x, agent().z - goal.z) > .34) {
    assert.equal(state.phase, 'racing', 'The manual scenario must remain in the active round.');
    if (Date.now() - start > 40000) throw new Error(`Could not reach ${JSON.stringify(goal)} from ${JSON.stringify(agent())}`);
    navigator.gate.closed = state.gate.closed;
    for (const prop of state.props) { const body = navigator.props.find(item => item.id === prop.id)?.body; body?.setTranslation({ x: prop.x, y: .52, z: prop.z }, true); }
    const route = navigator.pathTo(agent(), goal);
    const next = route.find(point => Math.hypot(agent().x - point.x, agent().z - point.z) > .26) || goal;
    const dx = next.x - agent().x, dz = next.z - agent().z, desired = new Set();
    if (Math.abs(dx) > .08) desired.add(dx > 0 ? 'ArrowRight' : 'ArrowLeft');
    if (Math.abs(dz) > .08) desired.add(dz > 0 ? 'ArrowDown' : 'ArrowUp');
    if (agent().carrying || Math.hypot(agent().x - goal.x, agent().z - goal.z) < 1.8) desired.add('Shift');
    await keys(desired); await pause(70);
  }
  await keys(new Set()); await pause(180);
}
async function interact(type) {
  assert.equal(agent().contextualAction?.type, type, `Expected ${type}, agent=${JSON.stringify(agent())}`);
  const priorCup = agent().cupId;
  const targetId = agent().contextualAction.targetId;
  await page.keyboard.press('e');
  await until(() => type === 'take' ? !!agent().cupId : type === 'brew' ? state.stations.some(station => station.id === targetId && station.cupId === priorCup) : type === 'deliver' ? state.winner === 'astra' : !agent().interaction, 5000);
  await pause(120);
}
async function checkpoint(name) {
  if (onDemand) await page.evaluate(() => window.keyboardReviewScene.animate());
  checkpoints.push({ name, elapsed: state.elapsed, agent: agent(), cups: state.cups, stations: state.stations });
  console.log(name, state.elapsed.toFixed(2), agent().x.toFixed(2), agent().z.toFixed(2));
  await page.screenshot({ path: output + name + '.png', timeout: 60000 });
}
try {
  await page.addInitScript(() => { document.addEventListener('scene-ready', () => { window.reviewReady = true; }, true); });
  await page.goto(target, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.reviewReady, undefined, { timeout: 60000 });
  if (onDemand) {
    await page.waitForFunction(() => window.keyboardReviewScene);
    // Verify keyboard mechanics separately from software-GPU throughput. Screenshots still render real state.
    await page.evaluate(() => window.keyboardReviewScene.renderer.setAnimationLoop(null));
  }
  assert.equal((await ack(host, 'host:reset')).ok, true); await pause(300);
  // The other six runners are deliberately held idle to isolate the playable action contract.
  for (const runner of RUNNERS.filter(runner => runner.id !== 'astra')) { const controller = await connect(); assert.equal((await ack(controller, 'agent:control', { id: runner.id, enabled: true })).ok, true); }
  await page.getByRole('button', { name: 'Control Astra', exact: true }).click();
  await until(() => agent().controlled);
  assert.equal((await ack(host, 'host:start')).ok, true); await until(() => state.phase === 'racing');
  await page.locator('.scene-mount').focus();
  // Use the clear south aisle so this keyboard scenario does not depend on moving a chair.
  for (const point of [{ x: 1.4, z: 5.8 }, { x: -4.1, z: 5.8 }, { x: -4.1, z: 3.5 }]) await navigate(point);
  await navigate(LEVEL.cupRack); await interact('take'); assert.ok(agent().cupId);
  const cupId = agent().cupId; await checkpoint('take');
  for (const point of [{ x: -6.1, z: 3.2 }, { x: -6.1, z: -4.1 }]) await navigate(point);
  await navigate(LEVEL.stations[0]); await interact('brew');
  assert.equal(state.stations[0].cupId, cupId); assert.equal(agent().cupId, null);
  await navigate({ x: -7.5, z: -2.8 }); await checkpoint('unattended-brew');
  await until(() => state.stations[0].ready, 10000);
  await navigate(LEVEL.stations[0]); await interact('take'); assert.equal(agent().cupId, cupId);
  await checkpoint('coffee-carry');
  for (const point of [{ x: -6.1, z: -2.2 }, { x: -.5, z: -2.2 }, { x: -.5, z: 5.8 }, { x: 7.45, z: 5.8 }, { x: 7.45, z: .8 }]) await navigate(point);
  await navigate(LEVEL.customer.delivery); await interact('deliver');
  await until(() => state.phase === 'results');
  assert.equal(state.winner, 'astra'); assert.ok(agent().coffee >= 55);
  assert.ok(state.cups.find(cup => cup.id === cupId)?.delivered);
  await checkpoint('manual-delivery');
  assert.deepEqual(errors, []);
  await writeFile(output + 'report.json', JSON.stringify({ target, scenario: 'Actual browser keyboard play with six deliberately idle controlled rivals; ordinary unscripted competition is reviewed separately.', rendering: onDemand ? 'Real-state frames rendered at checkpoints to isolate keyboard mechanics from software-GPU throughput.' : 'Continuous rendering', checkpoints, winner: state.winner, coffee: agent().coffee, errors }, null, 2));
} finally {
  await keys(new Set()).catch(() => {});
  for (const client of clients) client.disconnect();
  navigator.dispose(); await context.close(); await browser.close();
}
console.log('Actual WebGL keyboard round verified:', output);
