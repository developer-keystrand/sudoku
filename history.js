// Scoring and game history: pure functions, no DOM or storage, so they can be tested with `node --test`.
// A result is { v: 2, date: ISO string, difficulty, seconds, mistakes, bonus, won: boolean, score: number }.
// Scoring v2 is a running total: points per correct digit (growing with the streak), a penalty per
// mistake, and a time bonus on completion. Results without `v: 2` used the old end-of-game formula
// and are kept in the history but not compared with the new scores.

export const SCORING_VERSION = 2;
export const MULT = { easy: 1, medium: 2, hard: 3 };
export const CELL_POINTS = 10;
export const STREAK_STEP = 2;      // extra points per consecutive correct digit...
export const STREAK_CAP = 10;      // ...for up to this many steps
export const MISTAKE_PENALTY = 25;
export const PAR_SECONDS = 600;    // time bonus is 1 point per second under this
export const MAX_RESULTS = 200;

const mult = (difficulty) => MULT[difficulty] ?? MULT.medium;

// Points for a correct digit; `streak` counts consecutive scoring digits including this one (>= 1).
export function correctPoints(difficulty, streak) {
  return mult(difficulty) * (CELL_POINTS + STREAK_STEP * Math.min(Math.max(streak, 1) - 1, STREAK_CAP));
}

export function mistakePenalty(difficulty) {
  return mult(difficulty) * MISTAKE_PENALTY;
}

export function timeBonus(difficulty, seconds) {
  return mult(difficulty) * Math.max(0, PAR_SECONDS - Math.floor(seconds));
}

// Returns a new history array with `result` appended, capped at MAX_RESULTS (oldest dropped).
export function addResult(history, result) {
  return [...history, result].slice(-MAX_RESULTS);
}

const current = (r) => r.v === SCORING_VERSION;

export function stats(history, difficulty) {
  const games = history.filter((r) => r.difficulty === difficulty);
  const wins = games.filter((r) => r.won);
  const scored = wins.filter(current);
  const sum = (a, f) => a.reduce((t, r) => t + f(r), 0);
  return {
    played: games.length,
    won: wins.length,
    bestScore: scored.length ? Math.max(...scored.map((r) => r.score)) : null,
    bestTime: wins.length ? Math.min(...wins.map((r) => r.seconds)) : null,
    avgTime: wins.length ? Math.round(sum(wins, (r) => r.seconds) / wins.length) : null,
    avgMistakes: wins.length ? Math.round((sum(wins, (r) => r.mistakes) / wins.length) * 10) / 10 : null,
  };
}

// True if `value` beats every earlier current-scoring win at this difficulty (or there is none).
export function isBestScore(history, difficulty, value) {
  return history.every((r) => r.difficulty !== difficulty || !r.won || !current(r) || r.score < value);
}
