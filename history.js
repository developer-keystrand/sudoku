// Scoring and game history: pure functions, no DOM or storage, so they can be tested with `node --test`.
// A result is { date: ISO string, difficulty, seconds, mistakes, won: boolean, score: number }.

export const BASE = { easy: 1000, medium: 2000, hard: 3000 };
export const MISTAKE_PENALTY = 50;
export const MIN_SCORE = 100;
export const MAX_RESULTS = 200;

export function score(difficulty, seconds, mistakes) {
  const base = BASE[difficulty] ?? BASE.medium;
  return Math.max(MIN_SCORE, Math.round(base - seconds - MISTAKE_PENALTY * mistakes));
}

// Returns a new history array with `result` appended, capped at MAX_RESULTS (oldest dropped).
export function addResult(history, result) {
  return [...history, result].slice(-MAX_RESULTS);
}

export function stats(history, difficulty) {
  const games = history.filter((r) => r.difficulty === difficulty);
  const wins = games.filter((r) => r.won);
  const sum = (a, f) => a.reduce((t, r) => t + f(r), 0);
  return {
    played: games.length,
    won: wins.length,
    bestScore: wins.length ? Math.max(...wins.map((r) => r.score)) : null,
    bestTime: wins.length ? Math.min(...wins.map((r) => r.seconds)) : null,
    avgTime: wins.length ? Math.round(sum(wins, (r) => r.seconds) / wins.length) : null,
    avgMistakes: wins.length ? Math.round((sum(wins, (r) => r.mistakes) / wins.length) * 10) / 10 : null,
  };
}

// True if `score` beats every earlier win at this difficulty (or there is none).
export function isBestScore(history, difficulty, value) {
  return history.every((r) => r.difficulty !== difficulty || !r.won || r.score < value);
}
