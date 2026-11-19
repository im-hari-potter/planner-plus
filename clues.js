// Treasure trails (v3.6): finding a clue from what's on your scroll, the sextant's coordinates, and what a
// casket's rewards come to over many of them. The clues and rewards are the server's (cluedata.js).
import { CLUES, CLUE_REWARDS } from './cluedata.js';

export const TIERS = ['easy', 'medium', 'hard'];
export const TIER_NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
export const CLUE_BY_ID = new Map(CLUES.map(c => [c.id, c]));

// ── Coordinates ─────────────────────────────────────────────────────────────
// The server's sextant (output_sextant_coords): minutes north and east of the observatory, 1.875 a square,
// rounded towards 0. -> [degrees, minutes, 'N' | 'S', degrees, minutes, 'E' | 'W']
export const OBSERVATORY = { x: 2440, z: 3161 };
export function sextantText(x, z) {
  const mins = d => Math.trunc((1875 * d) / 1000);
  const part = (m, pos, neg) => { const deg = Math.trunc(m / 60); return [Math.abs(deg), Math.abs(m - deg * 60), m < 0 ? neg : pos]; };
  return [...part(mins(z - OBSERVATORY.z), 'N', 'S'), ...part(mins(x - OBSERVATORY.x), 'E', 'W')];
}
// Coordinates as typed: "22 35 N 19 18 E", "22°35'N, 19°18'E", "22 degrees 35 minutes north 19 degrees 18 minutes east"
export function parseCoords(text) {
  const m = String(text || '').toLowerCase().match(/(\d{1,2})\D{1,12}?(\d{1,2})\D{0,12}?(?<![a-z])(n|s|north|south)(?![a-z])\D{0,12}?(\d{1,2})\D{1,12}?(\d{1,2})\D{0,12}?(?<![a-z])(e|w|east|west)(?![a-z])/);
  if (!m) return null;
  const [, a, b, ns, c, d, ew] = m;
  if (Number(b) > 59 || Number(d) > 59) return null;
  return [Number(a), Number(b), ns[0].toUpperCase(), Number(c), Number(d), ew[0].toUpperCase()];
}
export const coordsText = c => `${String(c[0]).padStart(2, '0')}°${String(c[1]).padStart(2, '0')}′${c[2]} ${String(c[3]).padStart(2, '0')}°${String(c[4]).padStart(2, '0')}′${c[5]}`;
// Where coordinates point: the square in the middle of the ones the sextant would say that for
export function spotOf(c) {
  const z = (c[0] * 60 + c[1]) * (c[2] === 'S' ? -1 : 1), x = (c[3] * 60 + c[4]) * (c[5] === 'W' ? -1 : 1);
  return { x: OBSERVATORY.x + Math.round(x / 1.875), z: OBSERVATORY.z + Math.round(z / 1.875) };
}

// ── Finding a clue ──────────────────────────────────────────────────────────
const norm = s => String(s || '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const letters = s => norm(s).replace(/ /g, '').split('').sort().join('');
// (an anagram's letters: what's under "who to speak to next:")
const anagramOf = c => (c.kind === 'anagram' && /speak to next:/i.test(c.text || '') ? c.text.split(/speak to next:/i)[1] : null);
// What's on the scroll and what it means, to search: the words, and who, what and where the answer is
const answerWords = c => [c.npc, c.loc, c.where, c.key?.who].filter(Boolean).join(' ');
// -> [{ clue, how: 'coords' | 'anagram' | 'words' | 'answer', near? }] best first
export function findClues(text, { tier = null, kind = null, max = 12 } = {}) {
  const pool = CLUES.filter(c => (!tier || c.tier === tier) && (!kind || kindGroup(c) === kind));
  const coords = parseCoords(text);
  if (coords) {
    const exact = pool.filter(c => c.coords && c.coords.join() === coords.join());
    if (exact.length) return exact.map(clue => ({ clue, how: 'coords' }));
    // (none says just that: the clues that dig nearest where it points)
    const at = spotOf(coords);
    return pool.filter(c => c.coords).map(c => ({ clue: c, how: 'coords', near: Math.max(Math.abs(c.at[1] - at.x), Math.abs(c.at[2] - at.z)) }))
      .filter(r => r.near <= 12).sort((a, b) => a.near - b.near).slice(0, max);
  }
  const q = norm(text);
  if (q.length < 2) return [];
  const terms = q.split(' ').filter(t => t.length > 1 || /\d/.test(t));
  const ql = letters(text);
  const out = [];
  for (const c of pool) {
    const said = norm(c.text), ans = norm(answerWords(c));
    let score = 0, how = 'words';
    const ana = anagramOf(c);
    if (ana && ql.length >= 4 && letters(ana) === ql) { score = 1000; how = 'anagram'; }
    else if (said.includes(q)) score = 500 + q.length;
    else if (ans.includes(q)) { score = 300 + q.length; how = 'answer'; }
    else if (terms.length) {
      const inSaid = terms.filter(t => said.includes(t)).length, inAns = terms.filter(t => ans.includes(t)).length;
      const share = Math.max(inSaid, inAns) / terms.length;
      if (share >= 0.6 || (terms.length >= 2 && inSaid + inAns >= terms.length)) { score = 100 * share + inSaid; how = inSaid >= inAns ? 'words' : 'answer'; }
    }
    if (score) out.push({ clue: c, how, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, max).map(({ clue, how }) => ({ clue, how }));
}
// The kinds the clue list is filtered by
export const KIND_GROUPS = ['map', 'coords', 'anagram', 'riddle', 'simple'];
export const KIND_NAMES = { map: 'Maps', coords: 'Coordinates', anagram: 'Anagrams', riddle: 'Riddles', simple: 'Short ones' };
export function kindGroup(c) {
  if (c.kind === 'sextant') return 'coords';
  if (c.kind === 'vague') return 'simple';
  return c.kind;
}

// ── Rewards ─────────────────────────────────────────────────────────────────
// A casket: its rolls (lo to hi, as many each), each one rare at 1 in `rare`, and each item's chance a roll.
// Each item, over a casket: how many on average, and the chance of at least one.
export function rewardsOf(tier) {
  const r = CLUE_REWARDS[tier];
  const counts = [];
  for (let n = r.rolls[0]; n <= r.rolls[1]; n++) counts.push(n);
  const rolls = counts.reduce((t, n) => t + n, 0) / counts.length;
  return {
    rolls: r.rolls, meanRolls: rolls, rare: r.rare,
    items: r.items.map(i => {
      const each = (i.lo + i.hi) / 2, each2 = sumSquares(i.lo, i.hi) / (i.hi - i.lo + 1);
      // (at least one in a casket: one minus none in each of its rolls, the rolls' counts equally likely)
      const casket = 1 - counts.reduce((t, n) => t + Math.pow(1 - i.p, n), 0) / counts.length;
      return { ...i, each, perCasket: rolls * i.p * each, casket, d: { p: i.p, q: i.p * each, m2: i.p * each2, ...(i.lo === i.hi ? { one: i.lo } : {}) } };
    }),
  };
}
const sumSquares = (lo, hi) => { let t = 0; for (let k = lo; k <= hi; k++) t += k * k; return t; };
// The share of caskets with at least one of any of these items (rare ones, say), over a casket
export function anyOf(items, rolls) {
  const p = items.reduce((t, i) => t + i.p, 0);
  const counts = [];
  for (let n = rolls[0]; n <= rolls[1]; n++) counts.push(n);
  return 1 - counts.reduce((t, n) => t + Math.pow(1 - p, n), 0) / counts.length;
}
// What the expected loot is grouped as, a casket's commonest worth knowing ("rune items", "dragonhide")
export const GROUPS = [
  { name: 'Rune armour and weapons', test: i => !i.rare && /^rune_/.test(i.slug) },
  { name: 'Adamant armour and weapons', test: i => !i.rare && /^adamant_/.test(i.slug) },
  { name: 'Black armour and weapons', test: i => !i.rare && /^black_(?!dragonhide)/.test(i.slug) },
  { name: 'Dragonhide', test: i => !i.rare && /dragonhide/.test(i.slug) },
  { name: 'Magic bows', test: i => !i.rare && /^magic_\w*bow$/.test(i.slug) },
  { name: 'Yew bows', test: i => !i.rare && /^yew_\w*bow$/.test(i.slug) },
  { name: 'Willow bows', test: i => !i.rare && /^willow_\w*bow$/.test(i.slug) },
  { name: 'Studded leather', test: i => !i.rare && /^studded_/.test(i.slug) },
  { name: 'God book pages', test: i => /^holy_book_/.test(i.slug) },
  { name: 'Rare rewards', test: i => !!i.rare },
];
