import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { io } from 'socket.io-client';

const target = process.env.REVIEW_URL || 'http://127.0.0.1:5174';
const url = new URL(target);
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.port && url.port !== '5173', 'Review only an isolated local development server.');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = new URL('../test-results/browser/', import.meta.url).pathname;
await mkdir(output, { recursive: true });
const socket = io(target, { transports: ['websocket'] });
let state;
const events = new Map(), snapshots = [];
socket.on('state', snapshot => {
  state = snapshot;
  for (const event of snapshot.events) events.set(event.id, event);
  if (snapshot.phase === 'racing' && (!snapshots.length || snapshot.elapsed - snapshots.at(-1).elapsed >= .25)) snapshots.push(snapshot);
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(test, timeout = 60000) {
  const start = Date.now();
  while (!test()) { if (Date.now() - start > timeout) throw new Error('Review condition timed out.'); await delay(50); }
}
const emit = (name, payload) => new Promise((resolve, reject) => {
  const callback = (error, result) => error ? reject(error) : resolve(result);
  if (payload === undefined) socket.timeout(5000).emit(name, callback);
  else socket.timeout(5000).emit(name, payload, callback);
});
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, recordVideo: { dir: output, size: { width: 1280, height: 720 } } });
const page = await context.newPage();
const errors = [], failedRequests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.url().includes('/assets/') && !response.ok()) failedRequests.push({ url: response.url(), status: response.status() }); });
await page.addInitScript(() => {
  document.addEventListener('scene-ready', event => { window.reviewSceneReady = event.detail || true; }, true);
  window.reviewFrames = []; let previous = performance.now();
  const frame = now => { if (window.reviewFrames.length < 10000) window.reviewFrames.push(now - previous); previous = now; requestAnimationFrame(frame); }; requestAnimationFrame(frame);
});
try {
  await until(() => socket.connected && state);
  await page.goto(target, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.reviewSceneReady, undefined, { timeout: 90000 });
  await page.locator('.portrait img').first().waitFor({ state: 'visible' });
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal(failedRequests.length, 0, JSON.stringify(failedRequests));
  console.log('Authored assets loaded in a real WebGL browser.');
  assert.equal((await emit('host:reset')).ok, true);
  await delay(500);
  await page.screenshot({ path: output + 'opening.png', timeout: 90000 });
  await page.getByRole('button', { name: 'Enable sound', exact: true }).click();
  assert.equal((await emit('host:reset')).ok, true);
  await delay(150);
  assert.equal((await emit('host:start')).ok, true);
  const round = state.round;
  for (const [time, label] of [[5, 'preparation'], [13, 'crowded'], [23, 'delivery-approach']]) {
    await until(() => state.round !== round || state.phase === 'results' || state.elapsed >= time);
    if (state.round !== round) break;
    await page.screenshot({ path: output + label + '.png', timeout: 90000 });
    console.log(label, state.elapsed.toFixed(2), state.phase);
    if (state.phase === 'results') break;
  }
  await until(() => state.round === round && state.phase === 'results', 100000);
  const result = state;
  assert.ok(result.winner, 'The complete observed round must produce a valid coffee delivery.');
  const winner = result.agents.find(agent => agent.id === result.winner);
  assert.ok(winner.delivered && winner.coffee >= 85);
  assert.ok(result.cups.some(cup => cup.delivered && !cup.holderId && !cup.broken));
  await page.screenshot({ path: output + 'result.png', timeout: 90000 });
  console.log('Complete browser round', result.round, result.winner, result.elapsed, winner.coffee);
  await page.getByRole('button', { name: 'Follow selected agent', exact: true }).click();
  await delay(800);
  await page.screenshot({ path: output + 'camera-follow.png', timeout: 90000 });
  await page.getByRole('button', { name: 'Show arena overview', exact: true }).click();
  const frames = await page.evaluate(() => window.reviewFrames);
  const recent = frames.filter(value => value > 0).slice(-300).sort((a, b) => a - b);
  const report = { target, actualBrowser: await browser.version(), viewport: { width: 1280, height: 720 }, round: result.round, elapsed: result.elapsed, winner: result.winner, deliveredCoffee: winner.coffee,
    incidents: [...events.values()].filter(event => event.id.startsWith(`${result.round}-`) && ['steal','drop','push','spill','fall','recover','break','gate'].includes(event.type)), errors, failedRequests,
    renderer: await page.evaluate(() => window.reviewSceneReady), frameMilliseconds: { median: recent[Math.floor(recent.length / 2)], p95: recent[Math.floor(recent.length * .95)], note: 'Measured in software-rendered headless Chromium on this VPS; this is not a hardware GPU performance certification.' } };
  await writeFile(output + 'report.json', JSON.stringify(report, null, 2));
  await writeFile(output + 'snapshots.json', JSON.stringify(snapshots.filter(snapshot => snapshot.round === result.round)));
  assert.equal(errors.length, 0, errors.join('\n'));
} finally {
  socket.disconnect(); await context.close(); await browser.close();
}
console.log('Browser review artifacts:', output);
