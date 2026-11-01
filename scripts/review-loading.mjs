import assert from 'node:assert/strict';
import { RUNNERS } from '../shared/level.js';
import { mkdir, writeFile } from 'node:fs/promises';

const target = process.env.REVIEW_URL || 'http://127.0.0.1:5191';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = new URL('../test-results/loading/', import.meta.url).pathname;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const errors = [];
const capture = () => {
  document.addEventListener('scene-visible', () => { window.sceneVisibleAt = performance.now(); }, true);
  document.addEventListener('scene-ready', () => { window.sceneReadyAt = performance.now(); }, true);
  document.addEventListener('scene-runner-ready', event => { window.loadedRunners = (window.loadedRunners || []).concat(event.detail.id); }, true);
  document.addEventListener('scene-progress', event => { window.loadingEvents = (window.loadingEvents || []).concat(event.detail.percent); }, true);
};
const collect = () => ({
  visibleMs: Math.round(window.sceneVisibleAt),
  readyMs: Math.round(window.sceneReadyAt),
  progressEvents: window.loadingEvents?.length || 0,
  finalProgress: window.loadingEvents?.at(-1),
  runners: window.loadedRunners,
  resources: performance.getEntriesByType('resource').filter(r => /\.glb($|\?)|\/shared-textures\//.test(r.name)).map(r => ({ path: new URL(r.name).pathname, bytes: r.transferSize })),
  portraits: [...document.querySelectorAll('.portrait img')].every(img => img.complete && img.naturalWidth > 0),
});
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage(), cdp = await context.newCDPSession(page);
  page.on('pageerror', error => errors.push(error.message));
  await cdp.send('Network.enable');
  await cdp.send('Network.clearBrowserCache');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: 250000, uploadThroughput: 125000, latency: 150 });
  await page.addInitScript(capture);
  await page.goto(target, { waitUntil: 'domcontentloaded' });
  await page.getByRole('progressbar', { name: 'Office loading progress' }).waitFor();
  await page.waitForFunction(() => window.sceneReadyAt, undefined, { timeout: 60000 });
  const metrics = await page.evaluate(collect);
  assert.ok(metrics.visibleMs < metrics.readyMs, 'The office must appear before every character has finished loading.');
  assert.ok(metrics.readyMs < 60000);
  assert.equal(new Set(metrics.runners).size, RUNNERS.length);
  assert.ok(metrics.progressEvents > 5); assert.equal(metrics.finalProgress, 100); assert.equal(metrics.portraits, true);
  const texturePaths = metrics.resources.filter(r => r.path.includes('/shared-textures/')).map(r => r.path);
  assert.equal(new Set(texturePaths).size, texturePaths.length, 'Shared textures download only once across all runners.');
  assert.ok(texturePaths.length > 0);
  const totalBytes = metrics.resources.reduce((sum, resource) => sum + resource.bytes, 0);
  assert.ok(totalBytes < 3500000, `Unexpected 3D download size: ${totalBytes}`);
  console.log(JSON.stringify({ target, cache: 'cold', visibleMs: metrics.visibleMs, readyMs: metrics.readyMs, total3dBytes: totalBytes }));
  await page.screenshot({ path: output + 'slow-connection.png', timeout: 60000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.sceneReadyAt, undefined, { timeout: 30000 });
  const warm = await page.evaluate(collect);
  const warmBytes = warm.resources.reduce((sum, resource) => sum + resource.bytes, 0);
  assert.ok(warm.resources.length > 0);
  assert.ok(warmBytes < 200000, `Previously loaded 3D assets should come from cache: ${warmBytes}`);
  console.log(JSON.stringify({ target, cache: 'warm', visibleMs: warm.visibleMs, readyMs: warm.readyMs, total3dBytes: warmBytes }));
  await context.close();

  const staged = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  staged.on('pageerror', error => errors.push(error.message));
  await staged.addInitScript(capture);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await staged.route('**/assets/chair*.glb', async route => { await gate; await route.continue(); });
  try {
    await staged.goto(target, { waitUntil: 'domcontentloaded' });
    await staged.waitForFunction(() => window.sceneVisibleAt && window.loadedRunners?.length === 7, undefined, { timeout: 30000 });
    assert.equal(await staged.evaluate(() => Boolean(window.sceneReadyAt)), false, 'The office and all mascots must display while the final prop is still loading.');
    await staged.locator('.loading-office.has-scene').waitFor();
    await staged.screenshot({ path: output + 'progressive-office.png', timeout: 60000 });
    release();
    await staged.waitForFunction(() => window.sceneReadyAt, undefined, { timeout: 30000 });
    assert.equal(await staged.evaluate(() => window.loadedRunners.length), RUNNERS.length);
  } finally { release(); await staged.close(); }

  const retry = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  retry.on('pageerror', error => errors.push(error.message));
  await retry.route('**/assets/environment*.glb', route => route.abort());
  await retry.goto(target, { waitUntil: 'domcontentloaded' });
  await retry.getByRole('button', { name: 'Reload office' }).waitFor();
  assert.equal(await retry.locator('.loading-office').count(), 0, 'A failed request must not leave an indefinite spinner.');
  await retry.unroute('**/assets/environment*.glb');
  await retry.addInitScript(capture);
  await retry.getByRole('button', { name: 'Reload office' }).click();
  await retry.waitForFunction(() => window.sceneReadyAt, undefined, { timeout: 30000 });
  assert.deepEqual(errors, []);
  const report = { target, connection: '2 Mbit/s download, 150 ms latency', cold: { ...metrics, total3dBytes: totalBytes }, warm: { ...warm, total3dBytes: warmBytes }, progressiveScene: 'passed', failedDownloadRecovery: 'passed', errors };
  await writeFile(output + 'report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ progressiveScene: 'passed', failedDownloadRecovery: 'passed', errors }));
} finally { await browser.close(); }
