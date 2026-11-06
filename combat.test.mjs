// v3.5: a fight by the server's sums (combat.js), and the gear data it's counted with (geardata.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from './combat.js';
import { EQUIPMENT, WEAPON_STYLES, PRAYERS, POTIONS, COMBAT_SPELLS, RULES, BONUSES } from './geardata.js';
import { killAt, gearOf, shotsToKill } from './ranged.js';

const lv = (o = {}) => ({ attack: 1, strength: 1, defence: 1, hitpoints: 10, ranged: 1, magic: 1, prayer: 1, ...o });

test("what's worn adds up as equip_get_bonuses has it: the quiver's Ranged strength only with its own weapon", () => {
  const sum = C.bonusesOf({ weapon: 'rune_scimitar', neck: 'amulet_of_strength', body: 'rune_platebody' });
  assert.equal(sum.slashattack, 45);
  assert.equal(sum.strengthbonus, 44 + 10);
  assert.equal(sum.slashdefence, 1 + 80);
  assert.equal(sum.magicattack, -30);
  // rune arrows: their 49 with a bow, none with a knife thrown (the knife's own 24)
  assert.equal(C.bonusesOf({ weapon: 'magic_shortbow', ammo: 'rune_arrow' }).rangebonus, 49);
  assert.equal(C.bonusesOf({ weapon: 'rune_knife', ammo: 'rune_arrow' }).rangebonus, 24);
  assert.equal(C.bonusesOf({ ammo: 'rune_arrow' }).rangebonus, 49, 'nothing wielded: it counts');
  assert.equal(C.ammoProblem({ weapon: 'maple_shortbow', ammo: 'rune_arrow' }), 'weak');
  assert.equal(C.ammoProblem({ weapon: 'magic_shortbow' }), 'none');
  assert.equal(C.ammoProblem({ weapon: 'crossbow', ammo: 'rune_arrow' }), 'none');
  assert.equal(C.ammoProblem({ weapon: 'rune_knife' }), null);
  assert.equal(BONUSES.length, 13);
});

test('the data: slots, styles named as the combat tabs name them, prayers, potions and spells', () => {
  assert.deepEqual(RULES.slots, ['head', 'cape', 'neck', 'weapon', 'body', 'shield', 'legs', 'hands', 'feet', 'ring', 'ammo']);
  assert.deepEqual(WEAPON_STYLES.slash.modes.map(m => `${m.name} ${m.style} ${m.type}`), ['Chop accurate slash', 'Slash aggressive slash', 'Lunge controlled stab', 'Block defensive slash']);
  assert.deepEqual(WEAPON_STYLES.bow.modes.map(m => m.style), ['accurate', 'rapid', 'longrange']);
  assert.equal(EQUIPMENT.rune_2h_sword.two, 1);
  assert.equal(EQUIPMENT.rune_2h_sword.r, 7);
  assert.deepEqual(EQUIPMENT.rune_platebody.need, { defence: 40 });
  assert.equal(EQUIPMENT.rune_platebody.quest, 'Dragon Slayer');
  assert.deepEqual(EQUIPMENT.dragon_dagger.spec, { energy: 250, hits: 2, max: [115, 100], acc: [115, 100], vs: 'slash' });
  assert.equal(PRAYERS.find(p => p.id === 'ultimate_strength').strength, 115);
  assert.equal(PRAYERS.find(p => p.id === 'protect_from_melee').protect, 'melee');
  assert.deepEqual(POTIONS.find(p => p.id === 'super_strength').boosts, [['strength', 5, 15]]);
  assert.equal(COMBAT_SPELLS.find(s => s.id === 'fire_blast').max, 16);
  assert.equal(COMBAT_SPELLS.find(s => s.id === 'fire_bolt').gauntlets, 3);
  assert.equal(COMBAT_SPELLS.find(s => s.id === 'saradomin_strike').charged, 30);
  assert.deepEqual(RULES.protectPvp, [6, 10]);
});

test('levels: a potion from your level (stat_boost), a prayer on the boosted level, then 8 and the style', () => {
  assert.equal(C.boostedLevels(lv({ strength: 60 }), ['super_strength']).strength, 60 + 5 + 9);
  assert.equal(C.boostedLevels(lv({ ranged: 90 }), ['range']).ranged, 90 + 4 + 9);
  assert.equal(C.boostedLevels(lv({ attack: 60 }), ['attack', 'super_attack']).attack, 60 + 5 + 9, 'the stronger of two');
  // a rune scimitar on Chop (Accurate, slash) at Attack 60: (60 + 8 + 3) × (45 + 64)
  const m = C.playerStats({ kind: 'melee', slots: { weapon: 'rune_scimitar' }, mode: 0, levels: lv({ attack: 60, strength: 60 }) });
  assert.deepEqual([m.type, m.attackRoll, m.maxHit, m.speed], ['slash', 7739, 11, 4]);
  // Slash (Aggressive) with a super strength and Ultimate Strength: ⌊74 × 1.15⌋ + 8 + 3 = 96; (96 × 108 + 320) / 640
  const m2 = C.playerStats({ kind: 'melee', slots: { weapon: 'rune_scimitar' }, mode: 1, prayers: { strength: 'ultimate_strength' }, potions: ['super_strength'], levels: lv({ attack: 60, strength: 60 }) });
  assert.deepEqual([m2.eff.strength, m2.maxHit], [96, 16]);
  // your defence: Defence 40 on Block (+3) in a rune platebody (80) with the scimitar's 1: (40 + 8 + 3) × (81 + 64) against slash
  const d = C.playerStats({ kind: 'melee', slots: { weapon: 'rune_scimitar', body: 'rune_platebody' }, mode: 3, levels: lv({ defence: 40, magic: 50 }) });
  assert.equal(d.defence.slash, 51 * 145);
  // magic defence: ⌊(7 × 50 + 3 × 40) / 10⌋ + 8, × (−6 + 64)
  assert.equal(d.defence.magic, (Math.trunc((7 * 50 + 3 * 40) / 10) + 8) * (-6 + 64));
});

test('Ranged and Magic: the same numbers as ranged.js; a spell its own max hit, cast every 5 ticks', () => {
  const r = C.playerStats({ kind: 'ranged', slots: { weapon: 'magic_shortbow', ammo: 'rune_arrow' }, mode: 1, levels: lv({ ranged: 90 }) });
  const k = killAt({ id: 'fire_giant_86', hp: 111, defence: 65, rangeDefence: 0 }, 90, { style: 'rapid', gear: gearOf({ kind: 'arrows', ammo: 'rune_arrow', bow: 'magic_shortbow' }) });
  assert.deepEqual([r.attackRoll, r.maxHit, r.speed], [k.attack, k.max, 3]);
  const fg = C.npcOf('fire_giant_86');
  assert.equal(C.npcDefenceRoll(fg, 'ranged'), k.defence);
  const v = C.vsNpc({ kind: 'ranged', slots: { weapon: 'magic_shortbow', ammo: 'rune_arrow' }, mode: 1, levels: lv({ ranged: 90, hitpoints: 90 }) }, 'fire_giant_86');
  assert.ok(Math.abs(v.attacks - k.shots) < 1e-9, `${v.attacks} vs ${k.shots}`);
  const mg = C.playerStats({ kind: 'magic', slots: { weapon: 'staff_of_fire' }, spell: 'fire_blast', levels: lv({ magic: 60 }) });
  assert.deepEqual([mg.type, mg.attackRoll, mg.maxHit, mg.speed], ['magic', (60 + 9) * (EQUIPMENT.staff_of_fire.b[3] + 64), 16, 5]);
  // chaos gauntlets: 3 more on a bolt spell
  assert.equal(C.playerStats({ kind: 'magic', slots: { hands: 'gauntlets_of_chaos' }, spell: 'fire_bolt', levels: lv({ magic: 40 }) }).maxHit, 15);
  // Crumble Undead hits only the undead
  const notUndead = C.vsNpc({ kind: 'magic', slots: {}, spell: 'crumble_undead', levels: lv({ magic: 50, hitpoints: 50 }) }, 'fire_giant_86');
  assert.equal(notUndead.off.p, 0);
});

test('attacks to a kill: the chance of each number of attacks; its mean is the exact one', () => {
  for (const [hp, p, max] of [[7, 0.6, 3], [60, 0.85, 11], [111, 0.4, 24]]) {
    const pmf = C.damagePmf(p, max);
    const d = C.attacksToKill(hp, pmf);
    assert.ok(Math.abs(d.pmf.reduce((a, v) => a + v, 0) + d.rest - 1) < 1e-9);
    const mean = d.pmf.reduce((a, v, i) => a + v * (i + 1), 0);
    assert.ok(Math.abs(mean - C.meanAttacksToKill(hp, pmf)) < 1e-4, `${hp} ${p} ${max}: ${mean} vs ${C.meanAttacksToKill(hp, pmf)}`);
    assert.ok(Math.abs(C.meanAttacksToKill(hp, pmf) - shotsToKill(hp, p, max)) < 1e-9);
  }
  assert.equal(C.meanAttacksToKill(10, C.damagePmf(0, 5)), Infinity);
});

test('a fight: two the same, the one who hits first a little ahead; no chance of hitting, no chance of winning', () => {
  const pmf = C.damagePmf(0.5, 10);
  const even = C.fightOf({ yourPmf: pmf, yourHp: 50, yourSpeed: 4 }, { theirPmf: pmf, theirHp: 50, theirSpeed: 4 }, { first: 0 });
  assert.ok(Math.abs(even.win - 0.5) < 1e-6, `${even.win}`);
  const first = C.fightOf({ yourPmf: pmf, yourHp: 50, yourSpeed: 4 }, { theirPmf: pmf, theirHp: 50, theirSpeed: 4 });
  assert.ok(first.win > 0.5 && first.win < 0.65, `${first.win}`);
  const none = C.fightOf({ yourPmf: C.damagePmf(0, 10), yourHp: 50, yourSpeed: 4 }, { theirPmf: pmf, theirHp: 50, theirSpeed: 4 });
  assert.equal(none.win, 0);
  const sure = C.fightOf({ yourPmf: C.damagePmf(1, 99), yourHp: 99, yourSpeed: 4 }, { theirPmf: C.damagePmf(0.1, 1), theirHp: 10, theirSpeed: 4 });
  assert.ok(sure.win > 0.89);
});

test("a monster's attacks: melee by its own rolls; a protect prayer stops them; dragonfire and the anti-dragon shield", () => {
  const fg = C.npcOf('fire_giant_86');
  const [hit] = C.npcAttacksOf(fg);
  // (65 + 9) × (29 + 64), and ((65 + 9) × (31 + 64) + 320) / 640
  assert.deepEqual([hit.kind, hit.type, hit.attackRoll, hit.max], ['melee', 'slash', 74 * 93, 11]);
  const you = { ...C.playerStats({ kind: 'melee', slots: {}, levels: lv({ defence: 40 }) }), slots: {} };
  assert.ok(C.npcVsYou(fg, you).parts[0].p > 0);
  const praying = { ...C.playerStats({ kind: 'melee', slots: {}, prayers: { protect: 'protect_from_melee' }, levels: lv({ defence: 40, prayer: 43 }) }), slots: {} };
  assert.equal(C.npcVsYou(fg, praying).parts[0].p, 0);
  const gd = C.npcOf('green_dragon_79');
  const fire = a => C.npcVsYou(gd, a).parts.find(x => x.attack.kind === 'dragonfire');
  assert.equal(fire(you).max, 50);
  assert.equal(fire({ ...you, slots: { shield: 'antidragonbreathshield' } }).max, 5);
  assert.equal(fire({ ...you, protect: 'magic' }).max, 10);
  assert.equal(C.npcAttacksOf(gd).find(a => a.kind === 'dragonfire').p, 0.25);
});

test('specials: the dragon dagger twice at 115%, the magic shortbow with 10 more Ranged and 10/7 the accuracy', () => {
  const dd = C.vsNpc({ kind: 'melee', slots: { weapon: 'dragon_dagger' }, mode: 1, levels: lv({ attack: 60, strength: 70, hitpoints: 70 }) }, 'fire_giant_86');
  assert.equal(dd.special.hits, 2);
  assert.equal(dd.special.max, Math.floor((dd.you.maxHit * 115) / 100));
  assert.equal(dd.special.attackRoll, Math.floor((dd.you.attackRoll * 115) / 100));
  assert.equal(dd.special.energy, 25);
  const msb = C.vsNpc({ kind: 'ranged', slots: { weapon: 'magic_shortbow', ammo: 'rune_arrow' }, mode: 1, levels: lv({ ranged: 90, hitpoints: 90 }) }, 'fire_giant_86');
  assert.equal(msb.special.max, Math.floor(((90 + 10) * (49 + 64) + 320) / 640));
  assert.equal(msb.special.attackRoll, Math.floor((msb.you.attackRoll * 10) / 7));
});

test('PvP: the same rolls against their defence; their protect prayer cuts your max hit to 6/10', () => {
  const me = { kind: 'melee', slots: { weapon: 'rune_scimitar' }, mode: 1, levels: lv({ attack: 70, strength: 70, defence: 70, hitpoints: 70 }) };
  const them = { kind: 'melee', slots: { weapon: 'rune_scimitar' }, mode: 1, levels: lv({ attack: 70, strength: 70, defence: 70, hitpoints: 70 }) };
  const even = C.vsPlayer(me, them);
  assert.equal(even.ab.max, even.ba.max);
  assert.ok(even.fight.win > 0.5, 'you hit first');
  const prot = C.vsPlayer(me, { ...them, prayers: { protect: 'protect_from_melee' } });
  assert.equal(prot.ab.max, Math.floor((even.ab.max * 6) / 10));
  assert.ok(prot.fight.win < even.fight.win);
});

test('the best from a bank: what your levels wield, a two-handed weapon without a shield, arrows its bow fires', () => {
  const items = { rune_scimitar: 1, adamant_scimitar: 1, dragon_longsword: 1, rune_kiteshield: 1, rune_2h_sword: 1, amulet_of_strength: 1, rune_platebody: 1, magic_shortbow: 1, maple_shortbow: 1, rune_arrow: 100, adamant_arrow: 100 };
  const low = C.bestFromBank({ kind: 'melee', levels: lv({ attack: 50, strength: 50, defence: 50, hitpoints: 50 }), items, npcId: 'fire_giant_86' });
  assert.notEqual(low.slots.weapon, 'dragon_longsword', 'Attack 60 to wield it');
  assert.ok(['rune_scimitar', 'rune_2h_sword'].includes(low.slots.weapon));
  if (low.slots.weapon === 'rune_2h_sword') assert.equal(low.slots.shield, undefined);
  assert.equal(low.slots.neck, 'amulet_of_strength');
  const r = C.bestFromBank({ kind: 'ranged', levels: lv({ ranged: 45, defence: 45, hitpoints: 50 }), items, npcId: 'fire_giant_86' });
  assert.equal(r.slots.weapon, 'maple_shortbow', 'Ranged 50 for the magic shortbow');
  assert.equal(r.slots.ammo, 'adamant_arrow', "a maple shortbow can't fire rune arrows");
  const q = C.bestFromBank({ kind: 'melee', focus: 'tank', levels: lv({ attack: 50, strength: 50, defence: 50, hitpoints: 50 }), items, npcId: 'fire_giant_86', quests: false });
  assert.equal(q.slots.body, undefined, 'the rune platebody waits for Dragon Slayer');
  const t = C.bestFromBank({ kind: 'melee', focus: 'tank', levels: lv({ attack: 50, strength: 50, defence: 50, hitpoints: 50 }), items, npcId: 'fire_giant_86' });
  assert.equal(t.slots.body, 'rune_platebody');
  assert.equal(t.slots.shield, 'rune_kiteshield');
});

test('attacks to a kill, the quick way (v3.5: a step a piece of even damage at a time) is the same as hit by hit', () => {
  const slow = (hp, pmf) => {
    let alive = new Float64Array(hp + 1); alive[hp] = 1;
    const out = [];
    for (let n = 1; n <= 400; n++) {
      const next = new Float64Array(hp + 1); let killed = 0;
      for (let h = 1; h <= hp; h++) for (let k = 0; k < pmf.length; k++) { const q = alive[h] * pmf[k]; if (!q) continue; if (k >= h) killed += q; else next[h - k] += q; }
      out.push(killed); alive = next;
    }
    return out;
  };
  // (a monster's attacks mixed: melee three times in four, dragonfire the fourth)
  const mix = C.npcVsYou(C.npcOf('green_dragon_79'), { ...C.playerStats({ kind: 'melee', slots: {}, levels: lv({ defence: 40 }) }), slots: {} }).pmf;
  for (const [hp, pmf] of [[7, C.damagePmf(0.6, 3)], [45, C.damagePmf(0.3, 17)], [99, mix]]) {
    const quick = C.attacksToKill(hp, pmf, { most: 400, tail: 0 }).pmf, sure = slow(hp, pmf);
    assert.ok(quick.every((v, i) => Math.abs(v - sure[i]) < 1e-12), `${hp}`);
  }
});

test('specials in PvP: against their defence roll, their protect prayer cutting the max; the magic shortbow rolls against your own Ranged defence', () => {
  const me = { kind: 'melee', slots: { weapon: 'dragon_dagger' }, mode: 1, levels: lv({ attack: 70, strength: 70, defence: 40, hitpoints: 70, ranged: 30 }) };
  const them = { kind: 'melee', slots: { weapon: 'rune_scimitar', body: 'rune_platebody' }, mode: 1, levels: lv({ attack: 60, strength: 60, defence: 60, hitpoints: 60, prayer: 43 }) };
  const r = C.vsPlayer(me, them);
  assert.equal(r.special.hits, 2);
  assert.equal(r.special.defenceRoll, r.them.defence.slash, 'the dragon dagger rolls against slash');
  assert.equal(r.special.max, Math.floor((r.you.maxHit * 115) / 100));
  const prayed = C.vsPlayer(me, { ...them, prayers: { protect: 'protect_from_melee' } });
  assert.equal(prayed.special.max, Math.floor((Math.floor((r.you.maxHit * 115) / 100) * 6) / 10));
  assert.ok(prayed.special.protected);
  assert.equal(r.theirSpecial, null, 'a rune scimitar has none');
  const msb = C.vsPlayer({ kind: 'ranged', slots: { weapon: 'magic_shortbow', ammo: 'rune_arrow' }, mode: 1, levels: lv({ ranged: 80, defence: 20, hitpoints: 70 }) }, them);
  assert.equal(msb.special.defenceRoll, msb.you.defence.ranged);
  assert.notEqual(msb.special.defenceRoll, msb.them.defence.ranged);
  assert.ok(msb.special.ownDefence);
  assert.ok(Number.isFinite(r.attacks) && Number.isFinite(r.theirAttacks));
});

test("a goal's style on a weapon (modeFor), the strongest spell you cast, and what a ranged setup shoots", () => {
  const scim = { weapon: 'rune_scimitar' };
  assert.equal(C.modeFor(scim, 'accurate', 1), 0);
  assert.equal(C.modeFor(scim, 'aggressive', 0), 1);
  assert.equal(C.modeFor(scim, 'controlled', 0), 2);
  assert.equal(C.modeFor(scim, 'defensive', 0), 3);
  assert.equal(C.modeFor({ weapon: 'dragon_spear' }, 'aggressive'), null, 'a spear has no Aggressive');
  // (the same kind of hit as the setup's: a rune 2h on Smash, crush, stays crush for Aggressive)
  assert.equal(WEAPON_STYLES['2h_sword'].modes[C.modeFor({ weapon: 'rune_2h_sword' }, 'aggressive', 2)].type, 'crush');
  assert.equal(C.modeFor({ weapon: 'magic_shortbow' }, 'rapid', 0), 0, 'Accurate is as good for the XP');
  assert.equal(C.bestSpell(59), 'fire_blast');
  assert.equal(C.bestSpell(60, { weapon: 'saradomin_staff' }), 'saradomin_strike');
  assert.equal(C.bestSpell(50, { weapon: 'ibanstaff' }), 'iban_blast');
  assert.equal(C.bestSpell(39), 'fire_bolt', 'Crumble Undead only on the undead');
  assert.equal(C.bestSpell(39, {}, { undead: true }), 'fire_bolt', '(and its 8 is less than Fire Bolt\'s 12)');
  const bow = C.rangedGearOf({ weapon: 'magic_shortbow', ammo: 'rune_arrow', body: 'dragonhide_body', legs: 'dragonhide_chaps', hands: 'dragon_vambraces' });
  assert.deepEqual([bow.ammo, bow.attack, bow.strength, bow.rate, bow.problem], ['rune_arrow', 69 + 31, 49, 4, null]);
  const knife = C.rangedGearOf({ weapon: 'rune_knife', ammo: 'rune_arrow' });
  assert.deepEqual([knife.ammo, knife.strength], ['rune_knife', 24]);
  assert.equal(C.rangedGearOf({ weapon: 'maple_shortbow', ammo: 'rune_arrow' }).problem, 'weak');
  assert.equal(C.rangedGearOf({ weapon: 'maple_shortbow' }).problem, 'ammo');
  assert.equal(C.rangedGearOf({ weapon: 'rune_scimitar' }).problem, 'none');
});

test('the best from a bank for damage still wears armour (the least damage taken breaks a tie), and with no monster the best defence on average', () => {
  const items = { rune_scimitar: 1, rune_platebody: 1, rune_full_helm: 1, rune_kiteshield: 1, amulet_of_strength: 1, leather_boots: 1 };
  const levels = lv({ attack: 60, strength: 60, defence: 60, hitpoints: 60 });
  for (const npcId of ['giant_28', null]) {
    const r = C.bestFromBank({ kind: 'melee', levels, items, npcId });
    assert.deepEqual(Object.keys(r.slots).sort(), ['body', 'feet', 'head', 'neck', 'shield', 'weapon'], `${npcId}`);
  }
  assert.equal(C.bestFromBank({ kind: 'melee', levels, items: {} }).slots.weapon, undefined, 'nothing: unarmed');
});

test('a ranging potion on a Ranged goal (ranged.js boost): its shots are the boosted level\'s', () => {
  const mon = { id: 'moss_giant_42', hp: 60, defence: 30, rangeDefence: 0 };
  const gear = { attack: 69, strength: 49 };
  const boost = l => C.boostedLevels({ ranged: l }, ['range']).ranged;
  assert.equal(boost(55), 55 + 4 + 5);
  assert.deepEqual(killAt(mon, 55, { style: 'rapid', gear, boost }), killAt(mon, 64, { style: 'rapid', gear }));
});

test("the Gear tab's numbers as they're shown: chances, a fight's odds, times", async () => {
  const { hitPct, winPct, timeText } = await import('./gear-ui.js');
  assert.deepEqual([0.999, 0.004, 0.5, 1, 0].map(hitPct), ['99%', 'under 1%', '50%', '100%', '0%']);
  assert.deepEqual([0.9996, 0.993, 0.5, 0.004, 0.0004, 1].map(winPct), ['over 99.9%', '99.3%', '50%', '0.4%', 'under 0.1%', '100%']);
  assert.deepEqual([3.21, 13, 59.4, 59.6, 1019.98, 3569, 7200, 7290, Infinity].map(timeText), ['3.2 s', '13 s', '59 s', '1 min', '17 min', '59 min 29 s', '2 h', '2 h 2 min', 'never']);
});

test("a fight one side can't win: no damage to the other, no chance; no damage from it, no end but a win (v3.5)", () => {
  const pmf = C.damagePmf(0.5, 10), none = C.damagePmf(0, 10);
  const safe = C.fightOf({ yourPmf: pmf, yourHp: 10, yourSpeed: 4 }, { theirPmf: none, theirHp: 500, theirSpeed: 4 });
  assert.deepEqual([safe.win, safe.hpLost, safe.them.mean], [1, 0, Infinity]);
  const hopeless = C.fightOf({ yourPmf: none, yourHp: 99, yourSpeed: 4 }, { theirPmf: pmf, theirHp: 10, theirSpeed: 4 });
  assert.deepEqual([hopeless.win, hopeless.you.mean], [0, Infinity]);
  // (a long fight counted only as far as it matters: a level 1 against the King Black Dragon, quickly)
  const t0 = performance.now();
  const kbd = C.vsNpc({ kind: 'magic', slots: {}, spell: 'wind_strike', levels: lv() }, 'king_black_dragon_276');
  assert.ok(performance.now() - t0 < 100, `${performance.now() - t0} ms`);
  assert.ok(kbd.fight.win < 1e-6);
  // a monster's shares of attacks add up to one (the data's thirds are 0.333333)
  assert.ok(Math.abs(C.npcAttacksOf(C.npcOf('kalphite_queen_333')).reduce((a, x) => a + x.p, 0) - 1) < 1e-12);
});
