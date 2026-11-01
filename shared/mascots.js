// Character identities from the original Coffee Royale asset library (PR #3).
export const MASCOT_SCALE = .67;
// Neutral carry socket, measured in game units; bodyY includes the cup's .17 collider offset.
export const CUP_HOLD = { right: .31, forward: .30, bodyY: 1 };

export const MASCOTS = {
  astra: { name: 'Astra', color: '#75d8b1', accent: '#348a70', icon: '✦', subtitle: 'The cosmic overachiever', description: 'A tiny space suit. An enormous sense of responsibility.' },
  opus: { name: 'Opus', color: '#f5a16a', accent: '#d66b31', icon: '✳', subtitle: 'The overthinking optimist', description: 'Thinks twelve moves ahead. Forgets where the coffee is.' },
  grokbot: { name: 'Grokbot', color: '#45504e', accent: '#515744', icon: '↯', subtitle: 'The professional menace', description: 'Two pointy ears. Zero respect for the queue.' },
  argon: { name: 'Argon', color: '#bfa5e5', accent: '#8464bc', icon: '≈', subtitle: 'The unbothered wildcard', description: 'Perfectly calm. Suspiciously close to the free bar.' },
  deepseek: { name: 'DeepSeek', color: '#568de8', accent: '#3768c6', icon: '≋', subtitle: 'The deep-blue daydreamer', description: 'Dives deep into thought. Surfaces for a flat white.', guest: true },
  kimi: { name: 'Kimi', color: '#3c4774', accent: '#a27a22', icon: '☾', subtitle: 'The midnight moonwalker', description: 'One small step for a bot. One giant coffee order.', guest: true },
  mistral: { name: 'Mistral', color: '#f1a336', accent: '#ca512d', icon: '▰', subtitle: 'The little whirlwind', description: 'A warm smile. A very questionable coffee speed limit.', guest: true },
};
