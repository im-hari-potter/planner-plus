// (v3.6.1) Reading a casket's rewards from a screenshot, the way bankread.js reads the bank: the reward window
// that opens with the casket shows the rewards in a grid of 3 by 2 slots, 32 pixels each with no gap (the server's
// trail_reward.if), at 243, 93 on the game canvas. Each slot's icon is told by its outline (the near black the
// client draws every icon's in) and then its colours; how many by the stack number over its top left. On a picture
// that isn't the whole canvas, the grid is found by its icons: any reward's icon, then the grid around it with
// the most of them, its first slot filled (the rewards fill the window from it). A picture the size of the game canvas
// (LostKit's screenshots are) has it in its place or not at all; elsewhere, icons in a grid the inventory's or the
// bank's way apart (42 by 36, 47 by 38) are those, not the window's.
// (v3.6.2) And a puzzle box's puzzle (readPuzzle): its pieces are icons too, in a grid of 5 by 5.
// No DOM here: an image is { width, height, data } with RGBA bytes.
import { shapes, readSlots, curve } from './bankread.js';
import { CLUE_REWARDS } from './cluedata.js';
import { solvable } from './puzzle.js';

const SIZE = 32, OUTLINE = 1, TEXT_ROWS = 9;
export const CANVAS = { width: 765, height: 503 };
// (the steps between slots of the inventory's grid and the bank's)
const OTHER_GRIDS = [[42, 0], [0, 36], [47, 0], [0, 38]];
export const TIERS = ['easy', 'medium', 'hard'];

// Where the window's first slot is: { x, y } or null
export const findRewardWindow = (img, icons, win) => findGrid(img, icons, win);
// Where a grid of icons is (its first slot): in its place on a picture the size of the game canvas, or nowhere;
// elsewhere, found by its icons. least: how many of its slots must hold one of them; first: its first slot must
// (the rewards fill theirs from the first; a puzzle's gap can be anywhere); others: the steps of other grids, whose
// icons aren't this one's.
export function findGrid(img, icons, win, { least = 1, first = true, others = OTHER_GRIDS } = {}) {
  const { outlineIn, shapeMatches } = shapes(img, icons);
  const inside = (x, y) => x >= 0 && y >= 0 && x + SIZE <= img.width && y + SIZE <= img.height;
  const known = (x, y) => {
    if (!inside(x, y)) return false;
    const outline = outlineIn(x, y);
    return outline.length >= 8 && shapeMatches({ x, y, outline, set: new Set(outline) }).length > 0;
  };
  const filled = (x, y) => {
    let n = 0;
    for (let r = 0; r < win.rows; r++) for (let c = 0; c < win.cols; c++) if (known(x + c * win.pitchX, y + r * win.pitchY)) n++;
    return n;
  };
  // the whole game canvas: where the client draws it, or nowhere
  if (first ? known(win.x, win.y) : filled(win.x, win.y) >= least) return { x: win.x, y: win.y };
  if (img.width === CANVAS.width && img.height === CANVAS.height) return null;
  // anywhere else: every place a reward's icon is…
  const isOutline = (x, y) => { const p = (y * img.width + x) * 4; return img.data[p] === 0 && img.data[p + 1] === 0 && img.data[p + 2] === OUTLINE; };
  const groups = anchors(icons);
  const tried = new Set(), hits = [];
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (!isOutline(x, y)) continue;
      for (const g of groups) {
        const ox = x - g.ax, oy = y - g.ay;
        if (!inside(ox, oy)) continue;
        const k = oy * img.width + ox;
        if (tried.has(k)) continue;
        // (its lower outline all there, for one of the icons with that first pixel, before the exact test)
        if (!g.icons.some(off => off.every(([dx, dy]) => isOutline(ox + dx, oy + dy)))) continue;
        tried.add(k);
        if (known(ox, oy)) hits.push({ x: ox, y: oy });
      }
    }
  }
  if (!hits.length) return null;
  // (not the inventory's or the bank's: an icon with another the way their slots are apart)
  const all = new Set(hits.map(h => `${h.x},${h.y}`));
  const own = hits.filter(h => !others.some(([dx, dy]) => all.has(`${h.x + dx},${h.y + dy}`) || all.has(`${h.x - dx},${h.y - dy}`)));
  if (!own.length) return null;
  // …and the grid with the most of them, its first slot one of them
  const at = new Set(own.map(h => `${h.x},${h.y}`));
  let best = null;
  for (const h of own) {
    for (let r = 0; r < win.rows; r++) {
      for (let c = 0; c < win.cols; c++) {
        const ox = h.x - c * win.pitchX, oy = h.y - r * win.pitchY;
        let n = 0;
        for (let rr = 0; rr < win.rows; rr++) for (let cc = 0; cc < win.cols; cc++) if (at.has(`${ox + cc * win.pitchX},${oy + rr * win.pitchY}`)) n++;
        const score = n * 10 + (at.has(`${ox},${oy}`) ? 5 : 0);
        if (!best || score > best.score) best = { x: ox, y: oy, score, n };
      }
    }
  }
  return best.n >= least ? { x: best.x, y: best.y } : null;
}
// Each icon's outline below the stack number's rows, as offsets, grouped by the first of them (where a scan meets it)
const ANCHORS = new WeakMap();
function anchors(icons) {
  if (ANCHORS.has(icons)) return ANCHORS.get(icons);
  const byFirst = new Map();
  for (const ic of icons.list) {
    const lower = ic.outline.filter(i => i >= TEXT_ROWS * SIZE);
    if (!lower.length) continue;
    const off = lower.map(i => [i % SIZE, Math.floor(i / SIZE)]);
    const k = `${off[0][0]},${off[0][1]}`;
    const g = byFirst.get(k) || byFirst.set(k, { ax: off[0][0], ay: off[0][1], icons: [], seen: new Set() }).get(k);
    // (an outline once: many icons can share one)
    const key = lower.join(',');
    if (!g.seen.has(key)) { g.seen.add(key); g.icons.push(off); }
  }
  const out = [...byFirst.values()];
  ANCHORS.set(icons, out);
  return out;
}

// -> { ok, x, y, slots: [{ slot, entry, count, … }], unknown, empty } or { ok: false, why: 'no-window' }
export function readReward(img, icons, font, win) {
  const place = findRewardWindow(img, icons, win);
  if (!place) return { ok: false, why: 'no-window' };
  const { outlineIn, shapeMatches } = shapes(img, icons);
  const all = [];
  for (let r = 0; r < win.rows; r++) {
    for (let c = 0; c < win.cols; c++) {
      const x = place.x + c * win.pitchX, y = place.y + r * win.pitchY;
      // (a slot the picture cuts off is empty)
      const outline = x >= 0 && y >= 0 && x + SIZE <= img.width && y + SIZE <= img.height ? outlineIn(x, y) : [];
      all.push({ slot: r * win.cols + c, row: r, col: c, x, y, outline, set: new Set(outline) });
    }
  }
  return { ok: true, ...place, hash: hashOf(img, place.x, place.y, win.cols * win.pitchX, win.rows * win.pitchY), image: imageHash(img), ...readSlots(img, icons, font, all, shapeMatches) };
}
// Pixels hashed (FNV-1a), to tell a screenshot read before: the window's (hash: a casket with just the same
// rewards, or the same one taken twice) and the whole picture's (image: this very screenshot)
function hashOf(img, x0, y0, w, h0) {
  let h = 0x811c9dc5;
  for (let y = Math.max(0, y0); y < Math.min(img.height, y0 + h0); y++) {
    for (let x = Math.max(0, x0); x < Math.min(img.width, x0 + w); x++) {
      const p = (y * img.width + x) * 4;
      for (let k = 0; k < 3; k++) { h ^= img.data[p + k]; h = Math.imul(h, 0x01000193) >>> 0; }
    }
  }
  return h.toString(36);
}
export const imageHash = img => `${img.width}x${img.height}:${hashOf(img, 0, 0, img.width, img.height)}`;

// What was read, as rewards: [{ slot, slug, noted, count, alts: [slugs that look the same] | null }], and how many
// slots held something that isn't a reward we know
export function rewardItems(read) {
  const items = [];
  let unknown = 0;
  for (const s of read.slots || []) {
    if (!s.entry) { unknown++; continue; }
    const e = s.entry;
    items.push({ slot: s.slot, slug: e.of || e.slug, noted: !!e.noted, count: s.count ?? 1, min: s.min ?? s.count ?? 1, max: s.max ?? s.count ?? 1, alts: e.also ? [e.of || e.slug, ...e.also] : null });
  }
  return { items, unknown };
}

// The clues these rewards could be from: every item one of its rewards (noted as there), as many as its rolls
// could add up to (one stack can be several rolls of it), and all of them together no more rolls than it has
// (hard's junk roll gives three potions at once: two more).
export function tiersOf(items, rewards = CLUE_REWARDS) {
  if (!items.length) return [];
  return TIERS.filter(t => {
    const R = rewards[t];
    const most = R.rolls[1], room = most + (t === 'hard' ? 2 : 0);
    let rolls = 0;
    for (const it of items) {
      const slugs = it.alts || [it.slug];
      const rows = R.items.filter(i => slugs.includes(i.slug) && !!i.noted === !!it.noted);
      // (the fewest rolls it can be)
      let fewest = Infinity;
      for (const i of rows) for (let k = 1; k <= most && k < fewest; k++) if (it.max >= k * i.lo && it.min <= k * i.hi) fewest = k;
      if (fewest === Infinity) return false;
      rolls += fewest;
    }
    return rolls <= room;
  });
}

// ── (v3.6.2) A puzzle box's puzzle from a screenshot ──
// The puzzle (the server's trail_puzzle.if) shows its pieces in a grid of 5 by 5 slots, 32 pixels each and 5 apart,
// at 175, 58 on the game canvas; the gap is an empty slot. Each piece is an item, drawn as every icon is (the
// pieces are PUZZLE_PIECES, puzzles.png's cells). Which picture it is: the one whose pieces the slots are nearest;
// which piece is where: each piece once, the closest way round (the pieces of a picture's sky can look alike);
// and the game's puzzles can always be solved, so when the closest way round can't be, the two pieces that are
// likeliest the other way round are swapped (and said to be unsure).
// -> { ok, x, y, letter, cells: [25: a piece 1 to 24, 0 the gap, null not read], unsure: [slots], brightness }
//    or { ok: false, why: 'no-puzzle' }
export const PUZZLE_LETTERS = ['b', 'c', 'd'];
export const PUZZLE_PIECES = PUZZLE_LETTERS.flatMap(letter => Array.from({ length: 24 }, (_, i) => ({ slug: `${letter}${i + 1}`, letter, piece: i + 1 })));
export function readPuzzle(img, icons, win) {
  const place = findGrid(img, icons, win, { least: 12, first: false, others: [] });
  if (!place) return { ok: false, why: 'no-puzzle' };
  const { outlineIn, shapeMatches } = shapes(img, icons);
  const inside = (x, y) => x >= 0 && y >= 0 && x + SIZE <= img.width && y + SIZE <= img.height;
  const slots = [];
  for (let i = 0; i < win.cols * win.rows; i++) {
    const x = place.x + (i % win.cols) * win.pitchX, y = place.y + Math.floor(i / win.cols) * win.pitchY;
    const outline = inside(x, y) ? outlineIn(x, y) : [];
    const s = { i, x, y, outline, set: new Set(outline) };
    s.piece = outline.length >= 8 && shapeMatches(s).length > 0;
    slots.push(s);
  }
  const pieces = slots.filter(s => s.piece);
  // how far a slot's colours are from a piece's (the brightness setting allowed for: k); each icon's pixels as
  // offsets in this picture
  const data = img.data, W = img.width;
  const offs = new Map(icons.list.map(ic => [ic, Int32Array.from(ic.colour, ([i]) => ((i / SIZE | 0) * W + (i % SIZE)) * 4)]));
  // (the curve for each colour value, worked out once for each k)
  const luts = new Map();
  const lut = k => luts.get(k) || luts.set(k, Float64Array.from({ length: 256 }, (_, c) => curve(c, k))).get(k);
  const dist = (ic, s, k, step = 1) => {
    const off = offs.get(ic), base = (s.y * W + s.x) * 4, L = lut(k);
    let d = 0, n = 0;
    for (let j = 0; j < ic.colour.length; j += step) {
      const c = ic.colour[j], p = base + off[j];
      d += Math.abs(L[c[1]] - data[p]) + Math.abs(L[c[2]] - data[p + 1]) + Math.abs(L[c[3]] - data[p + 2]);
      n++;
    }
    return n ? d / n : Infinity;
  };
  // (the brightness: fitted on each slot's few nearest pieces)
  const nearest = pieces.map(s => icons.list.map(ic => [ic, dist(ic, s, 1, 3)]).sort((a, b) => a[1] - b[1]).slice(0, 6).map(([ic]) => ic));
  const fit = (k, step) => pieces.reduce((t, s, r) => t + Math.min(80, ...nearest[r].map(ic => dist(ic, s, k, step))), 0) / Math.max(1, pieces.length);
  let k = 1, best = fit(1, 3);
  if (best > 6) {
    for (let kk = 0.6; kk <= 1.66; kk += 0.05) { const f = fit(kk, 3); if (f < best) { best = f; k = kk; } }
    for (let kk = k - 0.04; kk <= k + 0.041; kk += 0.01) { const f = fit(kk, 2); if (f < best) { best = f; k = kk; } }
  }
  // the picture: the one whose pieces the slots are nearest
  const near = (s, l, step) => Math.min(...icons.list.filter(ic => ic.e.letter === l).map(ic => dist(ic, s, k, step)));
  const letter = PUZZLE_LETTERS.map(l => [l, pieces.reduce((t, s) => t + near(s, l, 2), 0)]).sort((a, b) => a[1] - b[1])[0][0];
  const cols = icons.list.filter(ic => ic.e.letter === letter);
  // each slot against each of its pieces (a slot near none of them isn't one we can read: something's in front of it)
  const all = pieces.map(s => cols.map(ic => dist(ic, s, k)));
  const readable = pieces.filter((s, r) => Math.min(...all[r]) <= 40);
  const cost = readable.map(s => all[pieces.indexOf(s)]);
  const cells = Array(25).fill(null), unsure = [];
  if (readable.length) assign(cost).forEach((c, r) => { cells[readable[r].i] = cols[c].e.piece; });
  // the gap: the one empty slot; a piece we couldn't see, the one left over if there's just one. Two empty slots and
  // a piece left: it's in the one where the puzzle can be solved, if only one way can be
  const empty = slots.filter(s => !s.outline.length);
  const unread = slots.filter(s => cells[s.i] == null && s.outline.length);
  const left = Array.from({ length: 24 }, (_, i) => i + 1).filter(p => !cells.includes(p));
  if (empty.length === 1) {
    cells[empty[0].i] = 0;
    if (unread.length === 1 && left.length === 1) { cells[unread[0].i] = left[0]; unsure.push(unread[0].i); }
  } else if (empty.length === 2 && !unread.length && left.length === 1) {
    const ways = [[0, 1], [1, 0]].map(([g, p]) => { const c = cells.slice(); c[empty[g].i] = 0; c[empty[p].i] = left[0]; return c; }).filter(solvable);
    if (ways.length === 1) { cells.splice(0, 25, ...ways[0]); unsure.push(empty[ways[0][empty[0].i] ? 0 : 1].i); }
  }
  // the game's can be solved: when this can't, the two likeliest the other way round
  if (cells.every(v => v != null) && !solvable(cells)) {
    const col = p => cols.findIndex(ic => ic.e.piece === p);
    let swap = null;
    for (let a = 0; a < readable.length; a++) for (let b = a + 1; b < readable.length; b++) {
      const pa = cells[readable[a].i], pb = cells[readable[b].i];
      const extra = cost[a][col(pb)] + cost[b][col(pa)] - cost[a][col(pa)] - cost[b][col(pb)];
      if (!swap || extra < swap.extra) swap = { a: readable[a].i, b: readable[b].i, extra };
    }
    if (swap) { [cells[swap.a], cells[swap.b]] = [cells[swap.b], cells[swap.a]]; unsure.push(swap.a, swap.b); }
  }
  return { ok: true, x: place.x, y: place.y, letter, cells, unsure, brightness: k };
}
// The least cost of giving each row a column of its own (rows no more than columns): the Hungarian method.
// -> each row's column
export function assign(cost) {
  const n = cost.length, m = cost[0].length;
  const u = new Float64Array(n + 1), v = new Float64Array(m + 1), p = new Int32Array(m + 1), way = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(m + 1).fill(Infinity), used = new Uint8Array(m + 1);
    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) { if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta; }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const out = new Array(n);
  for (let j = 1; j <= m; j++) if (p[j]) out[p[j] - 1] = j - 1;
  return out;
}
