import { pathToFileURL } from 'node:url';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';

export class GameAgentClient {
  constructor(url, id, session = null) {
    this.url = url.replace(/\/$/, ''); this.id = id; this.session = session;
  }
  async request(action, body) {
    const response = await fetch(`${this.url}/api/agents/${encodeURIComponent(this.id)}/${action}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(this.session?.token ? { Authorization: `Bearer ${this.session.token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (!response.ok || result.ok === false) throw new Error(result.error || `Game API HTTP ${response.status}`);
    return result;
  }
  async claim(instruction = '') { this.session = await this.request('claim', { mode: 'external', instruction }); return this.session; }
  observe() { return this.request('observe'); }
  async instruct(instruction) {
    const result = await this.request('instruction', { instruction });
    this.session = { ...this.session, ...result }; return result;
  }
  async command(command, { wait = true } = {}) {
    const observation = await this.observe();
    const receipt = await this.request('command', { round: observation.round, revision: observation.revision, sequence: observation.sequence + 1, command });
    if (!wait) return receipt;
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      const next = await this.observe();
      if (next.round !== observation.round) throw new Error('Command invalidated by a round change.');
      if (next.self.lastCommand?.id === receipt.command.id) return { ...receipt, result: next.self.lastCommand, observation: next };
      if (next.revision !== observation.revision) throw new Error('Command invalidated by an instruction change.');
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    throw new Error('Timed out waiting for the physical command result.');
  }
  async release() { const result = await this.request('release', {}); this.session = null; return result; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [action, id, argument] = process.argv.slice(2);
  if (!['claim', 'observe', 'command', 'instruct', 'release'].includes(action) || !/^[a-z]+$/.test(id || '')) {
    console.error('Usage: GAME_URL=http://localhost:5174 node scripts/agent-client.mjs <claim|observe|command|instruct|release> <runner-id> [instruction or command JSON]');
    process.exitCode = 1;
  } else {
    const url = process.env.GAME_URL || 'http://localhost:5174';
    const directory = path.resolve('.coffee-agent', new URL(url).host.replace(/[^a-zA-Z0-9.-]/g, '_'));
    const file = path.join(directory, `${id}.json`);
    let session = null;
    try { session = JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const client = new GameAgentClient(url, id, session);
    try {
      const result = action === 'command' ? await client.command(JSON.parse(argument)) : action === 'instruct' ? await client.instruct(argument) : action === 'claim' ? await client.claim(argument) : await client[action]();
      if (client.session) { await mkdir(directory, { recursive: true, mode: 0o700 }); await writeFile(file, JSON.stringify(client.session), { mode: 0o600 }); }
      else if (action === 'release') await unlink(file).catch(() => {});
      const { token, ...publicResult } = result;
      console.log(JSON.stringify(publicResult, null, 2));
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
