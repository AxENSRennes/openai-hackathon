import express from 'express';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { Server } from 'socket.io';
import { CoffeeSimulation, RUNNERS, initializePhysics } from '../shared/simulation.js';
import { BettingBook } from './betting.js';
import { AgentPlanner } from './planner.js';
import { compressedAssets, immutableAsset } from './assets.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(path.join(root, '.env'))) {
  try { process.loadEnvFile(path.join(root, '.env')); } catch (error) { console.warn(`Could not load .env: ${error.message}`); }
}
const port = Number(process.env.PORT) || 5173;
const production = process.env.NODE_ENV === 'production';
const app = express();
app.use(express.json({ limit: '16kb' }));
const http = createServer(app);
const io = new Server(http, { maxHttpBufferSize: 16_384, pingTimeout: 20_000 });
const book = new BettingBook(RUNNERS);
const planner = new AgentPlanner(RUNNERS);
const agentOwners = new Map();
let round = 1;
let phase = 'betting';
let phaseStarted = Date.now();
await initializePhysics();
let simulation = new CoffeeSimulation({ round });
let lastResults = [];
let latestSnapshot = simulation.snapshot();
let tickCount = 0;
const durations = { betting: 25, racing: 180, results: 12 };

function urls() {
  const addresses = Object.values(networkInterfaces()).flat().filter((entry) => entry.family === 'IPv4' && !entry.internal);
  const preferred = addresses.find((entry) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(entry.address)) || addresses[0];
  const localUrl = `http://localhost:${port}`;
  const networkUrl = preferred ? `http://${preferred.address}:${port}` : localUrl;
  const publicUrl = process.env.PUBLIC_URL?.trim().replace(/\/$/, '');
  return { localUrl, networkUrl, joinUrl: `${publicUrl || networkUrl}/join` };
}

function connectedPlayers() {
  return new Set([...io.sockets.sockets.values()].map((socket) => socket.data.playerId).filter(Boolean)).size;
}

function publicState() {
  const elapsed = (Date.now() - phaseStarted) / 1000;
  return {
    ...latestSnapshot,
    phase, round, timeLeft: Math.max(0, durations[phase] - elapsed),
    racers: RUNNERS, betting: book.summary(connectedPlayers()), lastResults,
    joinUrl: urls().joinUrl, agentMode: planner.mode, agentStatus: planner.status,
    controllers: planner.summaries(), modelAvailable: planner.enabled,
  };
}

function emitPlayers() {
  for (const socket of io.sockets.sockets.values()) {
    const player = book.player(socket.data.playerId);
    if (player) socket.emit('player', player);
  }
}

function beginRace() {
  if (phase !== 'betting') return false;
  phase = 'racing';
  phaseStarted = Date.now();
  planner.reset(simulation);
  io.emit('state', publicState());
  return true;
}

function endRace() {
  if (phase !== 'racing') return;
  if (!latestSnapshot.finished) {
    simulation.finish();
    latestSnapshot = simulation.snapshot();
  }
  phase = 'results';
  phaseStarted = Date.now();
  planner.reset(simulation);
  const winnerId = typeof latestSnapshot.winner === 'object' ? latestSnapshot.winner?.id : latestSnapshot.winner;
  lastResults = book.settle(winnerId);
  emitPlayers();
  io.emit('round:result', { round, winner: winnerId, results: lastResults });
  io.emit('state', publicState());
}

function nextRound({ refund = false } = {}) {
  agentOwners.clear();
  for (const socket of io.sockets.sockets.values()) { socket.data.controlledAgentId = null; socket.data.lastInputAt = 0; }
  book.reset({ refund });
  round += 1;
  phase = 'betting';
  phaseStarted = Date.now();
  simulation.dispose();
  simulation = new CoffeeSimulation({ round });
  accumulator = 0;
  latestSnapshot = simulation.snapshot();
  planner.reset(simulation, { clear: true });
  emitPlayers();
  io.emit('state', publicState());
}

app.get('/api/info', (_request, response) => response.json({ ...urls(), agentMode: planner.mode }));
app.get('/api/health', (_request, response) => response.json({ ok: true, phase, round }));

function publishState() { latestSnapshot = simulation.snapshot(); io.emit('state', publicState()); }
function agentToken(request) { return request.get('authorization')?.replace(/^Bearer /, ''); }
function requireController(request, response, next) {
  if (!planner.authorized(request.params.id, agentToken(request))) return response.status(403).json({ ok: false, error: 'A valid controller bearer token is required.' });
  next();
}
app.get('/api/agents/:id/observe', (request, response) => {
  const observation = planner.observe(simulation, request.params.id);
  if (!observation) return response.status(404).json({ ok: false, error: 'Unknown runner.' });
  response.json({ ...observation, phase, controller: planner.summaries().find(c => c.id === request.params.id) });
});
app.post('/api/agents/:id/claim', (request, response) => {
  if (planner.controllers.get(request.params.id)?.mode && planner.controllers.get(request.params.id).mode !== 'idle') return response.status(409).json({ ok: false, error: 'Runner already has a controller.' });
  const result = planner.configure(simulation, request.params.id, request.body || {});
  publishState(); response.status(result.ok ? 200 : 400).json(result);
});
app.post('/api/agents/:id/command', requireController, (request, response) => {
  if (phase !== 'racing') return response.status(409).json({ ok: false, error: 'Commands are accepted only during a race.' });
  if (planner.controllers.get(request.params.id)?.mode !== 'external') return response.status(409).json({ ok: false, error: 'Only external controllers accept submitted commands.' });
  const result = planner.issue(simulation, request.params.id, request.body);
  publishState(); response.status(result.ok ? 200 : 409).json(result);
});
app.post('/api/agents/:id/instruction', requireController, (request, response) => {
  const result = planner.instruct(simulation, request.params.id, request.body?.instruction);
  publishState(); response.status(result.ok ? 200 : 400).json(result);
});
app.post('/api/agents/:id/release', requireController, (request, response) => {
  const result = planner.configure(simulation, request.params.id, { mode: 'idle' });
  publishState(); response.status(result.ok ? 200 : 400).json({ ok: result.ok, error: result.error });
});
app.post('/api/voice/transcribe', express.raw({ type: ['audio/*', 'video/webm'], limit: '2mb' }), async (request, response) => {
  if (!planner.enabled) return response.status(503).json({ ok: false, error: 'OPENAI_API_KEY is not configured on the server.' });
  if (!Buffer.isBuffer(request.body) || !request.body.length) return response.status(400).json({ ok: false, error: 'Record an audio instruction first.' });
  try {
    const form = new FormData();
    form.append('model', process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe');
    const contentType = request.get('content-type');
    const extension = contentType.includes('mp4') ? 'mp4' : contentType.includes('ogg') ? 'ogg' : contentType.includes('wav') ? 'wav' : 'webm';
    form.append('file', new Blob([request.body], { type: contentType }), `instruction.${extension}`);
    const result = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form, signal: AbortSignal.timeout(20000) });
    if (!result.ok) throw new Error(`Transcription HTTP ${result.status}`);
    const data = await result.json();
    if (typeof data.text !== 'string' || !data.text.trim()) throw new Error('No speech was recognized.');
    response.json({ ok: true, text: data.text });
  } catch (error) { response.status(502).json({ ok: false, error: error.message }); }
});
app.use('/api', (error, _request, response, _next) => response.status(error.status || 500).json({ ok: false, error: error.status === 413 ? 'Request is too large.' : 'Invalid API request.' }));
app.use('/api', (_request, response) => response.status(404).json({ ok: false, error: 'Unknown API endpoint.' }));

io.on('connection', (socket) => {
  socket.emit('state', publicState());
  socket.on('join', (payload = {}, callback) => {
    if (!payload || typeof payload !== 'object') return;
    const player = book.join(payload.playerId, payload.name);
    socket.data.playerId = player.id;
    socket.emit('player', player);
    if (typeof callback === 'function') callback({ ok: true, player });
    io.emit('state', publicState());
  });
  socket.on('bet', (payload = {}, callback) => {
    if (!payload || typeof payload !== 'object') return;
    const result = book.place(socket.data.playerId, payload.runnerId, payload.amount, phase);
    if (typeof callback === 'function') callback(result);
    if (result.ok) {
      emitPlayers();
      io.emit('state', publicState());
    } else socket.emit('game:error', { message: result.error });
  });
  socket.on('agent:control', (payload = {}, callback) => {
    const reply = result => { if (typeof callback === 'function') callback(result); };
    if (!payload || typeof payload !== 'object') return reply({ ok: false, error: 'Invalid control request.' });
    const prior = socket.data.controlledAgentId;
    if (!payload.enabled) {
      if (prior) { simulation.setControl(prior, false); agentOwners.delete(prior); socket.data.controlledAgentId = null; }
      latestSnapshot = simulation.snapshot(); io.emit('state', publicState());
      return reply({ ok: true, agentId: null });
    }
    if (!RUNNERS.some(r => r.id === payload.id)) return reply({ ok: false, error: 'Unknown runner.' });
    const owner = agentOwners.get(payload.id);
    if (owner && owner !== socket.id) return reply({ ok: false, error: 'This runner is already controlled by another player.' });
    if (prior === payload.id && owner === socket.id) return reply({ ok: true, agentId: payload.id });
    if (prior && prior !== payload.id) { simulation.setControl(prior, false); agentOwners.delete(prior); }
    planner.configure(simulation, payload.id, { mode: 'idle' });
    socket.data.controlledAgentId = payload.id; socket.data.lastInputAt = 0; agentOwners.set(payload.id, socket.id);
    simulation.setControl(payload.id, true); latestSnapshot = simulation.snapshot();
    io.emit('state', publicState()); reply({ ok: true, agentId: payload.id });
  });
  socket.on('agent:input', (input = {}) => {
    const id = socket.data.controlledAgentId;
    if (phase !== 'racing' || !id || agentOwners.get(id) !== socket.id) return;
    if (simulation.setInput(id, input)) socket.data.lastInputAt = performance.now();
  });
  socket.on('host:agent', (payload = {}, callback) => {
    const reply = result => { publishState(); if (typeof callback === 'function') { const { token, ...publicResult } = result; callback(publicResult); } };
    if (!payload || typeof payload !== 'object') return reply({ ok: false, error: 'Invalid agent request.' });
    if (payload.action === 'instruction') return reply(planner.instruct(simulation, payload.id, payload.instruction));
    if (payload.action === 'configure') return reply(planner.configure(simulation, payload.id, payload));
    reply({ ok: false, error: 'Unknown agent request.' });
  });
  socket.on('disconnect', () => {
    if (shuttingDown) return;
    const id = socket.data.controlledAgentId;
    if (!id || agentOwners.get(id) !== socket.id) return;
    agentOwners.delete(id); simulation.setControl(id, false); latestSnapshot = simulation.snapshot();
    io.emit('state', publicState());
  });
  socket.on('host:start', (callback) => {
    const ok = beginRace();
    if (typeof callback === 'function') callback({ ok, error: ok ? undefined : 'The race is already underway.' });
  });
  socket.on('host:reset', (callback) => {
    nextRound({ refund: phase !== 'results' });
    if (typeof callback === 'function') callback({ ok: true });
  });
});

let vite;
if (production) {
  app.use('/assets', compressedAssets(path.join(root, 'dist', 'assets')));
  app.use(express.static(path.join(root, 'dist'), { setHeaders(response, file) {
    if (immutableAsset(file)) response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } }));
  app.use((_request, response) => response.sendFile(path.join(root, 'dist', 'index.html')));
} else {
  const { createServer: createViteServer } = await import('vite');
  vite = await createViteServer({ root, server: { middlewareMode: true, hmr: { server: http } }, appType: 'spa' });
  app.use(vite.middlewares);
}

let previousTick = performance.now();
let accumulator = 0;
const fixedStep = 1 / 60;
const interval = setInterval(() => {
  const now = performance.now();
  const delta = Math.min((now - previousTick) / 1000, 0.1);
  previousTick = now;
  if (phase === 'racing') {
    if (Date.now() - phaseStarted >= durations.racing * 1000) { endRace(); return; }
    for (const [id, owner] of agentOwners) {
      const socket = io.sockets.sockets.get(owner);
      if (!socket || now - (socket.data.lastInputAt || 0) > 350) simulation.stopInput(id);
    }
    accumulator += delta;
    while (accumulator >= fixedStep && !simulation.finished) {
      simulation.step(fixedStep);
      accumulator -= fixedStep;
    }
    latestSnapshot = simulation.snapshot();
    planner.update(simulation, latestSnapshot);
    if (latestSnapshot.finished || Date.now() - phaseStarted >= durations.racing * 1000) endRace();
  } else if (Date.now() - phaseStarted >= durations[phase] * 1000) {
    if (phase === 'betting') beginRace();
    else nextRound();
  }
  tickCount += 1;
  if (tickCount % 2 === 0) io.emit('state', publicState());
}, 1000 / 30);

http.listen(port, '0.0.0.0', () => {
  console.log(`Coffee Run is ready: ${urls().localUrl}`);
  console.log(`Join on your phone: ${urls().joinUrl}`);
  console.log(`Agent controller: ${planner.mode}`);
});

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(interval);
  planner.dispose();
  simulation.dispose();
  const deadline = setTimeout(() => {
    http.closeAllConnections();
    process.exit(1);
  }, 5000);
  deadline.unref();
  io.disconnectSockets(true);
  await Promise.allSettled([
    new Promise(resolve => io.close(resolve)),
    vite?.close(),
    new Promise(resolve => http.close(resolve)),
  ]);
  clearTimeout(deadline);
  process.exit(0);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
