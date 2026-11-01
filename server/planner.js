import { randomUUID } from 'node:crypto';
import { LEVEL } from '../shared/level.js';
import { COMMAND_LIMITS, COMMAND_TYPES, commandSchema } from '../shared/commands.js';

export const AGENT_INSTRUCTIONS = `You directly control one character in Coffee Run. Your commands are the ONLY source of movement and interaction. There is no automatic navigation, obstacle avoidance, pickup, delivery, pushing, or standing up. Win by delivering a persistent shared coffee with at least 55% remaining to the single shared waiting customer. Held mugs must first be dropped before another runner can take them. You may take unattended cups. A brew command puts your held mug in an empty machine; brewing continues as a world process until you explicitly take the mug again. Every interaction needs an explicit target and must be in reach and facing the target. Use look to face a target when necessary. Positions, collisions, and results are authoritative. move uses WORLD axes x (east positive), z (south positive), normalized to unit length, for 50 to 1000 milliseconds. It does not find a path: navigate around the observed obstacle rectangles yourself. Read lastCommand to check actual progress. Use careful pace to protect coffee; fast pace risks spills. Use stand_up after falling. Follow the human's latest instruction within these game rules. Choose only your own next physical command. Do not invent objects, teleport, or assume a command succeeded.`;

const directions = [
  ['east', 1, 0], ['west', -1, 0], ['south', 0, 1], ['north', 0, -1],
  ['southeast', 1, 1], ['northeast', 1, -1], ['southwest', -1, 1], ['northwest', -1, -1],
];

export function decisionOptions(observation) {
  const options = [{ value: 'wait', description: 'Stay still for 500 ms.', command: { type: 'wait', durationMs: 500 } }];
  if (observation.self.fallen) {
    options.push({ value: 'stand_up', description: 'Explicitly get back on your feet.', command: { type: 'stand_up' } });
    return options;
  }
  for (const [name, x, z] of directions) {
    for (const pace of ['careful', 'fast']) for (const durationMs of [250, 800]) options.push({
      value: `move:${name}:${pace}:${durationMs}`,
      description: `Move ${name}: world x=${x}, z=${z}, ${pace}, ${durationMs} ms. No pathfinding.`,
      command: { type: 'move', x, z, pace, durationMs },
    });
    options.push({ value: `look:${name}`, description: `Face ${name} without walking.`, command: { type: 'look', heading: Math.atan2(x, z) } });
  }
  for (const action of observation.self.availableActions) options.push({
    value: `${action.type}:${action.targetId}`, description: `${action.label}. Target ${action.targetId}.`,
    command: { type: action.type, targetId: action.targetId },
  });
  return options;
}

export class AgentPlanner {
  constructor(runners, { apiKey = process.env.OPENAI_API_KEY || '', fetchImpl = fetch, timeoutMs = 12000 } = {}) {
    this.runners = runners; this.apiKey = apiKey; this.fetch = fetchImpl; this.timeoutMs = timeoutMs;
    this.controllers = new Map();
    this.responsesModel = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
    this.decisionsModel = process.env.OPENAI_DECISIONS_MODEL || 'gpt-6-luna';
  }
  get mode() {
    const modes = [...new Set([...this.controllers.values()].map(c => c.mode).filter(mode => mode !== 'idle'))];
    return modes.length === 1 ? modes[0] : modes.length ? 'mixed' : 'idle';
  }
  get status() { return this.mode === 'idle' ? 'Waiting for explicit agent commands' : 'Direct agent control; no automatic fallback'; }
  get enabled() { return Boolean(this.apiKey); }
  summaries() {
    return this.runners.map(({ id }) => {
      const c = this.controllers.get(id);
      return { id, mode: c?.mode || 'idle', instruction: c?.instruction || '', revision: c?.revision || 0, sequence: c?.sequence || 0, status: c?.status || 'Waiting for a controller', busy: !!c?.busy, latencyMs: c?.latencyMs ?? null, history: c?.history.slice(-8) || [] };
    });
  }
  configure(simulation, id, { mode = 'external', instruction = '' } = {}) {
    const a = simulation.agents.find(a => a.id === id);
    if (!a || !['idle', 'external', 'responses', 'decisions'].includes(mode)) return { ok: false, error: 'Unknown runner or controller mode.' };
    if (a.controlled) return { ok: false, error: 'Release human control first.' };
    if (typeof instruction !== 'string' || instruction.length > 2000) return { ok: false, error: 'Instruction must be text, at most 2000 characters.' };
    if (['responses', 'decisions'].includes(mode) && !this.enabled) return { ok: false, error: 'OPENAI_API_KEY is not configured on the server.' };
    const previous = this.controllers.get(id);
    previous?.abort?.abort(); simulation.cancelCommand(id, 'Controller changed');
    const controller = { mode, instruction, token: randomUUID(), revision: (previous?.revision || 0) + 1, sequence: 0, busy: false, nextAt: 0, history: [], status: mode === 'idle' ? 'Waiting for a controller' : 'Ready' };
    this.controllers.set(id, controller);
    return { ok: true, token: controller.token, round: simulation.round, revision: controller.revision, sequence: 0 };
  }
  authorized(id, token) { return typeof token === 'string' && this.controllers.get(id)?.token === token; }
  instruct(simulation, id, instruction) {
    const c = this.controllers.get(id);
    if (!c || c.mode === 'idle') return { ok: false, error: 'Assign a controller first.' };
    if (typeof instruction !== 'string' || !instruction.trim() || instruction.length > 2000) return { ok: false, error: 'Provide an instruction of 1 to 2000 characters.' };
    c.abort?.abort(); c.abort = null; c.busy = false; c.revision++; c.sequence = 0; c.lastIssue = null; c.nextAt = 0;
    c.instruction = instruction.trim(); c.status = 'Instruction updated';
    simulation.cancelCommand(id, 'Human instruction changed');
    return { ok: true, round: simulation.round, revision: c.revision, sequence: 0 };
  }
  observe(simulation, id) {
    const state = simulation.snapshot(), self = state.agents.find(a => a.id === id);
    if (!self) return null;
    const c = this.controllers.get(id);
    return {
      round: simulation.round, revision: c?.revision || 0, sequence: c?.sequence || 0,
      instruction: c?.instruction || '', identity: this.runners.find(a => a.id === id),
      rules: { minimumCoffee: 55, movementAxes: 'World coordinates: +x east, +z south; heading atan2(x,z).', commandLimits: COMMAND_LIMITS, commandTypes: COMMAND_TYPES, interactionRange: 1.05, deliveryRange: .85, pushRange: 1.12, interactionDurationsMs: { take: 420, brew: 650, place: 550, deliver: 650, push: 480, stand_up: 1750 }, noAutomaticNavigation: true },
      map: LEVEL, self, elapsed: state.elapsed, finished: state.finished,
      agents: state.agents.filter(a => a.id !== id), cups: state.cups, stations: state.stations,
      surfaces: state.surfaces, gate: state.gate, props: state.props, spills: state.spills,
      recentEvents: state.events.slice(0, 8), history: c?.history.slice(-8) || [],
    };
  }
  issue(simulation, id, envelope) {
    const c = this.controllers.get(id);
    if (!c || c.mode === 'idle') return { ok: false, error: 'No active controller.' };
    if (!envelope || envelope.round !== simulation.round || envelope.revision !== c.revision) return { ok: false, error: 'Stale round or instruction revision.' };
    if (!Number.isSafeInteger(envelope.sequence)) return { ok: false, error: 'A command sequence is required.' };
    const fingerprint = JSON.stringify(envelope.command);
    if (envelope.sequence === c.sequence && c.lastIssue?.fingerprint === fingerprint) return c.lastIssue.result;
    if (envelope.sequence !== c.sequence + 1) return { ok: false, error: 'Out-of-order command sequence.' };
    const receipt = simulation.executeCommand(id, envelope.command);
    c.sequence = envelope.sequence;
    const result = { ...receipt, sequence: c.sequence, revision: c.revision };
    c.lastIssue = { fingerprint, result };
    c.history.push({ sequence: c.sequence, revision: c.revision, at: simulation.elapsed, command: envelope.command, accepted: result.ok, error: result.error || null });
    if (c.history.length > 16) c.history.shift();
    c.status = result.ok ? `Executing ${envelope.command.type}` : result.error;
    return result;
  }
  update(simulation) {
    if (simulation.finished) return;
    for (const [id, c] of this.controllers) {
      if (!['responses', 'decisions'].includes(c.mode) || c.busy || Date.now() < c.nextAt) continue;
      const a = simulation.agents.find(a => a.id === id);
      if (!a || a.controlled || a.command || a.interaction || a.pushTimer > 0) continue;
      const revision = c.revision, observation = this.observe(simulation, id);
      c.busy = true; c.status = 'Choosing next physical command'; c.abort = new AbortController();
      const abort = c.abort, started = performance.now();
      this.plan(c.mode, observation, abort.signal).then(command => {
        if (this.controllers.get(id) !== c || c.revision !== revision || simulation.finished || simulation.disposed || a.controlled) return;
        c.latencyMs = Math.round(performance.now() - started);
        this.issue(simulation, id, { round: observation.round, revision, sequence: c.sequence + 1, command });
        c.nextAt = Date.now() + 100;
      }).catch(error => {
        if (this.controllers.get(id) !== c || c.revision !== revision) return;
        c.status = `Model unavailable; character waiting (${error.message})`; c.nextAt = Date.now() + 5000;
      }).finally(() => { if (c.abort === abort) { c.busy = false; c.abort = null; } });
    }
  }
  async plan(mode, observation, signal) {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const options = mode === 'decisions' ? decisionOptions(observation) : null;
    const body = options ? {
      model: this.decisionsModel,
      input: [{ role: 'developer', content: AGENT_INSTRUCTIONS }, { role: 'user', content: [{ type: 'input_json', data: observation }] }],
      questions: [{ name: 'next_command', type: 'choice', instructions: 'Choose the next physical command for self to follow the current human instruction. Use the observed map, actual last command outcome, and legal interactions. You choose the movement direction yourself.', choices: options.map(({ value, description }) => ({ value, description })) }],
    } : {
      model: this.responsesModel, store: false, max_output_tokens: 400,
      instructions: AGENT_INSTRUCTIONS, input: JSON.stringify(observation),
      text: { format: { type: 'json_schema', name: 'physical_command', strict: true, schema: commandSchema } },
    };
    const response = await this.fetch(`https://api.openai.com/v1/${options ? 'decisions' : 'responses'}`, {
      method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }, signal: combined, body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (options) {
      const answer = result.answers?.find(a => a.name === 'next_command' && a.type === 'choice');
      const selected = options.find(option => option.value === answer?.choice);
      if (!selected) throw new Error('No valid Decisions choice returned');
      return selected.command;
    }
    const output = result.output?.flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('') || result.output_text;
    return JSON.parse(output);
  }
  reset(simulation, { clear = false } = {}) {
    for (const [id, c] of this.controllers) {
      c.abort?.abort(); c.abort = null; c.busy = false; c.revision++; c.sequence = 0; c.lastIssue = null; c.nextAt = 0;
      simulation?.cancelCommand(id, 'Round changed');
    }
    if (clear) this.controllers.clear();
  }
  dispose() { this.reset(null, { clear: true }); }
}
