export const FPS = 30;
export const DURATION = 42;

export function shotAt(seconds) {
  if (seconds < 6) return { id: 'intro', time: seconds, source: 0 };
  if (seconds < 10) return { id: 'question', time: seconds - 6, source: seconds - 6 };
  if (seconds < 15) return { id: 'lineup', time: seconds - 10, source: seconds - 10 };
  if (seconds < 18) return { id: 'brew', time: seconds - 15, source: 5.3 + seconds - 15 };
  if (seconds < 21) return { id: 'carry', take: 'chaos', time: seconds - 18, source: seconds - 18 };
  if (seconds < 27) return { id: 'slow', take: 'chaos', time: seconds - 21, source: 3 + (seconds - 21) / 3 };
  if (seconds < 29) return { id: 'aftermath', take: 'chaos', time: seconds - 27, source: 5 + seconds - 27 };
  if (seconds < 32) return { id: 'customer', time: seconds - 29, source: seconds - 29 };
  if (seconds < 35) return { id: 'instructions', take: 'safe', time: seconds - 32, source: seconds - 32 };
  if (seconds < 38) return { id: 'bet', take: 'safe', time: seconds - 35, source: 3 + seconds - 35 };
  if (seconds < 40) return { id: 'delivery', time: seconds - 38, source: .5 + seconds - 38 };
  return { id: 'logo', time: seconds - 40, source: 0 };
}

export function subtitleAt(seconds) {
  const lines = [
    [0.35, 2.15, 'Your agents write your code.'], [2.15, 3.8, 'Fix your bugs.'], [3.8, 5.9, 'Ship your app.'],
    [6.2, 9.6, 'But can they bring you a coffee?'], [10.3, 12.8, 'So we gave them bodies.'],
    [12.8, 14.9, 'And one simple task.'], [15.25, 16.65, 'Seven agents.'], [16.65, 18.1, 'One coffee.'],
    [18.1, 20.9, 'What could possibly go wrong?'], [27.25, 30.8, 'We may have over-engineered this.'],
    [32.15, 34.55, 'Give yours instructions.'], [34.55, 37.2, 'Back your favourite.'],
    [37.8, 39.3, 'Coffee Run.'], [39.3, 40.5, 'Artificial intelligence.'], [40.5, 42, 'Questionable coordination.'],
  ];
  return lines.find(([start, end]) => seconds >= start && seconds < end)?.[2];
}
