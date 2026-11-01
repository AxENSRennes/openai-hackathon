import { randomUUID, randomInt } from 'node:crypto';

const VISIT_DURATION_MS = 5_000;
const EFFECT_START_MS = 1_000;
const EFFECT_END_MS = 4_000;
const MACHINE_DELAY_SECONDS = 3;

export class CameoDirector {
  constructor({ random = () => randomInt(0, 1_000_000) / 1_000_000, createId = randomUUID, onVisitReleased = () => {} } = {}) {
    this.random = random;
    this.createId = createId;
    this.onVisitReleased = onVisitReleased;
    this.queue = [];
    this.current = null;
  }

  enqueue({ characterId = 'preset:rascal', assetUrl = null } = {}, now = Date.now()) {
    const visit = { visitId: this.createId(), characterId, assetUrl };
    const queuedPosition = (this.current ? 1 : 0) + this.queue.length + 1;
    if (this.current) this.queue.push(visit);
    else this.start(visit, now);
    return { ok: true, visitId: visit.visitId, queuedPosition };
  }

  start(visit, now) {
    this.current = { ...visit, startedAt: now, effect: null, effectApplied: false };
  }

  tick(now, simulation) {
    if (!this.current && this.queue.length) this.start(this.queue.shift(), now);
    const visit = this.current;
    if (!visit) return;

    const elapsedMs = Math.max(0, now - visit.startedAt);
    if (!visit.effectApplied && elapsedMs >= EFFECT_START_MS) {
      visit.effect = this.resolveEffect(simulation);
      simulation.applyCameoEffect(visit.effect);
      simulation.addCameoIncident(visit.visitId, visit.effect);
      visit.effectApplied = true;
    }

    if (elapsedMs >= VISIT_DURATION_MS) {
      this.onVisitReleased(visit);
      this.current = null;
      if (this.queue.length) this.start(this.queue.shift(), now);
    }
  }

  resolveEffect(simulation) {
    const roll = this.random();
    const outcome = roll < 0.45 ? 'spill' : roll < 0.9 ? 'delay' : 'both';
    const spills = outcome === 'spill' || outcome === 'both';
    const delays = outcome === 'delay' || outcome === 'both';
    const eligible = spills
      ? simulation.agents.filter(agent => agent.carrying && agent.coffee > 0)
      : [];
    const target = eligible.length ? eligible[Math.floor(this.random() * eligible.length)] : null;

    return {
      outcome,
      spill: target ? { runnerId: target.id, coffeePoints: Math.min(target.coffee, randomInt(10, 16)) } : null,
      delaySeconds: delays ? MACHINE_DELAY_SECONDS : 0,
    };
  }

  snapshot(now = Date.now()) {
    const visit = this.current;
    if (!visit) return { current: null, queuedCount: this.queue.length };

    const elapsedMs = Math.max(0, now - visit.startedAt);
    const phase = elapsedMs < EFFECT_START_MS
      ? 'entering'
      : elapsedMs < EFFECT_END_MS ? 'causing-effect' : 'leaving';
    const phaseStartedAt = phase === 'entering'
      ? visit.startedAt
      : phase === 'causing-effect' ? visit.startedAt + EFFECT_START_MS : visit.startedAt + EFFECT_END_MS;

    return {
      current: {
        visitId: visit.visitId,
        characterId: visit.characterId,
        assetUrl: visit.assetUrl,
        phase,
        phaseElapsedMs: Math.max(0, now - phaseStartedAt),
        effect: visit.effect,
      },
      queuedCount: this.queue.length,
    };
  }

  reset() {
    if (this.current) this.onVisitReleased(this.current);
    for (const visit of this.queue) this.onVisitReleased(visit);
    this.current = null;
    this.queue = [];
  }
}
