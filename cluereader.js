// (v3.6.1) Reading a casket's rewards from a screenshot, the way bankread.js reads the bank: the reward window
// that opens with the casket shows the rewards in a grid of 3 by 2 slots, 32 pixels each with no gap (the server's
// trail_reward.if), at 243, 93 on the game canvas. Each slot's icon is told by its outline (the near black the
// client draws every icon's in) and then its colours; how many by the stack number over its top left. On a picture
// that isn't the whole canvas, the grid is found by its icons: any reward's icon, then the grid around it with
// the most of them, its first slot filled (the rewards fill the window from it). A picture the size of the game canvas
// (LostKit's screenshots are) has it in its place or not at all; elsewhere, icons in a grid the inventory's or the
// bank's way apart (42 by 36, 47 by 38) are those, not the window's.
// No DOM here: an image is { width, height, data } with RGBA bytes.
import { shapes, readSlots } from './bankread.js';
import { CLUE_REWARDS } from './cluedata.js';

const SIZE = 32, OUTLINE = 1, TEXT_ROWS = 9;
export const CANVAS = { width: 765, height: 503 };
// (the steps between slots of the inventory's grid and the bank's)
const OTHER_GRIDS = [[42, 0], [0, 36], [47, 0], [0, 38]];
export const TIERS = ['easy', 'medium', 'hard'];

// Where the window's first slot is: { x, y } or null
export function findRewardWindow(img, icons, win) {
  const { outlineIn, shapeMatches } = shapes(img, icons);
  const inside = (x, y) => x >= 0 && y >= 0 && x + SIZE <= img.width && y + SIZE <= img.height;
  const known = (x, y) => {
    if (!inside(x, y)) return false;
    const outline = outlineIn(x, y);
    return outline.length >= 8 && shapeMatches({ x, y, outline, set: new Set(outline) }).length > 0;
  };
  // the whole game canvas: where the client draws it, or nowhere
  if (known(win.x, win.y)) return { x: win.x, y: win.y };
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
  const own = hits.filter(h => !OTHER_GRIDS.some(([dx, dy]) => all.has(`${h.x + dx},${h.y + dy}`) || all.has(`${h.x - dx},${h.y - dy}`)));
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
        if (!best || score > best.score) best = { x: ox, y: oy, score };
      }
    }
  }
  return { x: best.x, y: best.y };
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
    (byFirst.get(k) || byFirst.set(k, { ax: off[0][0], ay: off[0][1], icons: [] }).get(k)).icons.push(off);
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
