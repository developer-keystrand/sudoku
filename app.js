import { generate, conflicts, isComplete, peers } from "./sudoku.js";
import { SCORING_VERSION, correctPoints, mistakePenalty, timeBonus, addResult, stats, isBestScore } from "./history.js?v=4";

const SAVE_KEY = "sudoku-save-v1";
const HISTORY_KEY = "sudoku-history-v1";
const $ = (id) => document.getElementById(id);
const boardEl = $("board"), padEl = $("pad"), msgEl = $("message"), timerEl = $("timer");
const diffEl = $("difficulty"), mistakesEl = $("mistakes");
const pointsEl = $("points"), streakEl = $("streak"), deltaEl = $("delta");

let game;            // { puzzle, solution, values, notes, difficulty, elapsed, mistakes, points, streak, scored, bonus, won, result }
let selected = -1;
let notesMode = false;
let undoStack = [];
let tickStart = 0;   // performance.now() of last timer tick; 0 when paused

// ---- state ----------------------------------------------------------------
function newGame(difficulty) {
  const { puzzle, solution } = generate(difficulty);
  game = { puzzle, solution, values: puzzle.slice(), notes: new Array(81).fill(0), difficulty, elapsed: 0, mistakes: 0, points: 0, streak: 0,
    scored: new Array(81).fill(0), bonus: 0, won: false, result: null };
  selected = -1; undoStack = [];
  save(); render();
}

function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); } catch { /* private mode / full: ignore */ }
}

function load() {
  try {
    const g = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (g && g.puzzle?.length === 81 && g.values?.length === 81 && g.notes?.length === 81) {
      g.mistakes = Number(g.mistakes) || 0;   // saves from before scoring have no count
      g.points = Number(g.points) || 0;
      g.streak = Number(g.streak) || 0;
      g.bonus = Number(g.bonus) || 0;
      if (!Array.isArray(g.scored) || g.scored.length !== 81) g.scored = g.values.map((v, i) => (v && !g.puzzle[i] ? 1 : 0));
      return g;
    }
  } catch { /* corrupt save: fall through */ }
  return null;
}

function loadHistory() {
  try {
    const h = JSON.parse(localStorage.getItem(HISTORY_KEY));
    if (Array.isArray(h)) return h;
  } catch { /* corrupt history: start again */ }
  return [];
}

function record(won) {
  const history = loadHistory();
  const seconds = Math.round(game.elapsed);
  const result = { v: SCORING_VERSION, date: new Date().toISOString(), difficulty: game.difficulty, seconds,
    mistakes: game.mistakes, bonus: won ? game.bonus : 0, won, score: won ? game.points : 0 };
  if (won) result.best = isBestScore(history, game.difficulty, result.score);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(addResult(history, result))); } catch { /* full: ignore */ }
  return result;
}

function snapshot() {
  undoStack.push({ values: game.values.slice(), notes: game.notes.slice() });
  if (undoStack.length > 300) undoStack.shift();
}

// ---- actions --------------------------------------------------------------
function place(d) {
  if (selected < 0 || game.won || game.puzzle[selected]) return;
  if (notesMode) {
    if (game.values[selected]) return;
    snapshot();
    game.notes[selected] ^= 1 << d;
  } else {
    snapshot();
    const same = game.values[selected] === d;
    game.values[selected] = same ? 0 : d;
    if (!same) score(d);
    game.notes[selected] = 0;
    if (!same) for (const p of peers(selected)) game.notes[p] &= ~(1 << d);
  }
  afterChange();
}

// Running score. Each cell pays out once (so undo + retype can't farm points) and only a
// scoring digit extends the streak; a wrong digit costs points every time and resets it.
function score(d) {
  if (d === game.solution[selected]) {
    if (game.scored[selected]) return;
    game.scored[selected] = 1;
    game.streak++;
    const gain = correctPoints(game.difficulty, game.streak);
    game.points += gain;
    showDelta(`+${gain}`, "good");
  } else {
    game.mistakes++;
    game.streak = 0;
    const loss = Math.min(game.points, mistakePenalty(game.difficulty));
    game.points -= loss;
    showDelta(`−${loss}`, "bad");
  }
}

function showDelta(text, kind) {
  deltaEl.textContent = text;
  deltaEl.className = "";
  void deltaEl.offsetWidth;   // restart the animation
  deltaEl.className = `show ${kind}`;
}

function erase() {
  if (selected < 0 || game.won || game.puzzle[selected]) return;
  if (!game.values[selected] && !game.notes[selected]) return;
  snapshot();
  game.values[selected] = 0; game.notes[selected] = 0;
  afterChange();
}

function undo() {
  const s = undoStack.pop();
  if (!s || game.won) return;
  game.values = s.values; game.notes = s.notes;
  afterChange();
}

function afterChange() {
  if (isComplete(game.values)) {
    game.won = true; stopTimer();
    game.bonus = timeBonus(game.difficulty, game.elapsed);
    game.points += game.bonus;
    game.result = record(true);
  }
  save(); render();
}

// ---- timer ----------------------------------------------------------------
function startTimer() { if (!tickStart && !game.won) tickStart = performance.now(); }
function stopTimer() { flushTimer(); tickStart = 0; }
function flushTimer() {
  if (!tickStart) return;
  const now = performance.now();
  game.elapsed += (now - tickStart) / 1000;
  tickStart = now;
}
function fmt(sec) {
  sec = Math.floor(sec);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}
setInterval(() => { if (tickStart) { flushTimer(); timerEl.textContent = fmt(game.elapsed); } }, 500);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { stopTimer(); save(); } else startTimer();
});

// ---- rendering ------------------------------------------------------------
const cells = [];
for (let i = 0; i < 81; i++) {
  const c = document.createElement("div");
  c.className = "cell"; c.setAttribute("role", "gridcell");
  c.addEventListener("pointerdown", (e) => { e.preventDefault(); selected = i; render(); });
  boardEl.append(c); cells.push(c);
}
for (let d = 1; d <= 9; d++) {
  const b = document.createElement("button");
  b.type = "button"; b.textContent = d; b.dataset.d = d;
  b.addEventListener("click", () => place(d));
  padEl.append(b);
}
$("undo").addEventListener("click", undo);
$("erase").addEventListener("click", erase);
$("notes").addEventListener("click", () => {
  notesMode = !notesMode;
  $("notes").setAttribute("aria-pressed", notesMode);
});
$("new").addEventListener("click", () => {
  const started = game.values.some((v, i) => v !== game.puzzle[i]);
  if (game.won || !started) return newGame(diffEl.value);
  if (confirm("Abandon this game and start a new one?")) {
    stopTimer(); record(false); startTimer();
    newGame(diffEl.value);
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key >= "1" && e.key <= "9") place(+e.key);
  else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") erase();
  else if ((e.ctrlKey || e.metaKey) && e.key === "z") undo();
  else if (e.key === "n") $("notes").click();
  else if (selected >= 0 && e.key.startsWith("Arrow")) {
    const [dr, dc] = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    const r = Math.min(8, Math.max(0, Math.floor(selected / 9) + dr));
    const col = Math.min(8, Math.max(0, (selected % 9) + dc));
    selected = r * 9 + col; render(); e.preventDefault();
  } else return;
});

function render() {
  const bad = conflicts(game.values);
  const selVal = selected >= 0 ? game.values[selected] : 0;
  const near = selected >= 0 ? new Set(peers(selected)) : new Set();
  for (let i = 0; i < 81; i++) {
    const c = cells[i], v = game.values[i];
    c.className = "cell"
      + (game.puzzle[i] ? " given" : "")
      + (i === selected ? " sel" : near.has(i) ? " peer" : "")
      + (selVal && v === selVal && i !== selected ? " same" : "")
      + (bad.has(i) && !game.puzzle[i] ? " bad" : "");
    if (v) c.textContent = v;
    else if (game.notes[i]) {
      c.innerHTML = '<div class="notes">' +
        [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<span>${game.notes[i] & (1 << d) ? d : ""}</span>`).join("") + "</div>";
    } else c.textContent = "";
  }
  const counts = new Array(10).fill(0);
  game.values.forEach((v) => counts[v]++);
  padEl.querySelectorAll("button").forEach((b) => b.classList.toggle("done", counts[b.dataset.d] >= 9));
  diffEl.value = game.difficulty;
  timerEl.textContent = fmt(game.elapsed);
  msgEl.className = game.won ? "win" : "";
  mistakesEl.textContent = `${game.mistakes} ✗`;
  pointsEl.textContent = game.points;
  streakEl.textContent = game.streak >= 2 ? `Streak ×${game.streak}` : "";
  const r = game.result;
  msgEl.textContent = !game.won ? "" : r
    ? `Solved in ${fmt(r.seconds)} · ${r.mistakes} mistake${r.mistakes === 1 ? "" : "s"} · ${r.score} pts${r.bonus ? ` (${r.bonus} time bonus)` : ""}${r.best ? " · New best!" : ""}`
    : `Solved in ${fmt(game.elapsed)}`;
}

// ---- stats dialog ---------------------------------------------------------
async function showStats() {
  const history = loadHistory();
  const body = $("historyBody");
  body.replaceChildren();
  const el = (tag, text, cls) => { const e = document.createElement(tag); e.textContent = text; if (cls) e.className = cls; return e; };
  const row = (cells, tag = "td", cls) => {
    const tr = document.createElement("tr");
    cells.forEach((c, i) => tr.append(el(tag, c, i === 0 ? undefined : cls)));
    return tr;
  };
  const dash = (v, f = (x) => x) => (v == null ? "–" : f(v));

  body.append(el("h2", "Records"));
  const t1 = document.createElement("table");
  t1.append(row(["", "Won", "Best", "Fastest", "Avg"], "th"));
  for (const d of ["easy", "medium", "hard"]) {
    const s = stats(history, d);
    t1.append(row([d[0].toUpperCase() + d.slice(1), `${s.won}/${s.played}`, dash(s.bestScore), dash(s.bestTime, fmt), dash(s.avgTime, fmt)]));
  }
  body.append(t1);

  body.append(el("h2", "Recent games"));
  if (!history.length) { body.append(el("p", "No games yet.", "empty")); }
  else {
    const t2 = document.createElement("table");
    t2.append(row(["Date", "Level", "Time", "✗", "Score"], "th"));
    for (const r of history.slice(-20).reverse()) {
      const when = new Date(r.date).toLocaleDateString(undefined, { day: "numeric", month: "short" });
      const tr = row([when, r.difficulty, fmt(r.seconds), r.mistakes, r.won ? r.score : "gave up"]);
      if (!r.won) tr.lastChild.className = "lost";
      t2.append(tr);
    }
    body.append(t2);
  }
  body.append(el("p",
    "Score: each correct digit earns 10 points plus 2 per correct digit in a row (up to 20 extra), a mistake costs 25 and ends the streak, "
    + "and finishing under 10 minutes adds 1 point per second left. Easy ×1, Medium ×2, Hard ×3. "
    + "Undoing a move doesn't give points back.", "how"));
  const keys = "caches" in window ? await caches.keys().catch(() => []) : [];
  body.append(el("p", `Version: ${keys.find((k) => k.startsWith("sudoku-")) ?? "not cached"}`, "how"));
  $("history").showModal();
}
$("stats").addEventListener("click", showStats);

// ---- boot -----------------------------------------------------------------
game = load();
if (game) render(); else newGame("medium");
startTimer();

// Check for a new service worker on every open; browsers otherwise do it rarely.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").then((reg) => reg.update()).catch(() => {});
}
