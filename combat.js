// A fight (v3.5), by Lost City's server's own sums: geardata.js and npcdata.js have what they're counted with,
// and build-gear.mjs reads each from the server's scripts and says where. Every attack is two rolls:
// randominc(your attack roll) > randominc(the other's defence roll) hits, and a hit does randominc(max hit),
// 0 to the max, each as likely.
//   effective level = ⌊level × prayer / 100⌋ (a boost first: stat_boost) + 8 + the style's bonus
//   attack roll = effective level × (attack bonus of the style's type + 64)
//   max hit = ⌊(effective Strength (or Ranged) × (strength bonus + 64) + 320) / 640⌋; a spell's its own
//   a monster: (its level + 9) × (its bonus + 64), its max hit the same way, its spells their own
//   your magic defence: ⌊(7 × Magic + 3 × ⌊Defence × prayer⌋) / 10⌋ + 8
// A setup: { slots: { head: item, … }, mode (the weapon's style, an index), spell, prayers: { attack, strength,
// defence, protect } (ids), potions: [ids], antifire, levels: { attack, strength, defence, hitpoints, ranged,
// magic, prayer } }.
import { EQUIPMENT, WEAPON_STYLES, PRAYERS, POTIONS, COMBAT_SPELLS, RULES, BONUSES } from './geardata.js';
import { NPC_INFO } from './npcdata.js';

export const SLOTS = RULES.slots;
export const TYPES = ['stab', 'slash', 'crush', 'ranged', 'magic'];
const PRAYER = new Map(PRAYERS.map(p => [p.id, p]));
const POTION = new Map(POTIONS.map(p => [p.id, p]));
export const SPELL = new Map(COMBAT_SPELLS.map(s => [s.id, s]));
const UNARMED = { s: 'weapon', w: 'unarmed', r: 4 };
const ANTI_DRAGON = 'antidragonbreathshield';

// ── What you wear ────────────────────────────────────────────────────────────
export const weaponOf = slots => EQUIPMENT[slots?.weapon] || UNARMED;
export const modesOf = slots => WEAPON_STYLES[weaponOf(slots).w]?.modes || WEAPON_STYLES.unarmed.modes;
// The 13 bonuses summed (equip_get_bonuses): the quiver's Ranged strength only with nothing wielded, or
// arrows with a bow, bolts with a crossbow.
export function bonusesOf(slots = {}) {
  const sum = Object.fromEntries(BONUSES.map(k => [k, 0]));
  const weapon = EQUIPMENT[slots.weapon];
  for (const s of SLOTS) {
    const e = EQUIPMENT[slots[s]];
    if (!e?.b) continue;
    const quiverStrength = s !== 'ammo' || !weapon || (e.ammo === 'arrows' && weapon.w === 'bow') || (e.ammo === 'bolts' && weapon.w === 'crossbow');
    e.b.forEach((v, i) => { if (BONUSES[i] !== 'rangebonus' || quiverStrength) sum[BONUSES[i]] += v; });
  }
  return sum;
}
// What a weapon fires is in the quiver (a bow's arrows, a crossbow's bolts, no stronger than it: power),
// or it's thrown itself.
export function ammoProblem(slots) {
  const w = EQUIPMENT[slots?.weapon];
  if (!w?.ranged || w.ranged === 'thrown') return null;
  const a = EQUIPMENT[slots.ammo];
  if (!a || a.ammo !== w.ranged) return 'none';
  if ((a.power ?? 0) > (w.power ?? 0)) return 'weak';
  return null;
}
// The levels an item takes to wield, and the quest: { short: { skill: level }, quest }
export function wieldProblem(id, levels, { quests = true } = {}) {
  const e = EQUIPMENT[id];
  if (!e) return null;
  const short = {};
  for (const [sk, lv] of Object.entries(e.need || {})) if ((levels?.[sk] ?? 1) < lv) short[sk] = lv;
  const quest = e.quest && !quests ? e.quest : null;
  return Object.keys(short).length || quest ? { short, quest } : null;
}

// ── Your levels: potions first (stat_boost: + constant + level × percent / 100), then prayers ────────
export function boostedLevels(levels, potions = []) {
  const cur = { ...levels };
  for (const id of potions) {
    for (const [st, c, p] of POTION.get(id)?.boosts || []) {
      const base = levels[st] ?? 1;
      cur[st] = Math.min(255, Math.max(cur[st] ?? base, base + Math.trunc(c + (base * p) / 100)));
    }
  }
  return cur;
}
const prayerPct = (prayers, stat) => Math.max(100, PRAYER.get(prayers?.[stat])?.[stat] ?? 100);
const effective = (level, pct) => Math.floor(((level ?? 1) * Math.max(100, pct)) / 100);
const maxHitOf = (eff, bonus) => Math.floor((eff * (bonus + 64) + 320) / 640);
const styleKey = mode => `${mode.type === 'ranged' ? 'ranged' : 'melee'}_${mode.style}`;

// What a setup comes to: { kind, mode, spell, levels (boosted), bonus, attackRoll, maxHit, type (what the
// other's defence is rolled against), speed (ticks), defence: { stab, slash, crush, ranged, magic } (rolls),
// hitpoints, protect }.
export function playerStats(setup) {
  const slots = setup.slots || {};
  const weapon = weaponOf(slots), modes = modesOf(slots);
  const mode = modes[Math.min(Math.max(0, setup.mode | 0), modes.length - 1)];
  const levels = boostedLevels(setup.levels || {}, setup.potions);
  const bonus = bonusesOf(slots);
  const sb = RULES.styleBonus[styleKey(mode)] || [0, 0, 0, 0];
  const pr = setup.prayers || {};
  const eff = {
    attack: effective(levels.attack, prayerPct(pr, 'attack')) + 8 + sb[0],
    strength: effective(levels.strength, prayerPct(pr, 'strength')) + 8 + sb[1],
    defence: effective(levels.defence, prayerPct(pr, 'defence')) + 8 + sb[2],
    ranged: effective(levels.ranged, 100) + 8 + sb[3],
    magic: effective(levels.magic, 100) + 8 + 1,
  };
  const magicDefence = Math.trunc((7 * effective(levels.magic, 100) + 3 * effective(levels.defence, prayerPct(pr, 'defence'))) / 10) + 8;
  const defence = {
    stab: eff.defence * (bonus.stabdefence + 64), slash: eff.defence * (bonus.slashdefence + 64), crush: eff.defence * (bonus.crushdefence + 64),
    ranged: eff.defence * (bonus.rangedefence + 64), magic: magicDefence * (bonus.magicdefence + 64),
  };
  const out = { mode, levels, bonus, eff, defence, hitpoints: setup.levels?.hitpoints ?? 10, protect: PRAYER.get(pr.protect)?.protect || null, weapon };
  const spell = setup.spell && SPELL.get(setup.spell);
  if (spell && setup.cast !== false && setup.kind === 'magic') {
    let max = spell.max;
    if (spell.gauntlets && slots.hands === 'gauntlets_of_chaos') max += spell.gauntlets;
    if (spell.charged && setup.charge && slots.cape === `${spell.god}_cape` && slots.weapon === `${spell.god}_staff`) max = spell.charged;
    return { ...out, kind: 'magic', spell, type: 'magic', attackRoll: eff.magic * (bonus.magicattack + 64), maxHit: max, speed: RULES.magicRate };
  }
  if (mode.type === 'ranged') {
    const rapid = mode.style === 'rapid' ? 1 : 0;
    return { ...out, kind: 'ranged', type: 'ranged', attackRoll: eff.ranged * (bonus.rangeattack + 64), maxHit: maxHitOf(eff.ranged, bonus.rangebonus), speed: (weapon.r ?? 4) - rapid };
  }
  return { ...out, kind: 'melee', type: mode.type, attackRoll: eff.attack * (bonus[`${mode.type}attack`] + 64), maxHit: maxHitOf(eff.strength, bonus.strengthbonus), speed: weapon.r ?? 4 };
}

// The chance randominc(a) > randominc(d).
export function hitChance(a, d) {
  a = Math.max(0, Math.floor(a)); d = Math.max(0, Math.floor(d));
  return a > d ? 1 - (d + 2) / (2 * (a + 1)) : a / (2 * (d + 1));
}

// ── A monster ────────────────────────────────────────────────────────────────
const STAT = { attack: 0, strength: 1, defence: 2, hitpoints: 3, ranged: 4, magic: 5 };
export function npcOf(id) {
  const info = NPC_INFO[id];
  if (!info) return null;
  const st = k => info.stats?.[STAT[k]] ?? 1, bn = k => info.bonus?.[k] ?? 0;
  return { id, info, hp: st('hitpoints'), size: info.size || 1, st, bn, speed: info.speed || 4, style: info.style || 'crush', undead: !!info.undead, demon: !!info.demon, cap: info.cap ?? null };
}
// Its defence roll against a type (npc_defence_roll_specific): Magic for magic, Defence for the rest
export const npcDefenceRoll = (npc, type) => (npc.st(type === 'magic' ? 'magic' : 'defence') + 9) * (npc.bn(`${type}defence`) + 64);
// What it attacks with, each with its share: [{ p, kind, attackRoll, type (what your defence is rolled
// against), max, sure, … }], melee alone where its attack scripts say nothing else.
export function npcAttacksOf(npc) {
  // (the shares as the data has them, to six places: a third is 0.333333; taken to add up to 1, so a fight ends)
  const given = npc.info.attacks || [{ p: 1, kind: 'melee' }];
  const sum = given.reduce((a, x) => a + x.p, 0) || 1;
  const list = given.map(x => ({ ...x, p: x.p / sum }));
  const melee = { attackRoll: (npc.st('attack') + 9) * (npc.bn('attackbonus') + 64), max: maxHitOf(npc.st('strength') + 9, npc.bn('strengthbonus')) };
  return list.map(a => {
    if (a.kind === 'melee') return { ...a, type: npc.style === 'ranged' || npc.style === 'magic' ? 'crush' : npc.style, ...melee };
    if (a.kind === 'ranged') return { ...a, type: 'ranged', attackRoll: (npc.st('ranged') + 9) * (npc.bn('rangeattack') + 64), max: a.max ?? maxHitOf(npc.st('ranged') + 9, npc.bn('rangebonus')) };
    if (a.kind === 'magic') return { ...a, type: 'magic', attackRoll: (npc.st('magic') + 9) * (npc.bn('magicattack') + 64), max: a.max ?? 0 };
    if (a.kind === 'dragonfire') return { ...a, type: npc.style, attackRoll: (npc.st('magic') + 9) * (npc.bn('magicattack') + 64) };
    if (a.kind === 'breath') return { ...a, type: 'magic', attackRoll: (npc.st('magic') + 9) * (npc.bn('magicattack') + 64) };
    return { ...a, type: null, attackRoll: 0, max: 0 };
  });
}

// ── One attack's damage: [P(0), P(1), …, P(max)] ─────────────────────────────
// A hit with chance p does 0 to max, each as likely.
export function damagePmf(p, max) {
  max = Math.max(0, Math.floor(max));
  const out = new Float64Array(max + 1);
  const each = p / (max + 1);
  for (let k = 0; k <= max; k++) out[k] = each;
  out[0] += 1 - p;
  return out;
}
const mixPmf = parts => {
  const len = Math.max(1, ...parts.map(([, f]) => f.length));
  const out = new Float64Array(len);
  for (const [w, f] of parts) f.forEach((v, k) => { out[k] += w * v; });
  return out;
};
const meanOf = f => f.reduce((a, v, k) => a + v * k, 0);

// How a monster's attacks do against you: { pmf (one attack's damage), parts: [{ attack, p (to hit), max }] }.
// A protect prayer leaves its melee, Ranged and spells nothing (npc_combat_*: damage 0, a spell failing);
// dragonfire and breath have their own numbers for it, the anti-dragon shield and antifire.
export function npcVsYou(npc, you) {
  const parts = npcAttacksOf(npc).map(a => {
    const def = a.type ? you.defence[a.type] : 0;
    let p = a.sure ? 1 : hitChance(a.attackRoll, def), max = a.max ?? 0;
    const shield = you.slots?.shield === ANTI_DRAGON;
    if (a.kind === 'dragonfire') {
      // (no miss: its roll against your defence only adds to the max)
      const beat = hitChance(a.attackRoll, def);
      const base = shield ? a.shield : you.protect === 'magic' ? a.protect : null;
      const af = you.antifire ? a.antifire : 0;
      const pmf = base != null ? damagePmf(1, Math.max(0, base - af)) : mixPmf([[beat, damagePmf(1, Math.max(0, a.base + a.plus - af))], [1 - beat, damagePmf(1, Math.max(0, a.base - af))]]);
      return { attack: a, p: 1, max: base != null ? Math.max(0, base - af) : Math.max(0, a.base + a.plus - af), pmf };
    }
    if (a.kind === 'breath') {
      max = (shield ? a.shield : you.protect === 'magic' ? a.protect : a.max) - (you.antifire && a.antifire ? a.antifire : 0);
      max = Math.max(0, max);
    } else if (a.kind !== 'none' && you.protect && you.protect === (a.kind === 'melee' ? 'melee' : a.kind)) {
      p = 0;
    }
    if (a.kind === 'none') p = 0;
    return { attack: a, p, max, pmf: damagePmf(p, max) };
  });
  return { parts, pmf: mixPmf(parts.map(x => [x.attack.p, x.pmf])) };
}

// What you do to a monster: { p, max, pmf, defenceRoll, capped }. A hit on it does no more than its cap
// (max_dealt); silverlight hits a demon harder (× RULES.demonbane); Crumble Undead hits only the undead.
export function youVsNpc(you, npc) {
  const defenceRoll = npcDefenceRoll(npc, you.type);
  let p = hitChance(you.attackRoll, defenceRoll), max = you.maxHit;
  if (you.kind === 'melee' && npc.demon && you.slotsWeapon === 'silverlight') max = Math.floor((max * RULES.demonbane[0]) / RULES.demonbane[1]);
  if (you.kind === 'magic' && you.spell?.undead && !npc.undead) p = 0;
  if (npc.cap != null) max = Math.min(max, npc.cap);
  return { p, max, defenceRoll, pmf: damagePmf(p, max), capped: npc.cap != null };
}

// ── Attacks to a kill ──────────────────────────────────────────────────────────
// A damage pmf as pieces each even over 0..M: pmf[k] = Σ (M ≥ k) d_M for k ≥ 1, and pmf[0] the d's and the rest
// (r0: the misses' share). One attack moves what's left at h hitpoints to h − 0 … h − M at once (a difference
// array), so a step costs the hitpoints times the pieces, not times the max hit as well.
function piecesOf(pmf) {
  const segs = [];
  let sum = 0;
  for (let M = pmf.length - 1; M >= 1; M--) {
    const d = pmf[M] - (M + 1 < pmf.length ? pmf[M + 1] : 0);
    if (d) { segs.push([d, M]); sum += d; }
  }
  return { r0: pmf[0] - sum, segs };
}
// The chance the kill takes n attacks, n = 1, 2, …: [P(1), P(2), …] while what's left of the chance is
// more than `tail`, and that rest. (A hit does no more than what's left: what's past it doesn't matter.)
export function attacksToKill(hp, pmf, { tail = 1e-7, most = 20000 } = {}) {
  hp = Math.max(1, Math.floor(hp));
  if (!(pmf.length > 1) || pmf.slice(1).every(v => v <= 0)) return { pmf: [], rest: 1, mean: Infinity };
  const { r0, segs } = piecesOf(pmf);
  let alive = new Float64Array(hp + 1);
  alive[hp] = 1;
  const out = [];
  let left = 1;
  const diff = new Float64Array(hp + 2);
  for (let n = 1; n <= most && left > tail; n++) {
    diff.fill(0);
    let killed = 0;
    for (let h = 1; h <= hp; h++) {
      const m = alive[h];
      if (!m) continue;
      diff[h] += m * r0; diff[h + 1] -= m * r0;
      for (const [d, M] of segs) {
        const w = m * d, top = Math.min(M, h - 1);
        diff[h - top] += w; diff[h + 1] -= w;
        if (M >= h) killed += w * (M - h + 1);
      }
    }
    const next = new Float64Array(hp + 1);
    let run = 0;
    for (let h = 1; h <= hp; h++) { run += diff[h]; next[h] = run > 0 ? run : 0; }
    out.push(killed);
    left -= killed;
    alive = next;
  }
  const mean = out.reduce((a, v, i) => a + v * (i + 1), 0) + (left > 1e-6 ? Infinity : 0);
  return { pmf: out, rest: Math.max(0, left), mean };
}
// The mean alone, exactly (E(h) = (1 + Σ P(k) E(h − k)) / (1 − P(0)), from 1 hitpoint up)
export function meanAttacksToKill(hp, pmf) {
  hp = Math.max(1, Math.floor(hp));
  const p0 = pmf[0] ?? 1;
  if (!(p0 < 1)) return Infinity;
  const E = new Float64Array(hp + 1);
  for (let h = 1; h <= hp; h++) {
    let s = 1;
    for (let k = 1; k < Math.min(h, pmf.length); k++) s += pmf[k] * E[h - k];
    E[h] = s / (1 - p0);
  }
  return E[hp];
}

// ── A fight: you attack at tick 0, A, 2A, …; it answers from tick `first` every B ticks. No food. ──
// → { win (the chance it dies first; the same tick counts half), you: { mean (attacks), seconds }, them: …,
//   hpLost (the damage you take, on average, while you kill it) }. The side that kills sooner on average is counted
// out in full, and the other only as far as that one can still be standing (past it no attack of theirs counts).
export function fightOf({ yourPmf, yourHp, yourSpeed }, { theirPmf, theirHp, theirSpeed }, { first = 1 } = {}) {
  const meanYou = meanAttacksToKill(theirHp, yourPmf), meanThem = meanAttacksToKill(yourHp, theirPmf);
  const sec = (mean, speed) => (Number.isFinite(mean) ? mean * speed * 0.6 : Infinity);
  // (one that can't hurt the other: no chance for it, or no end to it)
  if (!Number.isFinite(meanYou) || !Number.isFinite(meanThem)) {
    return {
      win: Number.isFinite(meanYou) ? 1 : 0,
      you: { mean: meanYou, seconds: sec(meanYou, yourSpeed), rest: Number.isFinite(meanYou) ? 0 : 1 },
      them: { mean: meanThem, seconds: sec(meanThem, theirSpeed), rest: Number.isFinite(meanThem) ? 0 : 1 },
      hpLost: Number.isFinite(meanThem) ? Infinity : 0,
    };
  }
  const done = d => (d.pmf.length && d.rest < 1e-6 ? d.pmf.length : null);      // (attacks, when it's surely over by then)
  let you, them;
  if (meanYou * yourSpeed <= first + (meanThem - 1) * theirSpeed) {
    you = attacksToKill(theirHp, yourPmf);
    const n = done(you);
    them = attacksToKill(yourHp, theirPmf, { most: n == null ? 20000 : Math.max(1, Math.floor(((n - 1) * yourSpeed - first) / theirSpeed) + 2) });
  } else {
    them = attacksToKill(yourHp, theirPmf);
    const n = done(them);
    you = attacksToKill(theirHp, yourPmf, { most: n == null ? 20000 : Math.floor((first + (n - 1) * theirSpeed) / yourSpeed) + 2 });
  }
  // the chance they haven't killed you by tick t (their killing hit at first + (m − 1)·B)
  const cumThem = []; { let c = 0; for (const v of them.pmf) { c += v; cumThem.push(c); } }
  const deadBy = t => { if (t < first) return 0; const m = Math.floor((t - first) / theirSpeed) + 1; return m >= 1 ? (cumThem[Math.min(m, cumThem.length) - 1] ?? 0) : 0; };
  const exactlyAt = t => { if (t < first || (t - first) % theirSpeed) return 0; const m = (t - first) / theirSpeed + 1; return them.pmf[m - 1] ?? 0; };
  const theirHits = t => (t >= first ? Math.floor((t - first) / theirSpeed) + 1 : 0);
  let win = 0, hits = 0;
  const avgTheirs = meanOf(theirPmf);
  you.pmf.forEach((pn, i) => {
    const t = i * yourSpeed;
    win += pn * (1 - deadBy(t) + 0.5 * exactlyAt(t));
    hits += pn * theirHits(t);
  });
  // (what wasn't counted out: a kill after the last attack counted, so at least that many of theirs)
  if (you.rest > 0 && you.pmf.length) hits += you.rest * theirHits(you.pmf.length * yourSpeed);
  return {
    win: Math.max(0, Math.min(1, win)),
    you: { mean: meanYou, seconds: sec(meanYou, yourSpeed), rest: you.rest },
    them: { mean: meanThem, seconds: sec(meanThem, theirSpeed), rest: them.rest },
    hpLost: hits * avgTheirs,
  };
}

// ── You against a monster: the whole of it ─────────────────────────────────────
export function vsNpc(setup, npcId) {
  const npc = npcOf(npcId);
  if (!npc) return null;
  const you = { ...playerStats(setup), slots: setup.slots || {}, antifire: !!setup.antifire };
  you.slotsWeapon = setup.slots?.weapon || null;
  const off = youVsNpc(you, npc);
  const def = npcVsYou(npc, you);
  const avg = meanOf(off.pmf);
  const fight = fightOf({ yourPmf: off.pmf, yourHp: you.hitpoints, yourSpeed: you.speed }, { theirPmf: def.pmf, theirHp: npc.hp, theirSpeed: npc.speed });
  return {
    npc, you, off, def,
    avgHit: avg, dps: avg / (you.speed * 0.6),
    attacks: meanAttacksToKill(npc.hp, off.pmf),
    theirAvg: meanOf(def.pmf), theirDps: meanOf(def.pmf) / (npc.speed * 0.6),
    fight,
    special: specialVsNpc(setup, you, npc),
  };
}

// ── A special attack against a monster (player/specs): its hits, their chance and max hit ─────────
export function specialOf(setup) {
  const w = EQUIPMENT[setup.slots?.weapon];
  return w?.spec || null;
}
export function specialVsNpc(setup, you, npc) {
  const sp = specialOf(setup);
  if (!sp) return null;
  const out = { spec: sp, energy: sp.energy / (RULES.specBar.max / 100) };
  if (sp.rampage || sp.defence != null || sp.push || !sp.hits) return out;
  const hits = npc && npc.size > 1 && sp.bigHits ? sp.bigHits : sp.hits;
  const vs = sp.vs || you.type;
  const defenceRoll = npc ? npcDefenceRoll(npc, vs) : null;
  let max = specialMax(sp, setup, you);
  if (npc?.cap != null) max = Math.min(max, npc.cap);
  const roll = specialRoll(sp, you);
  const p = sp.sure ? 1 : npc ? hitChance(roll, defenceRoll) : null;
  return { ...out, hits, max, p, attackRoll: roll, defenceRoll, avg: p == null ? null : hits * p * max / 2 };
}
// A special's max hit: the weapon's share of yours, or (a bow's, a thrown axe's) levels on your Ranged in place of 8
// and your style, with the ammo's own Ranged strength
function specialMax(sp, setup, you) {
  if (sp.ranged == null) return Math.floor((you.maxHit * sp.max[0]) / sp.max[1]);
  const ammo = EQUIPMENT[setup.slots?.weapon]?.ranged === 'thrown' ? EQUIPMENT[setup.slots?.weapon] : EQUIPMENT[setup.slots?.ammo];
  const strength = ammo?.b?.[BONUSES.indexOf('rangebonus')] ?? 0;
  return maxHitOf((you.levels.ranged ?? 1) + sp.ranged, strength);
}
const specialRoll = (sp, you) => (sp.acc ? Math.floor((you.attackRoll * sp.acc[0]) / sp.acc[1]) : you.attackRoll);
// What a special attack is against (a protect prayer's word): melee, ranged or magic
const specialStyle = (sp, you) => (sp.ranged != null ? 'ranged' : you.kind === 'melee' ? 'melee' : you.kind);
// …and against a player (pvp/specs): the same rolls, against their defence roll; a hit's max cut by their protect
// prayer (RULES.protectPvp), and a player is one square (a halberd's second hit is for a monster). The server's
// magic shortbow special rolls against your own Ranged defence, not theirs (pvp_magic_shortbow: no dot).
export function specialVsPlayer(setup, you, them) {
  const sp = specialOf(setup);
  if (!sp) return null;
  const out = { spec: sp, energy: sp.energy / (RULES.specBar.max / 100) };
  if (sp.rampage || sp.defence != null || sp.push || !sp.hits) return out;
  const vs = sp.vs || you.type;
  const own = setup.slots?.weapon === 'magic_shortbow';
  const defenceRoll = own ? you.defence[vs] : them.defence[vs];
  const prot = them.protect && them.protect === specialStyle(sp, you);
  let max = specialMax(sp, setup, you);
  if (prot) max = Math.floor((max * RULES.protectPvp[0]) / RULES.protectPvp[1]);
  const roll = specialRoll(sp, you);
  const p = sp.sure ? 1 : hitChance(roll, defenceRoll);
  return { ...out, hits: sp.hits, max, p, attackRoll: roll, defenceRoll, avg: (sp.hits * p * max) / 2, protected: !!prot, ownDefence: own };
}

// ── Player against player (pvp_combat.rs2) ───────────────────────────────────────
// The same rolls, against the other player's defence roll; a protect prayer against your style cuts your
// max hit (RULES.protectPvp) instead of stopping it, and a hit does no more than they have left.
export function vsPlayer(mine, theirs) {
  const a = { ...playerStats(mine), slots: mine.slots || {} }, b = { ...playerStats(theirs), slots: theirs.slots || {} };
  const side = (x, y) => {
    const def = y.defence[x.type];
    const p = hitChance(x.attackRoll, def);
    const against = x.kind === 'melee' ? 'melee' : x.kind;
    const max = y.protect === against ? Math.floor((x.maxHit * RULES.protectPvp[0]) / RULES.protectPvp[1]) : x.maxHit;
    return { p, max, defenceRoll: def, pmf: damagePmf(p, max), protected: y.protect === against };
  };
  const ab = side(a, b), ba = side(b, a);
  const fight = fightOf({ yourPmf: ab.pmf, yourHp: a.hitpoints, yourSpeed: a.speed }, { theirPmf: ba.pmf, theirHp: b.hitpoints, theirSpeed: b.speed });
  return {
    you: a, them: b, ab, ba, fight,
    avgHit: meanOf(ab.pmf), theirAvg: meanOf(ba.pmf),
    dps: meanOf(ab.pmf) / (a.speed * 0.6), theirDps: meanOf(ba.pmf) / (b.speed * 0.6),
    attacks: meanAttacksToKill(b.hitpoints, ab.pmf), theirAttacks: meanAttacksToKill(a.hitpoints, ba.pmf),
    special: specialVsPlayer(mine, a, b), theirSpecial: specialVsPlayer(theirs, b, a),
  };
}

// ── The best from a bank ───────────────────────────────────────────────────────
// For a kind (melee, ranged, magic) and a focus: damage (the most damage a tick against the monster, or a
// middling one; then the least taken), or tank (the least damage a tick from it, or with no monster the best
// defence rolls on average; then the most of yours). What your levels can wield, from what's in the bank: every
// slot tried in turn with each candidate, the others kept, until nothing changes (with the weapon, its ammo and
// its style together).
const GENERIC = { id: null, info: { stats: [40, 40, 40, 50, 1, 1], speed: 4 }, hp: 50, size: 1, st: k => (k === 'hitpoints' ? 50 : 40), bn: () => 0, speed: 4, style: 'slash', undead: false, demon: false, cap: null };
const better = (a, b) => a[0] > b[0] + 1e-12 || (Math.abs(a[0] - b[0]) <= 1e-12 && a[1] > b[1] + 1e-12);
export function bestFromBank({ kind, focus = 'damage', levels, items, npcId = null, quests = true, prayers = {}, potions = [], spell = null, antifire = false, keep = {} }) {
  const real = npcId && npcOf(npcId);
  const npc = real || GENERIC;
  const have = id => (items?.[id] ?? 0) > 0;
  const fits = id => !wieldProblem(id, levels, { quests });
  const cands = {};
  for (const s of SLOTS) cands[s] = [null];
  for (const [id, e] of Object.entries(EQUIPMENT)) if (have(id) && fits(id)) cands[e.s].push(id);
  const isRangedWeapon = id => !!EQUIPMENT[id]?.ranged;
  cands.weapon = cands.weapon.filter(id => (kind === 'ranged' ? id && isRangedWeapon(id) : !isRangedWeapon(id)));
  if (kind === 'ranged' && !cands.weapon.length) return null;
  const spells = kind === 'magic' ? COMBAT_SPELLS.filter(sp => (levels.magic ?? 1) >= sp.level && !(sp.undead && !npc.undead)) : [];
  const NONE = { v: [-Infinity, -Infinity] };
  const score = slots => {
    if (ammoProblem(slots)) return NONE;
    if (EQUIPMENT[slots.weapon]?.two && slots.shield) return NONE;
    let best = NONE;
    const modes = modesOf(slots);
    const can = spells.filter(sp => !sp.staff || slots.weapon === sp.staff).sort((x, y) => y.max - x.max);
    for (const sp of kind === 'magic' ? can.slice(0, 1) : [null]) {
      modes.forEach((m, i) => {
        if (kind === 'ranged' ? m.type !== 'ranged' : m.type === 'ranged') return;
        const setup = { kind, slots, mode: i, spell: sp?.id, prayers, potions, levels, antifire };
        const you = { ...playerStats(setup), slots, antifire };
        you.slotsWeapon = slots.weapon;
        const dmg = meanOf(youVsNpc(you, npc).pmf) / you.speed;
        const safe = real ? -meanOf(npcVsYou(npc, you).pmf) / npc.speed : TYPES.reduce((a, t) => a + you.defence[t], 0) / TYPES.length;
        const v = focus === 'tank' ? [safe, dmg] : [dmg, safe];
        if (better(v, best.v)) best = { v, mode: i, spell: sp?.id ?? null };
      });
    }
    return best;
  };
  const slots = { ...keep };
  for (const s of SLOTS) if (!(s in slots)) slots[s] = null;
  const weaponFirst = ['weapon', 'ammo', ...SLOTS.filter(s => s !== 'weapon' && s !== 'ammo')];
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (const s of weaponFirst) {
      if (s in keep) continue;
      let bestV = score(slots).v;
      for (const id of cands[s]) {
        if (id === slots[s]) continue;
        const trial = { ...slots, [s]: id };
        // (a two-handed weapon takes the shield off; ranged: the best ammo for that weapon with it)
        if (s === 'weapon' && EQUIPMENT[id]?.two) trial.shield = null;
        if (s === 'weapon' && kind === 'ranged') {
          let bestAmmo = trial.ammo, bv = NONE.v;
          for (const a of cands.ammo) { const v2 = score({ ...trial, ammo: a }).v; if (better(v2, bv)) { bv = v2; bestAmmo = a; } }
          trial.ammo = bestAmmo;
        }
        const v = score(trial).v;
        if (better(v, bestV)) { bestV = v; Object.assign(slots, trial); changed = true; }
      }
    }
    if (!changed) break;
  }
  const r = score(slots);
  if (r === NONE || r.v[0] === -Infinity) return null;
  for (const s of SLOTS) if (slots[s] == null) delete slots[s];
  return { slots, mode: r.mode, spell: r.spell };
}

// The best prayer for each of attack, strength, defence your Prayer level has (for a setup's start)
export function bestPrayers(prayerLevel, kind) {
  const out = {};
  for (const stat of ['attack', 'strength', 'defence']) {
    if (kind !== 'melee' && stat !== 'defence') continue;
    const p = PRAYERS.filter(x => x[stat] && x.level <= (prayerLevel ?? 1)).sort((a, b) => b[stat] - a[stat])[0];
    if (p) out[stat] = p.id;
  }
  return out;
}

// The weapon's style for a goal's (accurate, aggressive, defensive, controlled; rapid, longrange): the setup's own
// mode when it's that style, else the first of the weapon's that is, the same kind of hit as the setup's where it
// can be. null: the weapon has no such style (a spear has no Aggressive).
export function modeFor(slots, style, mode = 0) {
  const modes = modesOf(slots);
  const mine = modes[Math.min(Math.max(0, mode | 0), modes.length - 1)];
  const want = style === 'rapid' ? ['rapid', 'accurate'] : [style];
  if (mine && want.includes(mine.style)) return modes.indexOf(mine);
  for (const st of want) {
    const same = modes.findIndex(m => m.style === st && m.type === mine?.type);
    if (same >= 0) return same;
    const any = modes.findIndex(m => m.style === st);
    if (any >= 0) return any;
  }
  return null;
}
// The strongest spell your Magic level casts, with what's wielded (a god spell its god's staff; Iban Blast Iban's)
export function bestSpell(magic, slots = {}, { undead = false } = {}) {
  const can = COMBAT_SPELLS.filter(sp => (magic ?? 1) >= sp.level && (!sp.staff || slots.weapon === sp.staff) && (!sp.undead || undead));
  return can.sort((a, b) => b.max - a.max || b.level - a.level)[0]?.id ?? null;
}
// What a ranged setup shoots, for a Ranged goal's ammo: { weapon, ammo (the item each shot uses up: the quiver's,
// or what's thrown), attack (the whole Ranged attack bonus), strength (the Ranged strength that counts), rate
// (ticks a shot on Rapid and Accurate), problem: 'none' (no ranged weapon) | 'ammo' (nothing it fires) | 'weak' }
export function rangedGearOf(slots = {}) {
  const w = EQUIPMENT[slots.weapon];
  if (!w?.ranged) return { problem: 'none' };
  const bonus = bonusesOf(slots);
  const ammo = w.ranged === 'thrown' ? slots.weapon : slots.ammo;
  const problem = ammoProblem(slots);
  return { weapon: slots.weapon, ammo: ammo || null, attack: bonus.rangeattack, strength: bonus.rangebonus, rate: w.r ?? 4, problem: problem === 'none' ? 'ammo' : problem };
}
