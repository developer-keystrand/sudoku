// Pure Sudoku logic: no DOM, so it can be tested with `node --test`.
// A grid is an array of 81 ints, 0 = empty, row-major.

export const CLUES = { easy: 42, medium: 34, hard: 28 };

const ROW = (i) => Math.floor(i / 9);
const COL = (i) => i % 9;
const BOX = (i) => Math.floor(ROW(i) / 3) * 3 + Math.floor(COL(i) / 3);

function masks(grid) {
  const rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxes = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    const v = grid[i];
    if (!v) continue;
    const b = 1 << v;
    if ((rows[ROW(i)] & b) || (cols[COL(i)] & b) || (boxes[BOX(i)] & b)) return null;
    rows[ROW(i)] |= b; cols[COL(i)] |= b; boxes[BOX(i)] |= b;
  }
  return { rows, cols, boxes };
}

// Backtracking search with fewest-candidates-first. Returns the number of
// solutions found, stopping at `limit`. Fills `out` with the first solution.
function search(grid, limit, rng, out) {
  const m = masks(grid);
  if (!m) return 0;
  const g = grid.slice();
  let count = 0;
  const rec = () => {
    let best = -1, bestAvail = 0, bestN = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const avail = ~(m.rows[ROW(i)] | m.cols[COL(i)] | m.boxes[BOX(i)]) & 0x3fe;
      let n = 0;
      for (let a = avail; a; a &= a - 1) n++;
      if (n < bestN) { best = i; bestAvail = avail; bestN = n; if (n <= 1) break; }
    }
    if (best < 0) { if (count === 0 && out) out.push(...g); return ++count >= limit; }
    if (bestN === 0) return false;
    const digits = [];
    for (let d = 1; d <= 9; d++) if (bestAvail & (1 << d)) digits.push(d);
    if (rng) shuffle(digits, rng);
    for (const d of digits) {
      const b = 1 << d;
      g[best] = d; m.rows[ROW(best)] |= b; m.cols[COL(best)] |= b; m.boxes[BOX(best)] |= b;
      const stop = rec();
      g[best] = 0; m.rows[ROW(best)] &= ~b; m.cols[COL(best)] &= ~b; m.boxes[BOX(best)] &= ~b;
      if (stop) return true;
    }
    return false;
  };
  rec();
  return count;
}

export function countSolutions(grid, limit = 2) {
  return search(grid, limit, null, null);
}

export function solve(grid) {
  const out = [];
  return search(grid, 1, null, out) ? out : null;
}

function shuffle(a, rng) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Returns { puzzle, solution } with a unique solution and CLUES[difficulty]
// givens (or slightly more if removal cannot go further without ambiguity).
export function generate(difficulty = "medium", rng = Math.random) {
  const solution = [];
  search(new Array(81).fill(0), 1, rng, solution);
  const puzzle = solution.slice();
  const target = CLUES[difficulty] ?? CLUES.medium;
  let clues = 81;
  for (const i of shuffle([...Array(81).keys()], rng)) {
    if (clues <= target) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle, 2) !== 1) puzzle[i] = keep; else clues--;
  }
  return { puzzle, solution };
}

// Indices of cells whose value clashes with another cell in its row, column or box.
export function conflicts(grid) {
  const bad = new Set();
  const groups = (f) => {
    const map = new Map();
    for (let i = 0; i < 81; i++) {
      if (!grid[i]) continue;
      const k = f(i) * 10 + grid[i];
      (map.get(k) ?? map.set(k, []).get(k)).push(i);
    }
    for (const cells of map.values()) if (cells.length > 1) cells.forEach((c) => bad.add(c));
  };
  groups(ROW); groups(COL); groups(BOX);
  return bad;
}

export function isComplete(grid) {
  return grid.every(Boolean) && conflicts(grid).size === 0;
}

export function peers(i) {
  const out = [];
  for (let j = 0; j < 81; j++) {
    if (j !== i && (ROW(j) === ROW(i) || COL(j) === COL(i) || BOX(j) === BOX(i))) out.push(j);
  }
  return out;
}
