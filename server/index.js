import express from 'express';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { Server } from 'socket.io';
import { CoffeeSimulation, RUNNERS } from '../shared/simulation.js';
import { BettingBook } from './betting.js';
import { AgentPlanner } from './planner.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(path.join(root, '.env'))) {
  try { process.loadEnvFile(path.join(root, '.env')); } catch (error) { console.warn(`Could not load .env: ${error.message}`); }
}
const port = Number(process.env.PORT) || 5173;
const production = process.env.NODE_ENV === 'production';
const app = express();
const http = createServer(app);
const io = new Server(http, { maxHttpBufferSize: 16_384, pingTimeout: 20_000 });
const book = new BettingBook(RUNNERS);
const planner = new AgentPlanner(RUNNERS);
let round = 1;
let phase = 'betting';
let phaseStarted = Date.now();
let simulation = new CoffeeSimulation({ round });
let lastResults = [];
let latestSnapshot = simulation.snapshot();
let tickCount = 0;
const durations = { betting: 25, racing: 100, results: 12 };

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
  planner.reset();
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
  planner.reset();
  const winnerId = typeof latestSnapshot.winner === 'object' ? latestSnapshot.winner?.id : latestSnapshot.winner;
  lastResults = book.settle(winnerId);
  emitPlayers();
  io.emit('round:result', { round, winner: winnerId, results: lastResults });
  io.emit('state', publicState());
}

function nextRound({ refund = false } = {}) {
  book.reset({ refund });
  round += 1;
  phase = 'betting';
  phaseStarted = Date.now();
  simulation = new CoffeeSimulation({ round });
  latestSnapshot = simulation.snapshot();
  planner.reset();
  emitPlayers();
  io.emit('state', publicState());
}

app.get('/api/info', (_request, response) => response.json({ ...urls(), agentMode: planner.mode }));
app.get('/api/health', (_request, response) => response.json({ ok: true, phase, round }));

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
  app.use(express.static(path.join(root, 'dist')));
  app.use((_request, response) => response.sendFile(path.join(root, 'dist', 'index.html')));
} else {
  const { createServer: createViteServer } = await import('vite');
  vite = await createViteServer({ root, server: { middlewareMode: true, hmr: { server: http } }, appType: 'spa' });
  app.use(vite.middlewares);
}

let previousTick = performance.now();
const interval = setInterval(() => {
  const now = performance.now();
  const delta = Math.min((now - previousTick) / 1000, 0.1);
  previousTick = now;
  if (phase === 'racing') {
    simulation.step(delta);
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

async function shutdown() {
  clearInterval(interval);
  planner.dispose();
  await vite?.close();
  io.close();
  http.close(() => process.exit(0));
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
