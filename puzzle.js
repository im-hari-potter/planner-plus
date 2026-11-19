// The sliding puzzle in a hard clue's puzzle box (v3.6), as the server has it (trail_puzzle.rs2): 5 by 5, 24
// pieces and a gap; solved, pieces 1 to 24 in reading order and the gap last. It's shuffled by sliding pieces
// at random from solved, so every puzzle the game gives can be solved.
//
// A puzzle is an array of 25: the piece in each slot, 1 to 24, and 0 for the gap. solve() gives the slots to
// click, in order: each the piece next to the gap that slides into it. A* finds a short way (guided by how far
// each piece is from its place, plus pieces in the right row or column but in each other's way, counted a little
// over: close to the fewest moves there are, in a few hundredths of a second); should that look too long, row by
// row (the top row, the left column, and so on, each the shortest way that leaves the ones placed alone), which is
// always quick and about twice as long.
export const SIZE = 5, CELLS = 25;
const ROW = i => Math.floor(i / SIZE), COL = i => i % SIZE;
// (the slots next to each slot)
const NEXT = Array.from({ length: CELLS }, (_, i) => [i - SIZE, i + SIZE, COL(i) ? i - 1 : -1, COL(i) < SIZE - 1 ? i + 1 : -1].filter(j => j >= 0 && j < CELLS));
export const SOLVED = Object.freeze([...Array(CELLS - 1).keys()].map(k => k + 1).concat(0));

// Whether a puzzle is one of the game's: 24 pieces and a gap, and an even number of pieces before ones that
// should come before them (a 5-wide board keeps that even with every slide)
export function solvable(state) {
  if (!Array.isArray(state) || state.length !== CELLS || new Set(state).size !== CELLS || state.some(v => !Number.isInteger(v) || v < 0 || v >= CELLS)) return false;
  const tiles = state.filter(v => v);
  let inv = 0;
  for (let a = 0; a < tiles.length; a++) for (let b = a + 1; b < tiles.length; b++) if (tiles[a] > tiles[b]) inv++;
  return inv % 2 === 0;
}
export const isSolved = state => state.every((v, i) => v === SOLVED[i]);

// Slides the piece in slot `at` into the gap next to it: a new puzzle, or null if it isn't next to the gap.
export function slide(state, at) {
  const gap = state.indexOf(0);
  if (!NEXT[gap].includes(at)) return null;
  const s = state.slice();
  s[gap] = s[at]; s[at] = 0;
  return s;
}
// Which way the piece in slot `at` slides into the gap: 'up', 'down', 'left', 'right'
export function direction(state, at) {
  const gap = state.indexOf(0);
  return gap === at - SIZE ? 'up' : gap === at + SIZE ? 'down' : gap === at - 1 ? 'left' : gap === at + 1 ? 'right' : null;
}

// ── Few moves: weighted A* ──────────────────────────────────────────────────
const md = (piece, at) => { const g = piece - 1; return Math.abs(ROW(g) - ROW(at)) + Math.abs(COL(g) - COL(at)); };
// Pieces in their own row (or column) but in each other's way: 2 moves more for each one that has to step aside
// (the line's pieces less the longest run already in order)
function lineConflict(state, line, byRow) {
  const goals = [];
  for (let k = 0; k < SIZE; k++) {
    const at = byRow ? line * SIZE + k : k * SIZE + line;
    const p = state[at];
    if (!p) continue;
    const g = p - 1;
    if (byRow ? ROW(g) === line : COL(g) === line) goals.push(byRow ? COL(g) : ROW(g));
  }
  if (goals.length < 2) return 0;
  const best = goals.map(() => 1);
  for (let a = 1; a < goals.length; a++) for (let b = 0; b < a; b++) if (goals[b] < goals[a]) best[a] = Math.max(best[a], best[b] + 1);
  return 2 * (goals.length - Math.max(...best));
}
function heuristic(state) {
  let h = 0;
  for (let i = 0; i < CELLS; i++) if (state[i]) h += md(state[i], i);
  for (let l = 0; l < SIZE; l++) h += lineConflict(state, l, true) + lineConflict(state, l, false);
  return h;
}
// A* with the distance left counted `w` times (a little over 1: close to the fewest moves, and quick); null past `cap` puzzles looked at
function weightedAStar(start, w, cap) {
  const key = s => String.fromCharCode(...s.map(v => v + 65));
  const k0 = key(start), seen = new Map([[k0, null]]);
  const open = heap();
  open.push(w * heuristic(start), { s: start, g: 0, k: k0 });
  let n = 0;
  while (open.size) {
    const cur = open.pop();
    if (++n > cap) return null;
    if (isSolved(cur.s)) {
      const clicks = [];
      for (let k = cur.k; seen.get(k);) { const [from, c] = seen.get(k); clicks.push(c); k = from; }
      return clicks.reverse();
    }
    const gap = cur.s.indexOf(0);
    for (const at of NEXT[gap]) {
      const s = cur.s.slice();
      s[gap] = s[at]; s[at] = 0;
      const k = key(s);
      if (seen.has(k)) continue;
      seen.set(k, [cur.k, at]);
      open.push(cur.g + 1 + w * heuristic(s), { s, g: cur.g + 1, k });
    }
  }
  return null;
}

// ── Row by row ──────────────────────────────────────────────────────────────
// A small heap for A*
function heap() {
  const a = [];
  return {
    get size() { return a.length; },
    push(f, v) { a.push([f, v]); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } },
    pop() {
      const top = a[0], last = a.pop();
      if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
      return top[1];
    },
  };
}
// Puts `pieces` in their places without moving what's in `fixed`: the shortest way for those pieces and the gap
// (the other pieces just make way). Returns the slots clicked, and the puzzle after.
function placeStage(state, pieces, fixed) {
  const at0 = pieces.map(p => state.indexOf(p)), gap0 = state.indexOf(0);
  const h = pos => pos.reduce((t, at, k) => t + md(pieces[k], at), 0);
  const keyOf = (pos, gap) => pos.join(',') + '|' + gap;
  const seen = new Map([[keyOf(at0, gap0), null]]);
  const open = heap();
  open.push(h(at0), { pos: at0, gap: gap0, g: 0 });
  while (open.size) {
    const cur = open.pop();
    if (cur.pos.every((at, k) => at === pieces[k] - 1)) {
      // back along the way it came
      const clicks = [];
      let k = keyOf(cur.pos, cur.gap);
      while (seen.get(k)) { const [from, click] = seen.get(k); clicks.push(click); k = from; }
      clicks.reverse();
      let s = state;
      for (const c of clicks) s = slide(s, c);
      return { clicks, state: s };
    }
    for (const at of NEXT[cur.gap]) {
      if (fixed.has(at)) continue;
      const pos = cur.pos.map(p => (p === at ? cur.gap : p));
      const k = keyOf(pos, at);
      if (seen.has(k)) continue;
      seen.set(k, [keyOf(cur.pos, cur.gap), at]);
      open.push(cur.g + 1 + h(pos), { pos, gap: at, g: cur.g + 1 });
    }
  }
  throw new Error('puzzle: a stage that can\'t be done');
}
function rowByRow(start) {
  let s = start.slice();
  const clicks = [], fixed = new Set();
  const stage = pieces => { const r = placeStage(s, pieces, fixed); clicks.push(...r.clicks); s = r.state; for (const p of pieces) fixed.add(p - 1); };
  stage([1, 2, 3]); stage([4, 5]);          // the top row
  stage([6, 11]); stage([16, 21]);          // the left column
  stage([7, 8]); stage([9, 10]);            // the second row
  stage([12, 17, 22]);                      // the second column
  stage([13, 14, 15, 18, 19, 20, 23, 24]);  // the last 3 by 3
  return clicks;
}
// (a click straight back undoes one: both go)
function tidy(state, clicks) {
  const out = [];
  const gaps = [state.indexOf(0)];
  for (const c of clicks) {
    if (out.length && c === gaps[gaps.length - 2]) { out.pop(); gaps.pop(); continue; }
    out.push(c); gaps.push(c);
  }
  return out;
}

// The slots to click to solve a puzzle (none if solved), or null if it can't be solved.
export function solve(state) {
  if (!solvable(state)) return null;
  if (isSolved(state)) return [];
  return weightedAStar(state, 1.2, 300000) || weightedAStar(state, 2, 200000) || tidy(state, rowByRow(state));
}
