import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { io } from 'socket.io-client';
import { RUNNERS } from '../shared/level.js';

const target = process.env.REVIEW_URL || 'http://127.0.0.1:5182';
const address = new URL(target);
assert.ok(['localhost', '127.0.0.1'].includes(address.hostname) && address.port && address.port !== '5173', 'Use an isolated local Vite development server.');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = new URL('../test-results/mascots/', import.meta.url).pathname;
await mkdir(output, { recursive: true });
const socket = io(target, { transports: ['websocket'], reconnection: false });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let state;
socket.on('state', value => { state = value; });
async function until(predicate) {
  const start = Date.now();
  while (!predicate()) { assert.ok(Date.now() - start < 8000, 'State update timed out'); await pause(30); }
}
const ack = event => new Promise((resolve, reject) => socket.timeout(5000).emit(event, (error, result) => error ? reject(error) : resolve(result)));
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], failedAssets = [], layouts = [], poses = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.url().includes('/assets/') && !response.ok()) failedAssets.push(response.url()); });
// Expose the scene only inside this test browser, without shipping a debug global.
await page.route('**/client/scene.js*', async route => {
  const response = await route.fetch();
  await route.fulfill({ response, body: (await response.text()).replace('this.container = container;', 'window.mascotReviewScene = this; this.container = container;') });
});
await page.addInitScript(() => document.addEventListener('scene-ready', () => { window.mascotReviewReady = true; }, true));
try {
  await until(() => state && socket.connected);
  assert.equal((await ack('host:reset')).ok, true);
  await page.goto(target, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.mascotReviewReady, undefined, { timeout: 60000 });
  await page.waitForFunction(() => window.mascotReviewScene?.characters.size === 7);
  assert.deepEqual(state.racers.map(runner => runner.name), RUNNERS.map(runner => runner.name));
  for (const runner of RUNNERS) {
    const button = page.getByRole('button', { name: new RegExp(`^Follow ${runner.name},`) });
    await button.click();
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: `Control ${runner.name}`, exact: true }).click();
    await page.getByRole('button', { name: 'Release control', exact: true }).waitFor();
    await until(() => state.agents.find(agent => agent.id === runner.id).controlled);
  }
  await page.getByRole('button', { name: 'Release control', exact: true }).click();
  console.log('All seven runner selections and control claims passed.');
  for (const width of [320, 390, 620, 850, 1280, 1440]) {
    await page.setViewportSize({ width, height: width < 621 ? 844 : 900 });
    const layout = await page.evaluate(() => ({ width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth,
      names: [...document.querySelectorAll('.runner-chip .chip-copy > strong')].map(node => ({ text: node.textContent, clipped: node.scrollWidth > node.clientWidth + 1 })),
      portraitsLoaded: [...document.querySelectorAll('.runner-chip img')].every(image => image.complete && image.naturalWidth > 0) }));
    assert.equal(layout.overflow, false, JSON.stringify(layout));
    assert.equal(layout.portraitsLoaded, true);
    assert.ok(layout.names.every(name => !name.clipped), JSON.stringify(layout));
    layouts.push(layout);
    if ([390, 1440].includes(width)) await page.screenshot({ path: `${output}lineup-${width}.png`, timeout: 60000 });
  }
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(`${target}/join`);
  await phone.locator('.bet-runner').last().waitFor();
  assert.equal(await phone.locator('.bet-runner').count(), 7);
  assert.equal((await ack('host:reset')).ok, true);
  await phone.getByRole('button', { name: /Mistral/ }).click();
  await phone.getByRole('button', { name: 'Back Mistral · 50', exact: true }).click();
  await phone.getByText('50 coins on Mistral', { exact: true }).waitFor();
  await phone.screenshot({ path: `${output}phone-mistral-bet.png` });
  await phone.close();
  console.log('Six responsive widths and the Mistral phone wager passed.');
  await page.evaluate(() => { window.mascotReviewScene.update = () => {}; document.querySelector('.game-hud').style.visibility = 'hidden'; });
  // Render fixtures inspect all seven poses in the real renderer; they do not simulate outcomes.
  for (const pose of ['idle', 'run', 'carry', 'push', 'fall', 'recover', 'interact', 'victory', 'wobble']) {
    await page.evaluate(({ snapshot, pose }) => {
      const scene = window.mascotReviewScene;
      const carrying = ['carry', 'wobble'].includes(pose);
      const fixture = structuredClone(snapshot); fixture.phase = 'racing'; fixture.events = [];
      fixture.agents.forEach((agent, index) => Object.assign(agent, {
        action: pose === 'wobble' ? 'carry' : pose, moving: ['run', 'carry', 'wobble'].includes(pose), vx: 1.5, vz: 0,
        heading: 0, fallen: ['fall', 'recover'].includes(pose), recovery: .32, delivered: pose === 'victory',
        carrying, cupId: carrying ? fixture.cups[index].id : null,
        pushRemaining: .24, interaction: pose === 'interact' ? { remaining: .3, duration: .6 } : null,
      }));
      fixture.cups.forEach((cup, index) => Object.assign(cup, { holderId: carrying && index < 7 ? fixture.agents[index].id : null, coffee: 100, slosh: pose === 'wobble' ? .8 : 0 }));
      scene.frames = []; scene.state = fixture; scene.syncState(fixture);
    }, { snapshot: state, pose });
    await pause(650);
    const rendered = await page.evaluate(() => [...window.mascotReviewScene.characters].map(([id, view]) => ({ id, pose: view.model.userData.pose, decorativeCupVisible: view.mascot.rig.cup.visible })));
    assert.equal(rendered.length, 7); assert.ok(rendered.every(view => !view.decorativeCupVisible));
    poses.push({ fixture: pose, rendered });
    await page.screenshot({ path: `${output}pose-${pose}.png`, timeout: 60000 });
  }
  assert.deepEqual(errors, []); assert.deepEqual(failedAssets, []);
  const renderer = await page.evaluate(() => ({ software: window.mascotReviewScene.softwareRenderer, lowPower: window.mascotReviewScene.lowPowerRendering, calls: window.mascotReviewScene.renderer.info.render.calls, triangles: window.mascotReviewScene.renderer.info.render.triangles }));
  await page.evaluate(() => window.mascotReviewScene.dispose());
  await writeFile(`${output}report.json`, JSON.stringify({ target, layouts, poses, renderer, controlled: RUNNERS.map(runner => runner.id), bet: '50 coins on Mistral', errors, failedAssets, note: 'Pose images use renderer fixtures. A separate keyboard review verifies real pickup, brewing, carrying, and delivery.' }, null, 2));
  console.log('Seven selectable/playable mascots, six responsive widths, Mistral phone wager, and nine renderer pose fixtures verified:', output);
} finally { socket.disconnect(); await browser.close(); }
