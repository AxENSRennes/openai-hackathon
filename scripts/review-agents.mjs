import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { io } from 'socket.io-client';
import { GameAgentClient } from './agent-client.mjs';

const target = process.env.REVIEW_URL || 'http://127.0.0.1:5181';
const noKeyTarget = process.env.NO_KEY_URL || 'http://127.0.0.1:5180';
for (const url of [target, noKeyTarget]) {
  const address = new URL(url);
  assert.ok(['127.0.0.1', 'localhost'].includes(address.hostname) && address.port && address.port !== '5173', 'Use isolated local review servers.');
}
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = 'test-results/agent';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage(), errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  class TestRecorder {
    static isTypeSupported() { return true; }
    constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm'; }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }) });
      queueMicrotask(() => this.onstop?.());
    }
  }
  window.MediaRecorder = TestRecorder;
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
});
const socket = io(target, { transports: ['websocket'], reconnection: false });
await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
const ack = event => new Promise((resolve, reject) => socket.timeout(3000).emit(event, (error, result) => error ? reject(error) : resolve(result)));
const client = new GameAgentClient(target, 'pip');
const until = async predicate => { const end = Date.now() + 6000; while (!(await predicate())) { if (Date.now() > end) throw new Error('Browser scenario timed out'); await new Promise(resolve => setTimeout(resolve, 40)); } };
try {
  await ack('host:reset');
  await page.goto(target, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Agent instructions', exact: true }).click();
  await page.getByLabel('Instruction for Pip').fill('Move east.');
  await page.getByRole('button', { name: 'Send instruction', exact: true }).click();
  await until(async () => (await client.observe()).controller.mode === 'responses');
  const start = await client.observe();
  await ack('host:start');
  await until(async () => (await client.observe()).self.x > start.self.x + .2);
  await page.getByLabel('Instruction for Pip').fill('Wait here.');
  await page.getByRole('button', { name: 'Send instruction', exact: true }).click();
  await until(async () => (await client.observe()).instruction === 'Wait here.');
  await page.getByLabel('Controller', { exact: true }).selectOption('decisions');
  await page.getByLabel('Instruction for Pip').fill('Move east.');
  await page.getByRole('button', { name: 'Send instruction', exact: true }).click();
  await until(async () => (await client.observe()).controller.mode === 'decisions');
  await page.getByRole('button', { name: 'Record instruction', exact: true }).click();
  await page.getByRole('button', { name: 'Stop recording and send', exact: true }).click();
  await until(async () => (await client.observe()).instruction === 'Wait here.');
  assert.equal(await page.getByLabel('Instruction for Pip').inputValue(), 'Wait here.');
  await page.screenshot({ path: `${output}/agent-console-desktop.png` });
  await page.route('**/api/voice/transcribe', route => route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Test transcription unavailable.' }) }));
  await page.getByRole('button', { name: 'Record instruction', exact: true }).click();
  await page.getByRole('button', { name: 'Stop recording and send', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Test transcription unavailable.' }).waitFor();
  await page.getByRole('button', { name: 'Stop agent', exact: true }).click();
  await until(async () => (await client.observe()).controller.mode === 'idle');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Agent instructions', exact: true }).evaluate(element => element === document.activeElement), true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Agent instructions', exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  await page.screenshot({ path: `${output}/agent-console-mobile.png` });
  await page.goto(noKeyTarget, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^Follow Bolt,/ }).click();
  await page.getByRole('button', { name: 'Agent instructions', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Send instruction', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Record instruction', exact: true }).isDisabled(), true);
  assert.ok(await page.getByText('Model control and voice are unavailable', { exact: false }).isVisible());
  assert.deepEqual(errors, []);
  await writeFile(`${output}/browser-review.json`, JSON.stringify({ target, noKeyTarget, transport: 'Test-only OpenAI and microphone fixtures; no real model or microphone recording', checks: ['Responses command execution', 'instruction revision', 'Decisions controller selection', 'voice recording -> transcription -> instruction', 'transcription failure feedback', 'stop agent', 'Escape and focus restoration', 'mobile overflow', 'missing-key states'], errors }, null, 2));
  console.log('Agent console browser scenarios passed.');
} finally { socket.disconnect(); await context.close(); await browser.close(); }
