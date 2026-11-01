import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const target = process.env.REVIEW_URL || 'http://127.0.0.1:5182';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = new URL('../test-results/loading/', import.meta.url).pathname;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage(), cdp = await context.newCDPSession(page);
  page.on('pageerror', error => errors.push(error.message));
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: 250000, uploadThroughput: 125000, latency: 150 });
  await page.addInitScript(() => {
    document.addEventListener('scene-ready', () => { window.sceneReadyAt = performance.now(); }, true);
    document.addEventListener('scene-progress', event => { window.loadingEvents = (window.loadingEvents || []).concat(event.detail.percent); }, true);
  });
  await page.goto(target, { waitUntil: 'domcontentloaded' });
  await page.getByRole('progressbar', { name: 'Office loading progress' }).waitFor();
  await page.waitForFunction(() => window.sceneReadyAt, undefined, { timeout: 60000 });
  const metrics = await page.evaluate(() => ({
    readyMs: Math.round(window.sceneReadyAt),
    progressEvents: window.loadingEvents?.length || 0,
    finalProgress: window.loadingEvents?.at(-1),
    resources: performance.getEntriesByType('resource').filter(r => /\.glb($|\?)|\/shared-textures\//.test(r.name)).map(r => ({ path: new URL(r.name).pathname, bytes: r.transferSize })),
    portraits: [...document.querySelectorAll('.portrait img')].every(img => img.complete && img.naturalWidth > 0),
  }));
  assert.ok(metrics.readyMs < 60000);
  assert.ok(metrics.progressEvents > 5); assert.equal(metrics.finalProgress, 100); assert.equal(metrics.portraits, true);
  const texturePaths = metrics.resources.filter(r => r.path.includes('/shared-textures/')).map(r => r.path);
  assert.equal(new Set(texturePaths).size, texturePaths.length, 'Shared textures download only once across all runners.');
  assert.ok(texturePaths.length > 0);
  const totalBytes = metrics.resources.reduce((sum, resource) => sum + resource.bytes, 0);
  console.log(JSON.stringify({ target, readyMs: metrics.readyMs, total3dBytes: totalBytes }));
  assert.ok(totalBytes < 4500000, `Unexpected 3D download size: ${totalBytes}`);
  await page.screenshot({ path: output + 'slow-connection.png', timeout: 60000 });
  await context.close();

  const retry = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await retry.route('**/assets/environment.glb', route => route.abort());
  await retry.goto(target, { waitUntil: 'domcontentloaded' });
  await retry.getByRole('button', { name: 'Reload office' }).waitFor();
  assert.equal(await retry.locator('.loading-office').count(), 0, 'A failed request must not leave an indefinite spinner.');
  await retry.unroute('**/assets/environment.glb');
  await retry.addInitScript(() => document.addEventListener('scene-ready', () => { window.retried = true; }, true));
  await retry.getByRole('button', { name: 'Reload office' }).click();
  await retry.waitForFunction(() => window.retried, undefined, { timeout: 30000 });
  assert.deepEqual(errors, []);
  const report = { target, connection: '2 Mbit/s download, 150 ms latency, cold browser cache', ...metrics, total3dBytes: totalBytes, failedDownloadRecovery: 'passed', errors };
  await writeFile(output + 'report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ target, readyMs: metrics.readyMs, total3dBytes: totalBytes, progressEvents: metrics.progressEvents, failedDownloadRecovery: 'passed' }));
} finally { await browser.close(); }
