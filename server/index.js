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
import { CameoDirector } from './cameo.js';
import { CameoAssetStore } from './cameo-assets.js';

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
const cameoAssets = new CameoAssetStore();
const cameoDirector = new CameoDirector({ onVisitReleased: visit => cameoAssets.release(visit.characterId) });
let round = 1;
let phase = 'betting';
let shuttingDown = false;
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
    cameo: cameoDirector.snapshot(),
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
  cameoDirector.reset();
  planner.reset();
  io.emit('state', publicState());
  return true;
}

function endRace() {
  if (phase !== 'racing') return;
  if (!latestSnapshot.finished) {
    simulation.finish();
  }
  cameoDirector.reset();
  latestSnapshot = simulation.snapshot();
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
  cameoDirector.reset();
  simulation = new CoffeeSimulation({ round });
  latestSnapshot = simulation.snapshot();
  planner.reset();
  emitPlayers();
  io.emit('state', publicState());
}

app.get('/api/info', (_request, response) => response.json({ ...urls(), agentMode: planner.mode }));
app.get('/api/health', (_request, response) => response.json({ ok: true, phase, round }));
app.post('/api/cameo-visits', express.raw({ type: '*/*', limit: 256 * 1024, inflate: false }), (request, response) => {
  if (shuttingDown) return response.status(503).json({ ok: false, error: 'The server is shutting down.' });
  const socketId = request.get('X-Coffee-Host-Socket');
  const hostSocket = socketId && io.sockets.sockets.get(socketId);
  if (!hostSocket?.data.isHost) return response.status(403).json({ ok: false, error: 'A connected broadcast host is required.' });
  if (phase !== 'racing' || simulation.finished || Date.now() - phaseStarted >= durations.racing * 1000) {
    return response.status(409).json({ ok: false, error: 'Cameos can only be uploaded during a race.' });
  }

  const mediaType = request.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase();
  if (mediaType !== 'image/webp') return response.status(415).json({ ok: false, error: 'Upload must use image/webp.' });
  const bytes = request.body;
  if (!Buffer.isBuffer(bytes) || bytes.length < 12) {
    return response.status(400).json({ ok: false, error: 'Upload is not a valid WebP image.' });
  }
  if (bytes.length > 256 * 1024) return response.status(413).json({ ok: false, error: 'WebP uploads must be 256 KB or smaller.' });
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') {
    return response.status(400).json({ ok: false, error: 'Upload is not a valid WebP image.' });
  }

  const characterId = cameoAssets.create(bytes);
  let result;
  try {
    result = cameoDirector.enqueue({ characterId, assetUrl: `/api/cameo-assets/${characterId}` });
    if (!cameoAssets.retain(characterId)) throw new Error('Cameo asset was not retained.');
  } catch (error) {
    cameoAssets.discard(characterId);
    throw error;
  }

  latestSnapshot = simulation.snapshot();
  io.emit('state', publicState());
  return response.json(result);
});
app.get('/api/cameo-assets/:characterId', (request, response) => {
  const bytes = cameoAssets.get(request.params.characterId);
  if (!bytes) return response.status(404).json({ ok: false, error: 'Cameo asset not found.' });
  response.type('image/webp').set({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  return response.send(bytes);
});
app.use((error, _request, response, next) => {
  if (error.type === 'entity.too.large') {
    return response.status(413).json({ ok: false, error: 'WebP uploads must be 256 KB or smaller.' });
  }
  if (error.type === 'encoding.unsupported') {
    return response.status(415).json({ ok: false, error: 'Encoded request bodies are not supported.' });
  }
  return next(error);
});

io.on('connection', (socket) => {
  const headers = socket.handshake.headers;
  const hostHeader = headers.host;
  const forwardedProtocol = headers['x-forwarded-proto']?.split(',')[0]?.trim();
  const requestProtocol = forwardedProtocol || (socket.request.socket.encrypted ? 'https' : 'http');
  try {
    const referer = new URL(headers.referer);
    socket.data.isHost = Boolean(
      hostHeader
      && headers.referer
      && referer.host === hostHeader
      && referer.protocol === `${requestProtocol}:`
      && referer.pathname === '/'
    );
  } catch {
    socket.data.isHost = false;
  }
  socket.emit('state', publicState());
  socket.on('join', (payload = {}, callback) => {
    if (!payload || typeof payload !== 'object') return;
    socket.data.isHost = false;
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
    if (!socket.data.isHost) {
      if (typeof callback === 'function') callback({ ok: false, error: 'Only the broadcast host can start a race.' });
      return;
    }
    const ok = beginRace();
    if (typeof callback === 'function') callback({ ok, error: ok ? undefined : 'The race is already underway.' });
  });
  socket.on('host:reset', (callback) => {
    if (!socket.data.isHost) {
      if (typeof callback === 'function') callback({ ok: false, error: 'Only the broadcast host can reset a race.' });
      return;
    }
    nextRound({ refund: phase !== 'results' });
    if (typeof callback === 'function') callback({ ok: true });
  });
  socket.on('host:trigger', (callback) => {
    if (!socket.data.isHost) {
      if (typeof callback === 'function') callback({ ok: false, error: 'Only the broadcast host can trigger a cameo.' });
      return;
    }
    if (phase !== 'racing' || simulation.finished || Date.now() - phaseStarted >= durations.racing * 1000) {
      if (typeof callback === 'function') callback({ ok: false, error: 'Cameos can only be triggered during a race.' });
      return;
    }
    const result = cameoDirector.enqueue({ characterId: 'preset:rascal' });
    latestSnapshot = simulation.snapshot();
    io.emit('state', publicState());
    if (typeof callback === 'function') callback(result);
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
    if (simulation.finished) cameoDirector.reset();
    else cameoDirector.tick(Date.now(), simulation);
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
  shuttingDown = true;
  clearInterval(interval);
  cameoDirector.reset();
  cameoAssets.clear();
  planner.dispose();
  await vite?.close();
  io.close();
  http.close(() => {
    cameoAssets.clear();
    process.exit(0);
  });
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
