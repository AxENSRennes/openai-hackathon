const decisionSchema = {
  type: 'object',
  properties: {
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          pace: { type: 'string', enum: ['careful', 'fast'] },
          route: { type: 'string', enum: ['direct', 'detour'] },
          aggression: { type: 'number' },
        },
        required: ['id', 'pace', 'route', 'aggression'],
        additionalProperties: false,
      },
    },
  },
  required: ['decisions'],
  additionalProperties: false,
};

export class AgentPlanner {
  constructor(runners) {
    this.runners = runners;
    this.enabled = Boolean(process.env.OPENAI_API_KEY);
    this.mode = 'local';
    this.model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
    this.busy = false;
    this.lastPlanned = -Infinity;
    this.nextAttempt = 0;
    this.generation = 0;
    this.controller = null;
    this.status = this.enabled ? 'Waiting for model tactics' : 'Local autonomous strategies';
  }

  reset() {
    this.generation += 1;
    this.lastPlanned = -Infinity;
    this.controller?.abort();
    this.controller = null;
    this.busy = false;
    this.mode = 'local';
    this.status = this.enabled ? 'Waiting for model tactics' : 'Local autonomous strategies';
  }

  update(simulation, snapshot) {
    if (!this.enabled || this.busy || Date.now() < this.nextAttempt || snapshot.elapsed - this.lastPlanned < 5) return;
    this.lastPlanned = snapshot.elapsed;
    this.busy = true;
    const generation = this.generation;
    this.plan(snapshot).then((decisions) => {
      if (generation !== this.generation || snapshot.finished) return;
      for (const decision of decisions) {
        if (!this.runners.some((runner) => runner.id === decision.id) || snapshot.agents.some(a => a.id === decision.id && a.controlled)) continue;
        if (!['careful', 'fast'].includes(decision.pace) || !['direct', 'detour'].includes(decision.route)) continue;
        simulation.setStrategy(decision.id, {
          pace: decision.pace,
          route: decision.route,
          aggression: Math.max(0, Math.min(1, Number(decision.aggression) || 0)),
        });
      }
      this.mode = 'openai';
      this.status = 'Model tactics active';
    }).catch((error) => {
      if (generation !== this.generation) return;
      this.mode = 'local';
      this.status = 'Model unavailable; local strategies active';
      this.nextAttempt = Date.now() + 30_000;
      console.warn(`Agent planner unavailable: ${error.message}`);
    }).finally(() => {
      if (generation === this.generation) this.busy = false;
    });
  }

  async plan(snapshot) {
    this.controller = new AbortController();
    const timeout = setTimeout(() => this.controller?.abort(), 12_000);
    try {
      const agents = snapshot.agents.map(({ id, x, z, coffee, carrying, cupId, controlled, fallen, state, action, decision, progress }) => ({ id, x, z, coffee, carrying, cupId, controlled, fallen, state, action, decision, progress }));
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        signal: this.controller.signal,
        body: JSON.stringify({
          model: this.model,
          store: false,
          max_output_tokens: 1200,
          instructions: 'You are the tactical controller for six competing coffee delivery agents in a physical office race. Each agent wants to deliver one coffee with at least 55% remaining to the single shared waiting customer before anyone else. Cups are persistent shared objects. Brewing continues unattended; placed mugs can be stolen, held mugs must first be dropped by a collision. Failed cups can be refilled or replaced. The timed middle gate creates a longer south detour. Choose pace (careful protects coffee, fast wins distance but risks spills), route (direct passes a crowded doorway, detour is longer and safer), and aggression (0 to 1; high pushes and steals but risks collisions). Preserve each runner personality while adapting to the observed race. Every autonomous agent is trying to win. Some runners may be controlled directly by a human; do not issue decisions for controlled runners. Return decisions for autonomous runners. Positions and physical failures are authoritative game state; never invent new actions.',
          input: JSON.stringify({ runners: this.runners, elapsed: snapshot.elapsed, agents, cups: snapshot.cups, stations: snapshot.stations, surfaces: snapshot.surfaces, gate: snapshot.gate, spills: snapshot.spills, recentEvents: snapshot.events?.slice(0, 6) }),
          text: { format: { type: 'json_schema', name: 'coffee_race_tactics', strict: true, schema: decisionSchema } },
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      const output = result.output?.flatMap((item) => item.content || []).filter((item) => item.type === 'output_text').map((item) => item.text).join('') || result.output_text;
      const parsed = JSON.parse(output);
      if (!Array.isArray(parsed.decisions)) throw new Error('Missing tactical decisions');
      return parsed.decisions;
    } finally {
      clearTimeout(timeout);
    }
  }

  dispose() {
    this.reset();
  }
}
