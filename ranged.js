// Ranged ammo (v3.4): the shots a kill takes and the ammo a plan's kills use, by the server's own sums.
// gamedata.js's RANGED_GEAR has what they're counted with; build-data.mjs reads it all from the server's
// scripts and configs (LostCityRS/Content, rev 274), and says where:
//   effective Ranged = your level (no prayer for it) + 8 + the style's bonus (Accurate 3)
//   your attack roll = effective × (Ranged attack bonus + 64)
//   your max hit = (effective × (Ranged strength + 64) + 320) / 640, rounded down
//   a monster's defence roll = (its Defence + 9) × (its ranged defence + 64)
//   a shot hits when randominc(your attack roll) > randominc(its defence roll), each a whole number from 0
//   to the roll, every one as likely; a hit does randominc(max hit), 0 to the max hit, and a kill is the
//   monster's hitpoints in damage (a hit does no more than it has left)
//   every shot uses one piece of ammo, hit or miss: 1 in RANGED_GEAR.breaks breaks, the rest drop where the
//   monster stands (to pick up)
import { RANGED_GEAR } from './gamedata.js';
import { levelForXp10, xp10ForLevel } from './planner.js';

const G = RANGED_GEAR;
export const AMMO_KINDS = ['arrows', 'knives', 'darts'];
export const BREAKS = G.breaks;

export const effectiveRanged = (level, style) => Math.floor(level) + 8 + (G.styleBonus[style] ?? 0);
export const attackRoll = (level, style, attackBonus) => effectiveRanged(level, style) * (attackBonus + 64);
export const maxHitOf = (level, style, strengthBonus) => Math.floor((effectiveRanged(level, style) * (strengthBonus + 64) + 320) / 640);
export const defenceRoll = (defence, rangeDefence = 0) => (defence + 9) * (rangeDefence + 64);

// The chance randominc(a) > randominc(d).
export function hitChance(a, d) {
  a = Math.max(0, Math.floor(a));
  d = Math.max(0, Math.floor(d));
  return a > d ? 1 - (d + 2) / (2 * (a + 1)) : a / (2 * (d + 1));
}

// The shots a kill takes on average: a shot hits with chance p, and a hit does 0 to max damage, each as
// likely; the kill is hp damage. With E(h) the shots still to come at h hitpoints left,
// E(h) = 1 + Σ chance(damage k) × E(h − k), nothing more past 0: worked out from 1 hitpoint left upward.
// Infinity: it can't be done (no chance to hit, or no damage).
export function shotsToKill(hp, p, max) {
  hp = Math.floor(hp);
  if (hp <= 0) return 0;
  if (!(p > 0) || !(max > 0)) return Infinity;
  const each = p / (max + 1);                  // the chance of each of 0 … max on a shot that hits
  const harm = each * max;                     // the chance a shot does any damage
  const E = new Float64Array(hp + 1);
  let sum = 0;                                 // E(h − 1) + … + E(h − max), from 1 hitpoint left
  for (let h = 1; h <= hp; h++) {
    if (h >= 2) sum += E[h - 1];
    if (h - max - 1 >= 1) sum -= E[h - max - 1];
    E[h] = (1 + each * sum) / harm;
  }
  return E[hp];
}

// What you shoot with. kind: arrows (from a bow), knives or darts; ammo, bow: their item ids.
// → { kind, ammo, bow, attack (Ranged attack bonus), strength (Ranged strength), level (the Ranged level
// what you wield needs), rate (ticks a shot), fits (the bow fires those arrows), needBow (the levelrequire
// a bow needs for them) } or null.
export function gearOf({ kind, ammo, bow }) {
  if (kind === 'arrows') {
    const a = G.arrows.find(x => x.id === ammo), b = G.bows.find(x => x.id === bow);
    if (!a || !b) return null;
    return { kind, ammo: a.id, bow: b.id, attack: b.attack, strength: a.strength, level: b.level, rate: b.rate, fits: b.level >= a.bow, needBow: a.bow };
  }
  const t = (G[kind] || []).find(x => x.id === ammo);
  if (!t) return null;
  return { kind, ammo: t.id, bow: null, attack: t.attack, strength: t.strength, level: t.level, rate: t.rate, fits: true, needBow: null };
}

// The strongest arrows a bow fires.
export function bestArrowsFor(bowId) {
  const bow = G.bows.find(b => b.id === bowId) || G.bows[0];
  return (G.arrows.filter(a => a.bow <= bow.level).sort((x, y) => y.strength - x.strength)[0] || G.arrows[0]).id;
}

// The best of a kind your Ranged level can use: the bow with the most attack you can wield (a shortbow before
// a longbow of the same: they shoot as hard, the shortbow more often) and the strongest arrows it fires, or the
// strongest knife or dart you can wield.
export function bestGear(kind, level) {
  if (kind === 'arrows') {
    const bow = G.bows.filter(b => b.level <= level).sort((x, y) => y.attack - x.attack || (x.long ?? 0) - (y.long ?? 0))[0] || G.bows[0];
    return gearOf({ kind, ammo: bestArrowsFor(bow.id), bow: bow.id });
  }
  const list = G[kind] || G.knives;
  const t = list.filter(x => x.level <= level).sort((x, y) => y.strength - x.strength || y.attack - x.attack)[0] || list[0];
  return gearOf({ kind: AMMO_KINDS.includes(kind) ? kind : 'knives', ammo: t.id });
}

// One kill of a monster at a Ranged level: { hit (the chance a shot hits), max (max hit), attack, defence
// (the two rolls), shots (on average) }. mon: { id, hp, defence, rangeDefence }; bonus: what the rest of your
// gear adds to your Ranged attack bonus.
export function killAt(mon, level, { style, gear, bonus = 0 }) {
  const attack = attackRoll(level, style, gear.attack + bonus);
  const defence = defenceRoll(mon.defence, mon.rangeDefence);
  const cap = G.capped?.[mon.id];
  const max = Math.min(maxHitOf(level, style, gear.strength), cap ?? Infinity);
  const hit = hitChance(attack, defence);
  return { hit, max, attack, defence, shots: shotsToKill(mon.hp, hit, max), capped: cap != null };
}

// The shots a plan's kills take, done in order from startXp10 (your Ranged XP): steps [{ mon, kills, xp10 (the
// Ranged XP a kill gives) }]. Your level rises as they're done, and each level's kills count at that level.
// → { shots, steps: [{ shots, first, last (a kill's shots at the first and last level it's done at), from,
// to (those levels) }] }; shots is Infinity if a step can't be done.
export function shotsFor(steps, { startXp10, style, gear, bonus = 0 }) {
  let xp = Math.max(0, startXp10 || 0), total = 0;
  const memo = new Map();
  const at = (mon, level) => {
    const k = `${mon.id}:${level}`;
    if (!memo.has(k)) memo.set(k, killAt(mon, level, { style, gear, bonus }).shots);
    return memo.get(k);
  };
  const out = steps.map(({ mon, kills, xp10 }) => {
    let left = Math.max(0, kills), shots = 0, first = null, last = null, from = null, to = null;
    while (left > 0) {
      const level = levelForXp10(xp);
      const next = level >= 99 || !(xp10 > 0) ? Infinity : xp10ForLevel(level + 1);
      const toNext = (next - xp) / xp10;
      const here = Math.min(left, toNext);
      const each = at(mon, level);
      first ??= each; from ??= level;
      last = each; to = level;
      shots += here * each;
      if (here >= toNext) { xp = next; left -= toNext; } else { xp += here * xp10; left = 0; }
    }
    total += shots;
    return { shots, first, last, from, to };
  });
  return { shots: total, steps: out };
}

// What a plan's shots come to in ammo: all of it fired, and lost: 1 in BREAKS when you pick up the rest,
// all of it when you don't.
export const ammoLost = (shots, pickUp = true) => (pickUp ? shots / BREAKS : shots);
