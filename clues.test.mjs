// v3.6: treasure trails (the clues and their answers, the sextant, the rewards) and the puzzle box's solver;
// and the quests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLUES, CLUE_REWARDS, CLUE_MAPS, CLUE_PICS } from './cluedata.js';
import { sextantText, parseCoords, spotOf, findClues, rewardsOf, anyOf, kindGroup, TIERS, CLUE_BY_ID } from './clues.js';
import { solve, solvable, slide, direction, SOLVED, isSolved } from './puzzle.js';
import { QUESTS, QUEST_POINTS } from './questdata.js';
import { needsOf, questPoints, QUEST_BY_KEY } from './quest-ui.js';
import { ITEMS } from './gamedata.js';

// ── The clues ──
test('every clue the server hands out, each with an answer: 66 easy, 56 medium, 64 hard', () => {
  assert.deepEqual(TIERS.map(t => CLUES.filter(c => c.tier === t).length), [66, 56, 64]);
  for (const c of CLUES) {
    assert.ok(['talk', 'search', 'dig'].includes(c.do), `${c.id}: ${c.do}`);
    if (c.do === 'talk') assert.ok(c.npc, `${c.id}: who`); else assert.ok(Array.isArray(c.at) && c.at.length === 3, `${c.id}: where`);
    if (c.do === 'search') assert.ok(c.loc && c.op, `${c.id}: what's searched`);
    assert.ok(c.where && Number.isInteger(c.map), `${c.id}: where in words, and a minimap`);
    if (c.kind === 'map') assert.ok(Number.isInteger(c.pic), `${c.id}: its picture`); else assert.ok(c.text, `${c.id}: its words`);
  }
  // (16 pictures, each its own; the minimaps' sheet as many cells as the clues point to)
  assert.equal(new Set(CLUES.filter(c => c.kind === 'map').map(c => c.pic)).size, 16);
  assert.ok(Math.max(...CLUES.map(c => c.map)) < 200 && CLUE_MAPS.w === 160 && CLUE_PICS.size === 200);
});

test("the sextant: the server's minutes from the observatory, and each coordinate clue says what its dig spot shows", () => {
  assert.deepEqual(sextantText(2440, 3161), [0, 0, 'N', 0, 0, 'E']);
  // (1.875 minutes a square, rounded towards 0: 1 square is 1 minute, 32 squares a degree)
  assert.deepEqual(sextantText(2441, 3160), [0, 1, 'S', 0, 1, 'E']);
  assert.deepEqual(sextantText(2440 + 32, 3161 - 32), [1, 0, 'S', 1, 0, 'E']);
  const coords = CLUES.filter(c => c.coords);
  assert.equal(coords.length, 51);
  for (const c of coords) assert.deepEqual(sextantText(c.at[1], c.at[2]), c.coords, c.id);
  // what's typed points within a square of the dig
  for (const c of coords) {
    const at = spotOf(c.coords);
    assert.ok(Math.abs(at.x - c.at[1]) <= 1 && Math.abs(at.z - c.at[2]) <= 1, `${c.id}: ${JSON.stringify(at)} for ${c.at}`);
  }
});

test('coordinates as people type them', () => {
  const want = [22, 35, 'N', 19, 18, 'E'];
  for (const t of ['22 35 N 19 18 E', '22°35\'N, 19°18\'E', '22 degrees 35 minutes North 19 degrees 18 minutes East', '22.35 north 19.18 east', '22 35n 19 18e', '22-35 N / 19-18 E']) assert.deepEqual(parseCoords(t), want, t);
  assert.deepEqual(parseCoords('05 50 S 10 05 E'), [5, 50, 'S', 10, 5, 'E']);
  assert.deepEqual(parseCoords('0 0 N 7 13 W'), [0, 0, 'N', 7, 13, 'W']);
  for (const t of ['', 'speak to hans', '22 35 N', '22 75 N 19 18 E']) assert.equal(parseCoords(t), null, t);
});

test('finding a clue: its words, a few of them, its anagram scrambled or solved, who it leads to, its coordinates', () => {
  const first = (t, o) => findClues(t, o)[0]?.clue.id;
  assert.equal(first('Search the drawers found upstairs in East Ardougne'), 'easy_vague003');
  assert.equal(first('drawers upstairs east ardougne'), 'easy_vague003');
  assert.equal(first('EEK ZERO OP'), 'medium_anagram003');
  assert.equal(first('zero op eek'), 'medium_anagram003', 'its letters in any order');
  assert.equal(findClues('zero op eek')[0].how, 'anagram');
  assert.equal(first('BAR BELL SEEK'), 'medium_anagram006');
  assert.equal(first('22 35 N 19 18 E'), 'hard_sextant001');
  assert.equal(findClues('22 35 N 19 18 E')[0].how, 'coords');
  // (none says just that: the nearest digs)
  const near = findClues('22 36 N 19 18 E');
  assert.equal(near[0].clue.id, 'hard_sextant001');
  assert.ok(near[0].near <= 2);
  assert.equal(first('my giant guardians below the market streets'), 'hard_riddle011');
  // (who it leads to)
  assert.ok(findClues('hazelmere').some(r => r.clue.id === 'medium_anagram001'));
  assert.deepEqual(findClues('q'), []);
  assert.deepEqual(findClues('xyzzy plugh'), []);
  // (a tier and a kind narrow it)
  assert.ok(findClues('drawers', { tier: 'medium' }).every(r => r.clue.tier === 'medium'));
  assert.ok(findClues('', { kind: 'map' }).length === 0);
  assert.equal(kindGroup(CLUE_BY_ID.get('hard_sextant001')), 'coords');
});

test("answers the server's scripts give: keys, challenge scrolls, puzzle boxes, guardians", () => {
  const c = id => CLUE_BY_ID.get(id);
  assert.deepEqual(c('medium_riddle001').key, { who: 'Black Heather', level: c('medium_riddle001').key.level, where: c('medium_riddle001').key.where, map: c('medium_riddle001').key.map });
  assert.equal(c('medium_riddle004').key.who, 'Any chicken');
  assert.equal(c('medium_riddle005').key.who, 'Any Man');
  // (the zoo: 32 is what worked in the game; the server's files say 40)
  assert.deepEqual(c('medium_anagram003').challenge, { q: 'How many animals in total are there in the zoo?', a: 32, server: 40 });
  assert.equal(c('medium_anagram001').challenge.a, 6859);
  assert.equal(CLUES.filter(x => x.challenge).length, 6);
  assert.deepEqual(['b', 'c', 'd'].map(l => CLUES.filter(x => x.puzzle === l).length), [3, 3, 3]);
  assert.equal(c('hard_riddle014').npc, 'Oziach');
  assert.equal(c('hard_riddle014').puzzle, 'b');
  const wizards = CLUES.filter(x => x.guardian);
  assert.equal(wizards.length, 30);
  // (Zamorak's in the Wilderness, Saradomin's elsewhere)
  for (const x of wizards) assert.equal(x.guardian.who, /Wilderness level/.test(x.where) ? 'Zamorak Wizard' : 'Saradomin Wizard', x.id);
});

// ── Rewards ──
test("a casket's rewards: the server's rolls and tables", () => {
  assert.deepEqual(TIERS.map(t => CLUE_REWARDS[t].rolls), [[2, 4], [3, 5], [4, 6]]);
  assert.deepEqual(TIERS.map(t => CLUE_REWARDS[t].rare), [84, 66, 45]);
  for (const t of TIERS) {
    const total = CLUE_REWARDS[t].items.reduce((s, i) => s + i.p, 0);
    // (a roll gives one item; hard's junk table gives three potions in one of its rolls)
    assert.ok(Math.abs(total - (t === 'hard' ? 1 + 2 * (1 / 45) * (1 / 31) * (1 / 2) * (1 / 4) : 1)) < 1e-12, `${t}: ${total}`);
    for (const i of CLUE_REWARDS[t].items) assert.ok(ITEMS[i.slug] || i.name, `${t}: ${i.slug}`);
  }
  const hard = rewardsOf('hard');
  assert.equal(hard.meanRolls, 5);
  const each = s => hard.items.find(i => i.slug === s);
  // a common item: 44/45 a roll isn't rare, then 1 of 21
  assert.ok(Math.abs(each('rune_platebody').p - (44 / 45) / 21) < 1e-12);
  assert.ok(Math.abs(each('rune_platebody').perCasket - 5 * (44 / 45) / 21) < 1e-12);
  // at least one in a casket: 4, 5 or 6 rolls, as likely each
  const p = (44 / 45) / 21;
  assert.ok(Math.abs(each('rune_platebody').casket - (1 - ((1 - p) ** 4 + (1 - p) ** 5 + (1 - p) ** 6) / 3)) < 1e-12);
  // a rare: 1/45, then 1 of 31; gilded 1 of 31, then a half, then 1 of 5
  assert.ok(Math.abs(each('rune_full_helm_trim').p - 1 / (45 * 31)) < 1e-15);
  assert.ok(Math.abs(each('rune_platebody_goldplate').p - 1 / (45 * 31 * 2 * 5)) < 1e-15);
  assert.equal(each('lobster').noted, 1);
  assert.deepEqual([each('coins').lo, each('coins').hi], [1000, 5000]);
  // 57 hard clues: about 133 rune pieces, 27 black dragonhide, 27 magic bows
  const n = 57, sum = re => hard.items.filter(i => !i.rare && re.test(i.slug)).reduce((s, i) => s + i.perCasket * n, 0);
  assert.equal(Math.round(sum(/^rune_/)), 133);
  assert.equal(Math.round(sum(/dragonhide/)), 27);
  assert.equal(Math.round(sum(/^magic_\w*bow$/)), 27);
  assert.ok(Math.abs(anyOf(hard.items.filter(i => i.rare), hard.rolls) - 0.106) < 0.002);
});

// ── The puzzle box ──
test('the puzzle box: solved, its pieces in order and the gap last; what can be solved; a slide', () => {
  assert.ok(isSolved(SOLVED) && solvable(SOLVED));
  const swapped = SOLVED.slice(); [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  assert.equal(solvable(swapped), false);
  assert.equal(solve(swapped), null);
  assert.equal(solvable([1, 2, 3]), false);
  assert.deepEqual(solve(SOLVED), []);
  assert.equal(slide(SOLVED, 0), null, 'only next to the gap');
  const s = slide(SOLVED, 23);
  assert.deepEqual([s[23], s[24]], [0, 24]);
  assert.equal(direction(s, 24), 'left');
});

test("the puzzle box: every shuffle the server makes (101 slides at random) is solved, in few moves", () => {
  let seed = 2004;
  const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const lens = [];
  for (let k = 0; k < 40; k++) {
    let s = SOLVED.slice();
    for (let m = 0; m < 101; m++) {
      const gap = s.indexOf(0);
      const next = [gap - 5, gap + 5, gap % 5 ? gap - 1 : -1, gap % 5 < 4 ? gap + 1 : -1].filter(j => j >= 0 && j < 25);
      s = slide(s, next[rnd(next.length)]);
    }
    const moves = solve(s);
    let x = s;
    for (const at of moves) { x = slide(x, at); assert.ok(x, 'each move next to the gap'); }
    assert.ok(isSolved(x));
    lens.push(moves.length);
  }
  assert.ok(Math.max(...lens) <= 60 && lens.reduce((a, b) => a + b, 0) / lens.length < 35, `moves: ${lens}`);
});

// ── Quests ──
test("the quests: the server's list, 18 free and 45 members, 135 quest points, and the two miniquests", () => {
  const quests = QUESTS.filter(q => !q.mini);
  assert.equal(quests.length, 63);
  assert.deepEqual([quests.filter(q => !q.members).length, quests.filter(q => q.members).length], [18, 45]);
  assert.equal(QUEST_POINTS, 135);
  assert.equal(quests.reduce((t, q) => t + q.qp, 0), 135);
  assert.deepEqual(QUESTS.filter(q => q.mini).map(q => q.name), ["Alfred Grimhand's Barcrawl", 'Mage Arena']);
  for (const q of QUESTS) {
    assert.ok(q.steps.length >= 2 && q.lhq && q.start && q.difficulty, q.key);
    for (const k of q.quests) assert.ok(QUEST_BY_KEY.has(k), `${q.key} needs ${k}`);
  }
  const q = k => QUEST_BY_KEY.get(k);
  assert.deepEqual(q('dragon').xp, { strength: 18650, defence: 18650 });
  assert.equal(q('dragon').needQp, 32);
  assert.deepEqual(q('legends').quests, ['crest', 'hero', 'zombiequeen', 'upass', 'waterfall']);
  assert.equal(q('legends').needQp, 107);
  assert.equal(q('legends').skills.magic, 56);
  assert.deepEqual(q('itwatchtower').xp, { magic: 15300 });
  assert.match(q('desertrescue').xpNote, /4,650 XP twice/);
});

test('what a quest takes, against your levels and your ticks', () => {
  const levels = { cooking: 60, fishing: 53, herblore: 25, mining: 49 };
  const level = sk => (levels[sk] ? { level: levels[sk], ranked: true } : { level: 1, ranked: false, range: { min: 1, max: 14 } });
  const hero = QUEST_BY_KEY.get('hero');
  let n = needsOf(hero, { level, done: new Set() });
  assert.equal(n.state, 'no');
  assert.deepEqual(n.skills.map(s => [s.sk, s.state]), [['mining', 'no'], ['herblore', 'ok'], ['cooking', 'ok'], ['fishing', 'ok']]);
  assert.deepEqual(n.qp, { need: 55, have: 0, state: 'no' });
  // every quest it needs, and 55 quest points, done: then only Mining
  const done = new Set(['blackarmgang', 'zanaris', 'arthur', 'dragon', ...QUESTS.filter(q => !q.mini && !q.members).map(q => q.key), 'druid', 'grandtree', 'tree', 'waterfall', 'itexam', 'mcannon', 'ball', 'murder', 'fluffs']);
  assert.ok(questPoints(done) >= 55, `${questPoints(done)}`);
  n = needsOf(hero, { level, done });
  assert.deepEqual([n.qp.state, n.quests.every(x => x.state === 'ok'), n.state], ['ok', true, 'no']);
  levels.mining = 50;
  assert.equal(needsOf(hero, { level, done }).state, 'ok');
  // (a skill below 15, not on the hiscores: maybe; Fletching 5 here)
  levels.ranged = 40;
  const chompy = QUEST_BY_KEY.get('chompybird');
  assert.equal(needsOf(chompy, { level, done }).state, 'maybe');
  // (no XP yet: not known)
  assert.equal(needsOf(chompy, { level: () => null, done }).state, 'maybe');
  assert.equal(needsOf(QUEST_BY_KEY.get('cook'), { level: () => null, done: new Set() }).state, 'ok');
});

// ── (v3.6.1) A casket's rewards from a screenshot ──
import { readReward, rewardItems, tiersOf, imageHash } from './cluereader.js';
import { prepareIcons } from './bankread.js';
import { STACK_FONT } from './bankread-data.js';
import { CLUE_READ } from './cluedata.js';
import { fakeReward, clueAtlas } from './cluefake.mjs';

const clueIcons = prepareIcons(clueAtlas, CLUE_READ.icons, CLUE_READ.perRow);
const readIt = img => { const r = readReward(img, clueIcons, STACK_FONT, CLUE_READ.window); return r.ok ? { r, ...rewardItems(r) } : { r }; };
const short = items => items.map(i => [i.slug, i.count, ...(i.noted ? ['noted'] : []), ...(i.alts ? [i.alts.length] : [])]);
const INV = [{ slot: 0, icon: 'coins_100', count: 120 }, { slot: 1, icon: 'lawrune', count: 7 }, { slot: 2, icon: 'rune_platebody' }, { slot: 4, icon: 'cert_lobster', count: 5 }];

test("a casket's rewards read from a screenshot of the game: each one, how many, noted or not, and the kind of clue they fit", () => {
  // the server's trail_reward.if: 3 by 2 slots of 32 pixels, its first at 243, 93 on the canvas
  assert.deepEqual(CLUE_READ.window, { cols: 3, rows: 2, pitchX: 32, pitchY: 32, x: 243, y: 93 });
  const { r, items, unknown } = readIt(fakeReward({ items: [{ icon: 'rune_platebody' }, { icon: 'coins_1000', count: 3456 }, { icon: 'cert_lobster', count: 13 }, { icon: 'lawrune', count: 42 }, { icon: 'magic_longbow' }, { icon: 'holy_book_s_page1' }], inventory: INV }));
  assert.deepEqual([r.x, r.y, unknown], [243, 93, 0]);
  assert.deepEqual(short(items), [['rune_platebody', 1], ['coins', 3456], ['lobster', 13, 'noted'], ['lawrune', 42], ['magic_longbow', 1], ['holy_book_s_page1', 1, 4]]);
  // (a book's four pages look the same: any of them)
  assert.deepEqual(items[5].alts, ['holy_book_s_page1', 'holy_book_s_page2', 'holy_book_s_page3', 'holy_book_s_page4']);
  assert.deepEqual(tiersOf(items), ['hard']);
  // (the scene behind the icons, not the scroll: found all the same)
  assert.deepEqual(short(readIt(fakeReward({ items: [{ icon: 'rune_platebody' }, { icon: 'coins_1000', count: 3456 }], scroll: false, seed: 4 })).items), [['rune_platebody', 1], ['coins', 3456]]);
  // a darker brightness setting, allowed for
  const dark = readIt(fakeReward({ items: [{ icon: 'adamant_platebody' }, { icon: 'coins_250', count: 640 }], brightness: 0.8 }));
  assert.deepEqual(short(dark.items), [['adamant_platebody', 1], ['coins', 640]]);
  assert.deepEqual(tiersOf(dark.items), ['medium']);
});

test('a screenshot cut down or bigger than the game: the window found by its icons, not the inventory\'s; and none in a picture without it', () => {
  // cut down: the window somewhere else, the inventory's items about
  const cut = readIt(fakeReward({ items: [{ icon: 'black_platebody' }, { icon: 'coins_100', count: 150 }], x: 101, y: 207, inventory: INV, width: 800, height: 520 }));
  assert.deepEqual([cut.r.x, cut.r.y], [101, 207]);
  assert.deepEqual(short(cut.items), [['black_platebody', 1], ['coins', 150]]);
  assert.deepEqual(tiersOf(cut.items), ['easy']);
  // none: just what's in the inventory, in a picture the game's size or another
  assert.deepEqual(readIt(fakeReward({ items: [], inventory: INV })).r, { ok: false, why: 'no-window' });
  assert.deepEqual(readIt(fakeReward({ items: [], inventory: INV, width: 800, height: 520 })).r, { ok: false, why: 'no-window' });
});

test('the kind of clue rewards fit: each one of its rewards (noted alike), its stack as many rolls as can add up to it, and no more rolls in all than a casket has', () => {
  const it = (slug, count = 1, more = {}) => ({ slot: 0, slug, noted: false, count, min: count, max: count, alts: null, ...more });
  assert.deepEqual(tiersOf([it('lawrune', 12), it('naturerune', 12)]), ['easy', 'medium'], 'two rolls of 5 to 10 each, or one of 10 to 20');
  assert.deepEqual(tiersOf([it('lobster', 12, { noted: true }), it('naturerune', 15)]), ['medium']);
  assert.deepEqual(tiersOf([it('lobster', 12)]), [], 'lobsters come noted');
  assert.deepEqual(tiersOf([it('coins', 850)]), ['medium']);
  assert.deepEqual(tiersOf([it('coins', 640)]), ['easy', 'medium'], 'four easy rolls of coins could make 640');
  assert.deepEqual(tiersOf([it('rune_longsword'), it('deathrune', 30)]), [], 'a hard reward and a medium one');
  // easy: 2 to 4 rolls; five things can't be
  assert.deepEqual(tiersOf(['black_platebody', 'black_platelegs', 'black_full_helm', 'black_battleaxe'].map(s => it(s))), ['easy']);
  assert.deepEqual(tiersOf(['black_platebody', 'black_platelegs', 'black_full_helm', 'black_battleaxe', 'black_longsword'].map(s => it(s))), []);
  // a page: any of the book's four
  assert.deepEqual(tiersOf([it('holy_book_z_page1', 1, { alts: ['holy_book_z_page1', 'holy_book_z_page2', 'holy_book_z_page3', 'holy_book_z_page4'] })]), ['easy', 'medium', 'hard']);
  assert.deepEqual(tiersOf([]), []);
});

test('the same screenshot hashed the same; another casket with the same rewards: the same window, not the same picture', () => {
  const opts = { items: [{ icon: 'rune_platebody' }, { icon: 'coins_1000', count: 2000 }] };
  const a = readIt(fakeReward(opts)).r, again = readIt(fakeReward(opts)).r, other = readIt(fakeReward({ ...opts, seed: 2 })).r;
  assert.equal(a.image, again.image);
  assert.equal(a.hash, other.hash);
  assert.notEqual(a.image, other.image);
  assert.notEqual(a.hash, readIt(fakeReward({ ...opts, items: [{ icon: 'rune_platebody' }, { icon: 'coins_1000', count: 2001 }] })).r.hash);
  assert.match(imageHash({ width: 2, height: 1, data: new Uint8Array(8) }), /^2x1:\w+$/);
});
