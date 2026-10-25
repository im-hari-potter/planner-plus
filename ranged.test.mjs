// v3.4: Ranged ammo: the server's sums for a shot, and what a plan's kills take.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hitChance, shotsToKill, attackRoll, maxHitOf, defenceRoll, effectiveRanged, gearOf, bestGear, killAt, shotsFor, ammoLost, BREAKS } from './ranged.js';
import { RANGED_GEAR } from './gamedata.js';
import { xp10ForLevel } from './planner.js';

test('the hit chance is the chance randominc(attack) beats randominc(defence), every pair of rolls counted', () => {
  for (let a = 0; a <= 40; a++) {
    for (let d = 0; d <= 40; d++) {
      let wins = 0;
      for (let x = 0; x <= a; x++) for (let y = 0; y <= d; y++) if (x > y) wins++;
      assert.ok(Math.abs(hitChance(a, d) - wins / ((a + 1) * (d + 1))) < 1e-12, `${a} against ${d}`);
    }
  }
});

test('shots to a kill: the same as working out the chain of hitpoints left the long way', () => {
  // E(h) = 1 + Σ_k chance(k) E(h − k), solved for E(h) directly, every term written out
  const slow = (hp, p, max) => {
    const E = [0];
    for (let h = 1; h <= hp; h++) {
      const each = p / (max + 1);
      let rest = 0;
      for (let k = 1; k <= max; k++) rest += each * (h - k > 0 ? E[h - k] : 0);
      const stay = 1 - p + each;                 // a miss, or a hit of 0
      E[h] = (1 + rest) / (1 - stay);
    }
    return E[hp];
  };
  for (const [hp, p, max] of [[1, 1, 1], [3, 0.5, 2], [60, 0.92, 17], [111, 0.4, 24], [7, 0.13, 1], [255, 0.77, 30], [50, 1, 50]]) {
    assert.ok(Math.abs(shotsToKill(hp, p, max) - slow(hp, p, max)) < 1e-9 * slow(hp, p, max), `${hp} hp, ${p}, max ${max}`);
  }
  // one hitpoint, a sure hit of 0 or 1: two shots on average
  assert.equal(shotsToKill(1, 1, 1), 2);
  assert.equal(shotsToKill(0, 0.5, 3), 0);
  assert.equal(shotsToKill(10, 0, 5), Infinity, 'never hits');
  assert.equal(shotsToKill(10, 0.5, 0), Infinity, 'hits for nothing');
});

test("a shot's numbers as the server works them out: effective Ranged, the two rolls and the max hit", () => {
  assert.deepEqual(RANGED_GEAR.styleBonus, { accurate: 3, longrange: 0, rapid: 0 });
  assert.equal(effectiveRanged(90, 'rapid'), 98);
  assert.equal(effectiveRanged(90, 'accurate'), 101);
  // a magic shortbow (+69) at Ranged 90 on Rapid: 98 × 133
  assert.equal(attackRoll(90, 'rapid', 69), 13034);
  // rune arrows (49 Ranged strength): (98 × 113 + 320) / 640 = 17.8, so 17; on Accurate (101 × 113 + 320) / 640 = 18.3
  assert.equal(maxHitOf(90, 'rapid', 49), 17);
  assert.equal(maxHitOf(90, 'accurate', 49), 18);
  assert.equal(maxHitOf(1, 'rapid', 7), 1, 'bronze arrows at level 1: (9 × 71 + 320) / 640');
  // a monster with Defence 65 and no ranged defence: 74 × 64; a chicken's −42: 10 × 22
  assert.equal(defenceRoll(65, 0), 4736);
  assert.equal(defenceRoll(1, -42), 220);
  assert.equal(BREAKS, 5);
  assert.equal(ammoLost(1000), 200, '1 in 5 breaks when you pick up the rest');
  assert.equal(ammoLost(1000, false), 1000, 'all of it when you don\'t');
});

test('what you shoot with: arrows from a bow that fires them, knives and darts; the best for a level', () => {
  assert.deepEqual(gearOf({ kind: 'arrows', ammo: 'rune_arrow', bow: 'magic_shortbow' }),
    { kind: 'arrows', ammo: 'rune_arrow', bow: 'magic_shortbow', attack: 69, strength: 49, level: 50, rate: 4, fits: true, needBow: 40 });
  assert.equal(gearOf({ kind: 'arrows', ammo: 'rune_arrow', bow: 'maple_shortbow' }).fits, false, 'rune arrows need a bow for Ranged 40');
  assert.equal(gearOf({ kind: 'arrows', ammo: 'adamant_arrow', bow: 'maple_longbow' }).rate, 6);
  assert.deepEqual(gearOf({ kind: 'knives', ammo: 'rune_knife' }), { kind: 'knives', ammo: 'rune_knife', bow: null, attack: 25, strength: 24, level: 40, rate: 3, fits: true, needBow: null });
  assert.equal(gearOf({ kind: 'darts', ammo: 'black_dart' }).level, 10);
  assert.equal(gearOf({ kind: 'arrows', ammo: 'rune_dart', bow: 'shortbow' }), null);
  const pick = (kind, level) => { const g = bestGear(kind, level); return [g.bow, g.ammo]; };
  assert.deepEqual(pick('arrows', 1), ['shortbow', 'iron_arrow']);
  assert.deepEqual(pick('arrows', 35), ['maple_shortbow', 'adamant_arrow']);
  assert.deepEqual(pick('arrows', 45), ['yew_shortbow', 'rune_arrow']);
  assert.deepEqual(pick('arrows', 90), ['magic_shortbow', 'rune_arrow']);
  assert.deepEqual(pick('knives', 9), [null, 'steel_knife']);
  assert.deepEqual(pick('knives', 10), [null, 'black_knife']);
  assert.deepEqual(pick('darts', 99), [null, 'rune_dart']);
  // no fire arrows, no poisoned ones: they shoot as the plain ones
  assert.deepEqual(RANGED_GEAR.arrows.map(a => a.id), ['bronze_arrow', 'iron_arrow', 'steel_arrow', 'mithril_arrow', 'adamant_arrow', 'rune_arrow']);
});

test('a kill at a level, and a monster Ranged does no damage to', () => {
  const giant = { id: 'fire_giant_86', hp: 111, defence: 65, rangeDefence: 0 };
  const gear = gearOf({ kind: 'arrows', ammo: 'rune_arrow', bow: 'magic_shortbow' });
  const k = killAt(giant, 90, { style: 'rapid', gear });
  assert.equal(k.attack, 13034);
  assert.equal(k.defence, 4736);
  assert.equal(k.max, 17);
  assert.ok(Math.abs(k.hit - (1 - 4738 / 26070)) < 1e-12);
  assert.ok(Math.abs(k.shots - shotsToKill(111, k.hit, 17)) < 1e-9);
  // your armour's Ranged attack bonus counts in the roll (a green dragonhide body, chaps and vambraces: +31)
  assert.equal(killAt(giant, 90, { style: 'rapid', gear, bonus: 31 }).attack, 98 * (69 + 31 + 64));
  // Salarin the twisted: a hit on him does no more than 0 (max_dealt)
  const salarin = killAt({ id: 'salarin_the_twisted_70', hp: 70, defence: 70, rangeDefence: 0 }, 90, { style: 'rapid', gear });
  assert.deepEqual([salarin.max, salarin.shots, salarin.capped], [0, Infinity, true]);
});

test("a plan's kills: each level's at that level, your Ranged rising as they're done", () => {
  const mon = { id: 'man_2', hp: 7, defence: 1, rangeDefence: 0 };
  const gear = gearOf({ kind: 'darts', ammo: 'bronze_dart' });
  // from level 1: a kill gives 28 Ranged XP (280 tenths); level 2 is at 83 XP: 830 / 280 kills at level 1
  const at = level => killAt(mon, level, { style: 'rapid', gear }).shots;
  const r = shotsFor([{ mon, kills: 10, xp10: 280 }], { startXp10: 0, style: 'rapid', gear });
  let xp = 0, left = 10, want = 0;
  for (let level = 1; left > 0; level++) {
    const toNext = (xp10ForLevel(level + 1) - xp) / 280, here = Math.min(left, toNext);
    want += here * at(level);
    left -= here; xp += here * 280;
  }
  assert.ok(Math.abs(r.shots - want) < 1e-9, `${r.shots} vs ${want}`);
  // (280 XP: level 4 is at 276)
  assert.deepEqual([r.steps[0].from, r.steps[0].to], [1, 4]);
  assert.equal(r.steps[0].first, at(1));
  assert.equal(r.steps[0].last, at(4));
  // two monsters in a row: the second starts where the first left off
  const two = shotsFor([{ mon, kills: 3, xp10: 280 }, { mon, kills: 7, xp10: 280 }], { startXp10: 0, style: 'rapid', gear });
  assert.ok(Math.abs(two.shots - r.shots) < 1e-9);
  assert.equal(two.steps[1].from, 2);
  // a kill that gives no Ranged XP keeps you where you are; one that can't be done is Infinity
  assert.equal(shotsFor([{ mon, kills: 4, xp10: 0 }], { startXp10: xp10ForLevel(50), style: 'rapid', gear }).shots, 4 * at(50));
  assert.equal(shotsFor([{ mon: { id: 'salarin_the_twisted_70', hp: 70, defence: 70, rangeDefence: 0 }, kills: 1, xp10: 2800 }], { startXp10: 0, style: 'rapid', gear }).shots, Infinity);
  // at 99 the level stays
  const top = shotsFor([{ mon, kills: 1000, xp10: 280 }], { startXp10: xp10ForLevel(99), style: 'rapid', gear });
  assert.equal(top.shots, 1000 * at(99));
});
