import { randomUUID } from 'node:crypto';

export class BettingBook {
  constructor(runners, startingBalance = 1000) {
    this.runners = new Set(runners.map((runner) => runner.id));
    this.startingBalance = startingBalance;
    this.players = new Map();
    this.wagers = new Map();
    this.settled = false;
    this.results = [];
  }

  join(id, name) {
    const playerId = typeof id === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(id) ? id : randomUUID();
    const cleanName = typeof name === 'string'
      ? name.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 24)
      : '';
    let player = this.players.get(playerId);
    if (!player) {
      player = { id: playerId, name: cleanName || 'Coffee enthusiast', balance: this.startingBalance, lastResult: null };
      this.players.set(playerId, player);
    } else if (cleanName) {
      player.name = cleanName;
    }
    return this.player(playerId);
  }

  player(id) {
    const player = this.players.get(id);
    return player ? { ...player, bet: this.wagers.get(id) || null } : null;
  }

  place(id, runnerId, amount, phase) {
    const player = this.players.get(id);
    if (!player) return { ok: false, error: 'Join the room before placing a bet.' };
    if (phase !== 'betting' || this.settled) return { ok: false, error: 'Bets are closed for this race.' };
    if (!this.runners.has(runnerId)) return { ok: false, error: 'Choose a runner from the lineup.' };
    if (!Number.isSafeInteger(amount) || amount < 1) return { ok: false, error: 'Bet a whole number of beans.' };
    const previous = this.wagers.get(id);
    const available = player.balance + (previous?.amount || 0);
    if (amount > available) return { ok: false, error: 'You do not have enough beans for that bet.' };
    player.balance = available - amount;
    this.wagers.set(id, { runnerId, amount });
    return { ok: true, player: this.player(id) };
  }

  summary(connectedPlayers = this.players.size) {
    const poolByRunner = Object.fromEntries([...this.runners].map((id) => [id, 0]));
    const countsByRunner = { ...poolByRunner };
    let total = 0;
    for (const wager of this.wagers.values()) {
      poolByRunner[wager.runnerId] += wager.amount;
      countsByRunner[wager.runnerId] += 1;
      total += wager.amount;
    }
    return { total, poolByRunner, countsByRunner, players: connectedPlayers };
  }

  settle(winnerId) {
    if (this.settled) return this.results;
    this.settled = true;
    const total = [...this.wagers.values()].reduce((sum, wager) => sum + wager.amount, 0);
    const winners = [...this.wagers.entries()].filter(([, wager]) => wager.runnerId === winnerId);
    const winnerPool = winners.reduce((sum, [, wager]) => sum + wager.amount, 0);
    const payouts = new Map();
    if (!winnerPool) {
      for (const [id, wager] of this.wagers) payouts.set(id, wager.amount);
    } else {
      const shares = winners.map(([id, wager]) => {
        const exact = total * wager.amount / winnerPool;
        return { id, payout: Math.floor(exact), remainder: exact % 1 };
      });
      let left = total - shares.reduce((sum, share) => sum + share.payout, 0);
      shares.sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id));
      for (const share of shares) {
        if (left > 0) { share.payout += 1; left -= 1; }
        payouts.set(share.id, share.payout);
      }
    }
    this.results = [...this.wagers.entries()].map(([id, wager]) => {
      const player = this.players.get(id);
      const payout = payouts.get(id) || 0;
      player.balance += payout;
      const result = {
        playerId: id, name: player.name, runnerId: wager.runnerId,
        amount: wager.amount, payout, profit: payout - wager.amount,
        refunded: !winnerPool, balance: player.balance,
      };
      player.lastResult = result;
      return result;
    }).sort((a, b) => b.profit - a.profit);
    return this.results;
  }

  reset({ refund = false } = {}) {
    if (refund && !this.settled) {
      for (const [id, wager] of this.wagers) this.players.get(id).balance += wager.amount;
    }
    this.wagers.clear();
    this.settled = false;
    this.results = [];
  }
}
