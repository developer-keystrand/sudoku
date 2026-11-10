import { generate, conflicts, isComplete, peers } from "./sudoku.js";

const SAVE_KEY = "sudoku-save-v1";
const $ = (id) => document.getElementById(id);
const boardEl = $("board"), padEl = $("pad"), msgEl = $("message"), timerEl = $("timer");
const diffEl = $("difficulty");

let game;            // { puzzle, solution, values, notes, difficulty, elapsed, won }
let selected = -1;
let notesMode = false;
let undoStack = [];
let tickStart = 0;   // performance.now() of last timer tick; 0 when paused

// ---- state ----------------------------------------------------------------
function newGame(difficulty) {
  const { puzzle, solution } = generate(difficulty);
  game = { puzzle, solution, values: puzzle.slice(), notes: new Array(81).fill(0), difficulty, elapsed: 0, won: false };
  selected = -1; undoStack = [];
  save(); render();
}

function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); } catch { /* private mode / full: ignore */ }
}

function load() {
  try {
    const g = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (g && g.puzzle?.length === 81 && g.values?.length === 81 && g.notes?.length === 81) return g;
  } catch { /* corrupt save: fall through */ }
  return null;
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
    game.notes[selected] = 0;
    if (!same) for (const p of peers(selected)) game.notes[p] &= ~(1 << d);
  }
  afterChange();
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
  if (isComplete(game.values)) { game.won = true; stopTimer(); }
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
  if (game.won || !game.values.some((v, i) => v !== game.puzzle[i]) || confirm("Abandon this game and start a new one?")) {
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
  msgEl.textContent = game.won ? `Solved in ${fmt(game.elapsed)}` : "";
}

// ---- boot -----------------------------------------------------------------
game = load();
if (game) render(); else newGame("medium");
startTimer();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
