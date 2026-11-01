import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { CoffeeSimulation, initializePhysics } from '../shared/simulation.js';

const physicsFps = 60;

// This directed take exercises real commands and Rapier, without an AI controller.
export const collisionTake = {
  round: 17,
  durationSeconds: 6,
  fps: 30,
  commands: [
    { tick: 0, agentId: 'astra', command: { type: 'move', x: 1, z: 0, durationMs: 1000 } },
    { tick: 0, agentId: 'opus', command: { type: 'move', x: -1, z: 0, durationMs: 1000 } },
    { tick: 195, agentId: 'astra', command: { type: 'look', heading: Math.PI / 2 } },
    { tick: 195, agentId: 'astra', command: { type: 'push', targetId: 'opus' } },
  ],
};

/** Bake physical state once; video rendering can then seek frames in any order. */
export async function recordPhysics({ round = 17, durationSeconds = 6, fps = 30, commands = [], setup, direct } = {}) {
  if (!Number.isInteger(fps) || fps < 1 || physicsFps % fps !== 0) {
    throw new Error('Video fps must be a positive divisor of 60.');
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 300) {
    throw new Error('Duration must be between 0 and 300 seconds.');
  }
  if (!Number.isInteger(round) || round < 1) throw new Error('Round must be a positive integer.');
  const ticks = Math.ceil(durationSeconds * physicsFps);
  const schedule = new Map();
  for (const entry of commands) {
    if (!Number.isInteger(entry.tick) || entry.tick < 0 || entry.tick >= ticks) {
      throw new Error('Every command tick must fall inside the take.');
    }
    if (!schedule.has(entry.tick)) schedule.set(entry.tick, []);
    schedule.get(entry.tick).push(entry);
  }
  await initializePhysics();
  const simulation = new CoffeeSimulation({ round });
  const frames = [], events = new Map(), executed = [];
  function captureEvents() {
    for (const event of simulation.events) events.set(event.id, { ...event });
  }
  try {
    setup?.(simulation);
    for (let tick = 0; tick <= ticks; tick++) {
      const directed = tick < ticks ? direct?.(simulation, tick) || [] : [];
      for (const entry of [...(schedule.get(tick) || []), ...directed]) {
        const result = simulation.executeCommand(entry.agentId, entry.command);
        if (!result.ok) throw new Error(`Command failed at tick ${tick} for ${entry.agentId}: ${result.error}`);
        executed.push({ ...entry, tick, command: { ...entry.command }, result });
      }
      captureEvents();
      if (tick % (physicsFps / fps) === 0) {
        const { events: recentEvents, ...state } = simulation.snapshot();
        frames.push({ frame: frames.length, tick, ...state });
      }
      if (tick < ticks) simulation.step(1 / physicsFps);
    }
    return {
      version: 1,
      captureKind: 'directed-physics-replay',
      controller: 'scripted game commands; no live model decisions',
      round, fps, physicsFps, durationSeconds,
      commands: executed,
      events: [...events.values()].sort((a, b) => a.time - b.time || a.id.localeCompare(b.id)),
      frames,
    };
  } finally {
    simulation.dispose();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = process.argv[2] || '/tmp/coffee-trailer-physics.json';
  const replay = await recordPhysics(collisionTake);
  await writeFile(output, JSON.stringify(replay));
  console.log(`Recorded ${replay.frames.length} states and ${replay.events.length} events to ${output}`);
}
