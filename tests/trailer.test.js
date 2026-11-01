import test from 'node:test';
import assert from 'node:assert/strict';
import { recordPhysics, collisionTake } from '../trailer/record-physics.mjs';
import { FPS, DURATION, shotAt, subtitleAt } from '../trailer/timeline.mjs';

test('directed replay preserves Rapier state and events across repeated recordings', async () => {
  const first = await recordPhysics(collisionTake);
  const second = await recordPhysics(collisionTake);
  assert.deepEqual(first, second);
  assert.equal(first.frames.length, 181);
  assert.ok(first.events.some(e => e.type === 'push'));
  assert.ok(first.events.some(e => e.type === 'fall'));
  assert.equal(first.frames.at(-1).agents.find(a => a.id === 'opus').falls, 1);
  const randomOrder = [180, 0, 99, 40, 180];
  assert.deepEqual(randomOrder.map(i => first.frames[i]), randomOrder.map(i => second.frames[i]));
});

test('recorded director commands include their actual physics tick and failed commands stop the take', async () => {
  const take = await recordPhysics({ durationSeconds: .2, direct: (_, tick) => tick === 3 ? [{ agentId: 'astra', command: { type: 'look', heading: 1 } }] : [] });
  assert.equal(take.commands[0].tick, 3);
  assert.ok(take.frames.at(-1).agents[0].heading > .9);
  await assert.rejects(recordPhysics({ durationSeconds: .1, commands: [{ tick: 0, agentId: 'unknown', command: { type: 'look', heading: 0 } }] }), /Command failed/);
  await assert.rejects(recordPhysics({ fps: 29 }), /divisor/);
});

test('the 42-second edit has continuous physical slow motion and a deliberate silent comedy beat', () => {
  assert.equal(FPS * DURATION, 1260);
  assert.equal(shotAt(21 - 1 / FPS).take, 'chaos');
  assert.equal(shotAt(21).source, 3);
  assert.equal(shotAt(24).source, 4);
  assert.equal(shotAt(27).source, 5);
  for (let f = 21 * FPS; f < 27 * FPS; f++) assert.equal(subtitleAt(f / FPS), undefined);
  assert.equal(shotAt(40).id, 'logo');
  for (let f = 0; f < DURATION * FPS; f++) assert.ok(shotAt(f / FPS).source >= 0);
});
