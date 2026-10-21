// The loot of kills (loot.js): drop chances and amounts against the tables by
// hand, and against a simulation of kills that rolls the tables the way the
// server's scripts do. Run with:  node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { DROP_TABLES, SHARED_DROPS, NPC_INFO } from './npcdata.js';
import { killDrops, killValue, killXp, atLeastOne, dryChance, killsFor, luck, binomCdf, rateText, styleOfSkillGoal, MONSTER_BY_ID, CLEAN_HERBS, xpGained, killsXp, killsFromHp, leftOver } from './loot.js';
import { cheapestLevels, xpForLevel } from './skills.js';

const close = (a, b, tol = 1e-12, what = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${what} ${a} vs ${b}`);

test('loot: a fire giant, by hand from its table (the server\'s fire_giant.rs2)', () => {
  const d = killDrops('fire_giant_86');
  // always big bones; a rune scimitar 1/128 and nothing else gives one
  assert.deepEqual([d.get('big_bones').p, d.get('big_bones').q], [1, 1]);
  close(d.get('rune_scimitar').p, 1 / 128);
  assert.equal(rateText(d.get('rune_scimitar').p), '1/128');
  assert.equal(rateText(d.get('steel_axe').p), '3/128');
  assert.equal(d.get('rune_scimitar').one, 1);
  // fire runes: 150 on 10 rows, 37 on 1: amounts differ, so no one amount
  close(d.get('firerune').q, (10 * 150 + 37) / 128);
  close(d.get('firerune').p, 11 / 128);
  assert.equal(d.get('firerune').one, null);
  // the herb table, 19 rows of 128, every roll of it a herb (in a members world): one Unid herb entry
  close(d.get('unidentified_guam').p, 19 / 128);
  close(d.get('unidentified_guam').q, 19 / 128);
  // coins: the main table's, and the rare drop table's 3,000 (21 rows of its 128, on 1 row of 128)
  close(d.get('coins').q, (40 * 60 + 7 * 15 + 6 * 25 + 2 * 300 + 1 * 50) / 128 + (1 / 128) * (21 / 128) * 3000);
  // no clue from fire giants
  assert.equal(d.has('clue_scroll_hard'), false);
  // XP a kill: 4 a point of damage to the style's skill, 1.33 to Hitpoints, in tenths
  assert.deepEqual(killXp('fire_giant_86', 'accurate'), { attack: 4440, hitpoints: 1476 });
  assert.deepEqual(killXp('fire_giant_86', 'controlled'), { attack: 1476, strength: 1476, defence: 1476, hitpoints: 1476 });
  assert.deepEqual(killXp('fire_giant_86', 'longrange'), { ranged: 2220, defence: 2220, hitpoints: 1476 });
  assert.deepEqual(killXp('fire_giant_86', 'magic'), { magic: 2220, hitpoints: 1476 });
});

test('loot: the gem table, with and without a ring of wealth and Legends\' Quest; under ground a chaos talisman', () => {
  // A fire giant's gem table row is 11/128; the rare drop table (1/128) has it on 20 of its 128 rows too.
  const viaGems = 11 / 128 + (1 / 128) * (20 / 128);
  const plain = killDrops('fire_giant_86');
  close(plain.get('uncut_sapphire').p, viaGems * 32 / 128);
  const ring = killDrops('fire_giant_86', { ring: true });
  close(ring.get('uncut_sapphire').p, viaGems * 32 / 65);
  // the dragon spear: the mega rare table (3/128), from the rare drop table (15/128), and with Legends' Quest from the gem table (1/128) too
  const viaRare = (1 / 128) * (15 / 128);
  close(plain.get('dragon_spear').p, viaRare * 3 / 128);
  const legends = killDrops('fire_giant_86', { legends: true });
  close(legends.get('dragon_spear').p, (viaRare + viaGems * 1 / 128) * 3 / 128, 1e-9);
  // fire giants are mostly under ground: the gem table's talisman is a chaos talisman there
  assert.equal(NPC_INFO.fire_giant_86.under, 1);
  assert.ok(plain.has('chaos_talisman') && !plain.has('nature_talisman'));
  assert.ok(!killDrops('man_2').has('chaos_talisman') || killDrops('man_2').has('nature_talisman'));
});

test('loot: a chaos druid can drop two herbs at once (a row of the server\'s with two rolls), and a man an easy clue', () => {
  const d = killDrops('chaos_druid_13');
  close(d.get('unidentified_guam').p, (35 + 11) / 128);
  close(d.get('unidentified_guam').q, (35 + 2 * 11) / 128);
  const man = killDrops('man_2');
  close(man.get('clue_scroll_easy').p, 1 / 128);
  assert.equal(rateText(man.get('clue_scroll_easy').p), '1/128');
  // bolts: 2 to 12 on 22 rows of 128, each count as likely
  close(man.get('bolt').q, (22 / 128) * 7);
});

test('loot: over many kills: at least one, going dry, the kills it takes', () => {
  const p = 1 / 128;
  close(dryChance(p, 200), Math.pow(127 / 128, 200));
  assert.ok(Math.abs(dryChance(p, 200) - 0.2084) < 5e-4);
  close(atLeastOne(p, 200), 1 - Math.pow(127 / 128, 200));
  assert.equal(killsFor(p, 0.5), 89);
  assert.equal(killsFor(p, 0.9), 294);
  assert.equal(atLeastOne(1, 1), 1);
  assert.equal(dryChance(1, 3), 0);
});

test('loot: luck: drops counted exactly (binomial) where every drop is the same amount', () => {
  const d = killDrops('fire_giant_86').get('rune_scimitar');
  const l = luck(d, 1280, 7);
  assert.equal(l.drops, true);
  assert.equal(l.count, 7);
  close(l.expectedDrops, 10);
  // P(fewer than 7) and P(more than 7) of Binomial(1280, 1/128), summed directly
  let fewer = 0, more = 0;
  const C = (n, k) => { let c = 1; for (let i = 1; i <= k; i++) c = (c * (n - i + 1)) / i; return c; };
  for (let k = 0; k <= 30; k++) { const pk = C(1280, k) * Math.pow(1 / 128, k) * Math.pow(127 / 128, 1280 - k); if (k < 7) fewer += pk; if (k > 7) more += pk; }
  close(l.fewer, fewer, 1e-9);
  close(l.more, more, 1e-6);
  close(binomCdf(0, 200, 1 / 128), Math.pow(127 / 128, 200), 1e-12);
  // stackable drops of varying amounts: a normal curve on the total
  const f = killDrops('fire_giant_86').get('firerune');
  const lf = luck(f, 1000, f.q * 1000);
  assert.equal(lf.drops, false);
  assert.ok(lf.fewer > 0.45 && lf.fewer < 0.5 && lf.more > 0.45 && lf.more < 0.5, JSON.stringify(lf));
});

test('loot: XP a kill keeps the server\'s own rules (the Titan\'s flat XP, Chronozon\'s 2.5%), and a battle mage only takes Magic', () => {
  assert.deepEqual(killXp('black_knight_titan_120', 'accurate'), { attack: 1420, hitpoints: 1888 });
  assert.equal(killXp('battle_mage_54', 'accurate'), null);
  assert.ok(killXp('battle_mage_54', 'magic').magic > 0);
  assert.equal(styleOfSkillGoal('ranged', undefined), 'rapid');
  assert.equal(styleOfSkillGoal('defence', 'longrange'), 'longrange');
  assert.equal(styleOfSkillGoal('strength', 'controlled'), 'controlled');
});

test('loot: every monster: its rows come to its table\'s total, chances between 0 and 1, and a kill is worth something at alch prices', () => {
  const alch = slug => null;
  let n = 0;
  for (const id of Object.keys(NPC_INFO)) {
    for (const opts of [{}, { ring: true, legends: true }]) {
      const d = killDrops(id, opts);
      for (const [slug, x] of d) {
        assert.ok(x.p > 0 && x.p <= 1 + 1e-12, `${id} ${slug} p ${x.p}`);
        assert.ok(x.q >= x.p - 1e-12, `${id} ${slug}: q ${x.q} under p ${x.p}`);
        assert.ok(x.m2 >= x.q * x.q - 1e-9, `${id} ${slug}: m2`);
      }
      assert.deepEqual(killValue(d, alch).missing.length, d.size);
      n++;
    }
    assert.ok(MONSTER_BY_ID.has(id));
  }
  assert.ok(n >= 600);
});

// ── A simulation: kills rolled the way the server's scripts roll them ──────
// (a seeded generator, so a failure can be run again)
function sim(id, kills, seed, opts = {}) {
  let s = seed;
  const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const info = NPC_INFO[id], t = DROP_TABLES[info.drops];
  const shared = name => { const x = SHARED_DROPS[name]; return x.variants ? x.variants[[opts.ring && 'ring', opts.legends && 'legends', info.under && 'under'].filter(Boolean).join(',')] : x; };
  const bank = (slug, from) => (from === 'randomherb' ? SHARED_DROPS.randomherb.bank : slug);
  const totals = new Map(), any = new Map();
  const give = (got, e, from) => {
    if (e[0].startsWith('~')) { roll(got, shared(e[0].slice(1)), e[0].slice(1)); return; }
    const n = Array.isArray(e[1]) ? e[1][0] + Math.floor(rnd() * (e[1][1] - e[1][0] + 1)) : e[1];
    const k = bank(e[0], from);
    got.set(k, (got.get(k) || 0) + n);
  };
  const roll = (got, table, from) => {
    let r = Math.floor(rnd() * table.of);
    for (const [w, entries] of table.rows) { if (r < w) { for (const e of entries) give(got, e, from); return; } r -= w; }
    throw new Error('ran off the table');
  };
  for (let i = 0; i < kills; i++) {
    const got = new Map();
    for (const e of t.always || []) give(got, e, 'always');
    if (t.rows) roll(got, t, 'main');
    if (t.clue && Math.floor(rnd() * t.clue[1]) === 0) got.set(`clue_scroll_${t.clue[0]}`, 1);
    for (const [k, n] of got) { totals.set(k, (totals.get(k) || 0) + n); if (n > 0) any.set(k, (any.get(k) || 0) + 1); }
  }
  return { totals, any };
}

test('loot: a simulation of 200,000 kills each agrees with the sums (fire giant, chaos druid, man, black dragon, Kalphite Queen; ring and Legends\' Quest)', () => {
  const kills = 200000;
  let checked = 0;
  for (const [id, opts] of [['fire_giant_86', {}], ['chaos_druid_13', {}], ['man_2', {}], ['black_dragon_227', { ring: true, legends: true }], ['kalphite_queen_333', {}], ['giant_28', { ring: true }]]) {
    const d = killDrops(id, opts);
    const { totals, any } = sim(id, kills, 7 + checked, opts);
    for (const [slug, x] of d) {
      // the mean of a kill's amount, within 5 standard errors; the chance of any, likewise
      const sdMean = Math.sqrt(Math.max(1e-12, x.m2 - x.q * x.q) / kills);
      const mean = (totals.get(slug) || 0) / kills;
      assert.ok(Math.abs(mean - x.q) <= 5 * sdMean + 1e-9, `${id} ${slug}: simulated ${mean}, worked out ${x.q} (sd ${sdMean})`);
      const sdP = Math.sqrt(x.p * (1 - x.p) / kills);
      const pp = (any.get(slug) || 0) / kills;
      assert.ok(Math.abs(pp - x.p) <= 5 * sdP + 1e-9, `${id} ${slug}: simulated chance ${pp}, worked out ${x.p}`);
    }
    for (const slug of totals.keys()) assert.ok(d.has(slug), `${id}: the simulation dropped ${slug}, which the sums don't list`);
    checked++;
  }
  assert.equal(checked, 6);
});

// ── How the NPC views say it (npc-ui.js) ─────────────────────────────────
test('loot: dryness in words: the drop rate, and how many players go that dry (Ostap\'s 1/128 and 200 kills)', async () => {
  const { drySentence, chanceText, oneIn, monsterOfMethod } = await import('./npc-ui.js');
  assert.equal(drySentence('Rune scimitar', 1 / 128, 200), 'Rune scimitar: 200 kills without one is 1.56 × the drop rate (1/128). Going this dry happens to 21% of players (about 1 in 4.8).');
  assert.equal(drySentence('Rune scimitar', 1 / 128, 128), 'Rune scimitar: 128 kills without one is 1 × the drop rate (1/128). Going this dry happens to 37% of players (about 1 in 2.7).');
  assert.equal(drySentence('Big bones', 1, 10), '', 'nothing to say of what every kill drops');
  // small and large chances keep their digits; nothing is said to be impossible
  assert.deepEqual([chanceText(0.2084), chanceText(0.05), chanceText(0.0043), chanceText(1e-14), chanceText(0.99999998), chanceText(0.9996)], ['21%', '5%', '0.43%', 'under 0.0001%', '99.999998%', '99.96%']);
  assert.deepEqual([oneIn(0.2084), oneIn(0.0043), oneIn(0.6)], ['about 1 in 4.8', 'about 1 in 233', null]);
  assert.deepEqual(['at_fire_giant_86', 'rg_man_2', 'hp_kalphite_queen_333', 'cr_gold_ring'].map(monsterOfMethod), ['fire_giant_86', 'man_2', 'kalphite_queen_333', null]);
});

test('loot (v3.1): herbs cleaned: each herb its own chance, the herb table\'s weights; grimy, the one Unid herb as before', () => {
  const grimy = killDrops('fire_giant_86');
  const clean = killDrops('fire_giant_86', { herbs: 'clean' });
  assert.equal(clean.has('unidentified_guam'), false);
  // the fire giant rolls the herb table on 19 rows of its 128 (and a herb is always what that table gives)
  const t = SHARED_DROPS.randomherb;
  let sum = 0;
  for (const [w, [[unid]]] of t.rows) {
    const c = t.clean[unid];
    close(clean.get(c.herb).p, (19 / 128) * (w / t.of), 1e-12, c.herb);
    sum += clean.get(c.herb).q;
  }
  close(sum, grimy.get('unidentified_guam').q);
  close(clean.get('ranarr_weed').p, (19 / 128) * (11 / 128));
  assert.equal(rateText(clean.get('ranarr_weed').p), '209/16,384');
  // what identifying takes and gives: the server's params (Guam leaf: level 3, the default; Ranarr 25)
  assert.deepEqual(CLEAN_HERBS.get('guam_leaf'), { unid: 'unidentified_guam', level: 3, xp: 25 });
  assert.equal(CLEAN_HERBS.get('ranarr_weed').unid, 'unidentified_ranarr');
  assert.ok(CLEAN_HERBS.get('ranarr_weed').level > CLEAN_HERBS.get('guam_leaf').level);
  assert.equal(CLEAN_HERBS.size, 11);
  // everything else is the same either way
  for (const [slug, d] of grimy) if (slug !== 'unidentified_guam') { close(clean.get(slug).q, d.q); close(clean.get(slug).p, d.p); }
  // a chaos druid's row of two herb rolls: two of one herb can come from it
  const druid = killDrops('chaos_druid_13', { herbs: 'clean' });
  const g = druid.get('guam_leaf');
  close(g.q, (35 / 128 + 2 * 11 / 128) * (32 / 128));
  assert.equal(g.one, 1);
});

test('loot (v3.1): kills from XP: Hitpoints XP over a kill\'s, whatever the style; what\'s left once kills are counted', () => {
  // 100 fire giants in Accurate: +44,400 Attack and +14,760 Hitpoints XP (in tenths)
  const mark = { attack: 6000000, strength: 1000, defence: 2000, hitpoints: 9000000, ranged: 0, magic: 300 };
  const now = { ...mark, attack: mark.attack + 444000, hitpoints: mark.hitpoints + 147600 };
  assert.deepEqual(xpGained(mark, now), { attack: 444000, hitpoints: 147600 });
  assert.deepEqual(xpGained(mark, { ...now, ranged: 0, magic: 100 }), { attack: 444000, hitpoints: 147600 });     // (nothing that went down)
  assert.equal(killsFromHp('fire_giant_86', 'accurate', 147600), 100);
  assert.equal(killsFromHp('fire_giant_86', 'magic', 147600), 100);              // (any style: 1.33 a point of damage)
  assert.equal(killsFromHp('fire_giant_86', 'accurate', 147600 + 700), 100);      // (to the nearest)
  assert.deepEqual(killsXp([{ npc: 'fire_giant_86', style: 'accurate', kills: 100 }]), { attack: 444000, hitpoints: 147600 });
  // 100 greater demons and 100 blue dragons in one session: what each is, and nothing left
  const rows = [{ npc: 'greater_demon_92', style: 'aggressive', kills: 100 }, { npc: 'blue_dragon_111', style: 'aggressive', kills: 100 }];
  const xp = killsXp(rows);
  const gd = killXp('greater_demon_92', 'aggressive'), bd = killXp('blue_dragon_111', 'aggressive');
  assert.equal(xp.strength, 100 * (gd.strength + bd.strength));
  assert.equal(xp.hitpoints, 100 * (gd.hitpoints + bd.hitpoints));
  assert.deepEqual(leftOver(xp, rows), {});
  // counted as fire giants that weren't: all of it left over, and the kills' XP short
  assert.deepEqual(leftOver({ strength: xp.strength, hitpoints: xp.hitpoints }, [{ npc: 'fire_giant_86', style: 'accurate', kills: 10 }]),
    { strength: xp.strength, hitpoints: xp.hitpoints - 14760, attack: -44400 });
});

test('skills (v3.1): the least XP for some more levels: always the closest level, which is the least there is', () => {
  // Agility from 10 XP (level 1) to level 6: 512 XP; Magic 89 and Attack 99 far behind
  const r = cheapestLevels({ attack: 130344310, agility: 100, magic: 4470850 }, 5);
  assert.deepEqual(r.bySkill, [{ skill: 'agility', from: 1, to: 6, xp10: (xpForLevel(6) - 10) * 10 }]);
  assert.equal(r.levels, 5);
  // 99 stops a skill; with too few skills to go, it says how many it found
  assert.equal(cheapestLevels({ attack: 130344310 }, 3).levels, 0);
  // by brute force on small cases: no other choice of levels is cheaper
  const xp10 = { a: 10 * xpForLevel(20) + 3000, b: 10 * xpForLevel(25), c: 10 * xpForLevel(18) + 15000 };
  for (let n = 1; n <= 12; n++) {
    const got = cheapestLevels(xp10, n).xp10;
    let best = Infinity;
    const cost = (k, m) => { const lv = Math.floor(Math.max(...[...Array(100).keys()].filter(L => L <= 99 && xpForLevel(L) * 10 <= xp10[k]))); return m ? (xpForLevel(lv + m) * 10 - xp10[k]) : 0; };
    for (let i = 0; i <= n; i++) for (let j = 0; i + j <= n; j++) best = Math.min(best, cost('a', i) + cost('b', j) + cost('c', n - i - j));
    assert.equal(got, best, `${n} levels`);
  }
});
