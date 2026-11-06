// Planner+ Gear tab (v3.5): what you wear and how it fights, by the server's own sums (combat.js, with
// geardata.js that build-gear.mjs reads from the server's scripts). Like the game's Worn Equipment screen and
// the DPS calculators players use: three setups (Melee, Ranged, Magic) at your levels from the hiscores (a level
// typed in is a what-if), with your prayers and potions, the bonuses they add up to, and how they do against a
// monster or another player: your max hit, how often you hit, your damage a second, how long a kill takes, how
// it hits you back, and your chance to win a fight to the death. Best from my bank picks what you'd wear from
// what you have, for damage or for tanking. A monster's page on the NPCs tab shows the same for each setup, and
// goals ask it for their tips (a Ranged goal's ammo; how often your hits land on what a combat goal kills).
// Created by planner-ui.js with what it shares (P), as npc-ui.js is.
//
// Per account, gear.<account>: { kind (the setup shown: melee, ranged or magic), setups: { melee, ranged, magic:
// { slots: { slot: item }, mode (the weapon's style: an index into its modes), spell, prayers: { attack,
// strength, defence, protect }, potions: [ids], antifire, charge } }, levels: { skill: level } (what-ifs over
// the hiscores'), quests (whether the quests some items wait for count as done), vs: 'npc' | 'player', npc (the
// monster), pvp: { name, levels (what-ifs over theirs), gear: 'same' (yours) | 'own', setup (theirs, with its
// kind) }, migrated (a v3.4 Ranged goal's bow and ammo have been taken over) }

import { EQUIPMENT, PRAYERS, POTIONS, COMBAT_SPELLS, RULES, BONUSES } from './geardata.js';
import { ITEMS, MONSTERS } from './gamedata.js';
import { NPC_INFO } from './npcdata.js';
import * as C from './combat.js';
import { SKILL_BY_KEY, combatFromProfile, combatLevel } from './skills.js';
import { store } from './store.js';
import { toSafeName, toDisplayName, checkName } from './api.js';

export const KINDS = ['melee', 'ranged', 'magic'];
const KIND_NAME = { melee: 'Melee', ranged: 'Ranged', magic: 'Magic' };
const LEVELS = ['attack', 'strength', 'defence', 'hitpoints', 'ranged', 'magic', 'prayer'];
const SLOT_NAME = { head: 'Head', cape: 'Cape', neck: 'Neck', weapon: 'Weapon', body: 'Body', shield: 'Shield', legs: 'Legs', hands: 'Hands', feet: 'Feet', ring: 'Ring', ammo: 'Ammo' };
// The Worn Equipment screen's layout: [column, row]
const GRID = { head: [2, 1], cape: [1, 2], neck: [2, 2], ammo: [3, 2], weapon: [1, 3], body: [2, 3], shield: [3, 3], legs: [2, 4], hands: [1, 5], feet: [2, 5], ring: [3, 5] };
const STYLE_NAME = { accurate: 'Accurate', aggressive: 'Aggressive', defensive: 'Defensive', controlled: 'Controlled', rapid: 'Rapid', longrange: 'Longrange' };
// What a style adds (combat_get_damagestyle_bonuses): melee's to Attack, Strength or Defence, Ranged's to Ranged
const styleTip = (style, ranged) => ({
  accurate: ranged ? '+3 Ranged' : '+3 Attack', aggressive: '+3 Strength', defensive: '+3 Defence', controlled: '+1 Attack, Strength and Defence',
  rapid: 'a tick faster', longrange: '+3 Defence, and further away',
}[style] || '');
const PRAYER_BY = new Map(PRAYERS.map(p => [p.id, p]));
const POTION_BY = new Map(POTIONS.map(p => [p.id, p]));
// The potions each setup has use for (Defence's in all of them)
const POTIONS_FOR = {
  melee: ['attack', 'super_attack', 'strength', 'super_strength', 'defence', 'super_defence'],
  ranged: ['range', 'defence', 'super_defence'],
  magic: ['magic', 'defence', 'super_defence'],
};
const PRAYERS_FOR = { melee: ['attack', 'strength', 'defence'], ranged: ['defence'], magic: ['defence'] };
const B = Object.fromEntries(BONUSES.map((k, i) => [k, i]));
const TYPES5 = ['stab', 'slash', 'crush', 'magic', 'ranged'];
const MONSTER_BY_ID = new Map(MONSTERS.map(m => [m.id, m]));
const monsterName = m => `${m.name} (level ${m.level})`;
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
const aWord = name => (/^[aeiou]/i.test(name) ? 'an' : 'a');
const listText = (list, and = 'and') => (list.length > 1 ? `${list.slice(0, -1).join(', ')} ${and} ${list[list.length - 1]}` : list[0] || '');

// ── Numbers as they're shown ──────────────────────────────────────────────
// A chance in whole percents: 99% rather than 100% for one that isn't sure, and none rounded to 0%
export const hitPct = p => { const r = Math.round(p * 100); return r >= 100 && p < 1 ? '99%' : r <= 0 && p > 0 ? 'under 1%' : `${r}%`; };
// A fight's chance: to a tenth near the ends, where it's most of what matters
export function winPct(p) {
  if (p >= 1) return '100%';
  if (p <= 0) return '0%';
  if (p > 0.999) return 'over 99.9%';
  if (p < 0.001) return 'under 0.1%';
  if (p > 0.99 || p < 0.01) return `${(p * 100).toFixed(1)}%`;
  return `${Math.round(p * 100)}%`;
}
const dec = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '–');
// 4.8 s, 1 min 12 s, 2 h 5 min
export function timeText(sec) {
  if (!Number.isFinite(sec)) return 'never';
  if (sec < 9.95) return `${sec.toFixed(1)} s`;
  if (sec < 59.5) return `${Math.round(sec)} s`;
  if (sec < 3570) { const t = Math.round(sec), mm = Math.floor(t / 60), ss = t % 60; return ss ? `${mm} min ${ss} s` : `${mm} min`; }
  const m = Math.round(sec / 60);
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}
const signed = n => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
// "5.6 attacks", "1,240 attacks"
const attacksText = n => `${n >= 100 ? Math.round(n).toLocaleString('en-US') : n.toFixed(1)} attacks`;

export function createGearUi(P) {
  const { esc, fmt, iconImg, itemName, S, $ } = P;
  // An item's icon without its own tooltip (the button it's on has one)
  const icon = (id, small = false) => P.itemIcon(id, small).replace(/ title="[^"]*"/, '');
  const nameOf = id => ITEMS[id]?.name || id;
  // "Rune arrows", "Rune knives"
  const plural = id => { const n = nameOf(id); return /s$/.test(n) ? n : `${n.replace(/knife$/i, 'knive')}s`; };
  // (what keeps a dragon's fire off: the server's antidragonbreathshield, a "Dragonfire shield" in this version)
  const SHIELD = 'antidragonbreathshield';

  // ── What's kept ─────────────────────────────────────────────────────────
  const blankSetup = () => ({ slots: {}, mode: 0, spell: null, prayers: {}, potions: [], antifire: false, charge: false });
  function cleanSetup(x) {
    const s = blankSetup();
    if (!x || typeof x !== 'object') return s;
    for (const slot of C.SLOTS) { const id = x.slots?.[slot]; if (EQUIPMENT[id]?.s === slot) s.slots[slot] = id; }
    if (Number.isInteger(x.mode) && x.mode >= 0 && x.mode < 8) s.mode = x.mode;
    if (C.SPELL.has(x.spell)) s.spell = x.spell;
    for (const k of ['attack', 'strength', 'defence']) if (PRAYER_BY.get(x.prayers?.[k])?.[k]) s.prayers[k] = x.prayers[k];
    if (PRAYER_BY.get(x.prayers?.protect)?.protect) s.prayers.protect = x.prayers.protect;
    if (Array.isArray(x.potions)) s.potions = [...new Set(x.potions.filter(id => POTION_BY.has(id)))];
    s.antifire = !!x.antifire;
    s.charge = !!x.charge;
    return s;
  }
  const okLevel = (k, v) => Number.isInteger(v) && v >= (k === 'hitpoints' ? 10 : 1) && v <= 99;
  const storeKey = () => 'gear.' + P.safe();
  function gearState() {
    if (!P.safe()) return null;
    const raw = store.get(storeKey(), null) || {};
    const g = {
      kind: KINDS.includes(raw.kind) ? raw.kind : 'melee',
      setups: Object.fromEntries(KINDS.map(k => [k, cleanSetup(raw.setups?.[k])])),
      levels: {},
      quests: raw.quests !== false,
      vs: raw.vs === 'player' ? 'player' : 'npc',
      npc: MONSTER_BY_ID.has(raw.npc) ? raw.npc : null,
      pvp: {
        name: typeof raw.pvp?.name === 'string' && !checkName(raw.pvp.name) ? toDisplayName(raw.pvp.name) : '',
        levels: {},
        gear: raw.pvp?.gear === 'own' ? 'own' : 'same',
        setup: raw.pvp?.setup ? { ...cleanSetup(raw.pvp.setup), kind: KINDS.includes(raw.pvp.setup.kind) ? raw.pvp.setup.kind : 'melee' } : null,
      },
      migrated: !!raw.migrated,
    };
    for (const k of LEVELS) { if (okLevel(k, raw.levels?.[k])) g.levels[k] = raw.levels[k]; if (okLevel(k, raw.pvp?.levels?.[k])) g.pvp.levels[k] = raw.pvp.levels[k]; }
    if (!g.migrated) migrate(g);
    return g;
  }
  const saveGear = g => store.set(storeKey(), g);
  function update(fn) {
    const g = gearState();
    if (!g) return null;
    fn(g);
    saveGear(g);
    return g;
  }
  // (v3.4 → v3.5) A Ranged goal's bow and ammo, picked under its Ammo, are the Ranged setup's to begin with.
  // The armour bonus typed there is what the rest of the setup now adds up to.
  function migrate(g) {
    g.migrated = true;
    const a = P.goals().find(x => x.skill === 'ranged' && x.ammo && (x.ammo.ammo || x.ammo.bow || x.ammo.fight))?.ammo;
    const r = g.setups.ranged;
    if (a && !Object.keys(r.slots).length) {
      if ((a.kind || 'arrows') === 'arrows') {
        if (EQUIPMENT[a.bow]?.s === 'weapon') r.slots.weapon = a.bow;
        if (EQUIPMENT[a.ammo]?.s === 'ammo') r.slots.ammo = a.ammo;
      } else if (EQUIPMENT[a.ammo]?.s === 'weapon') r.slots.weapon = a.ammo;
      const i = C.modesOf(r.slots).findIndex(m => m.style === (a.fight === 'accurate' ? 'accurate' : 'rapid'));
      if (i >= 0) r.mode = i;
    }
    saveGear(g);
  }

  // What's only on screen: the slot being changed ({ side, slot }), what's typed in its search, what Best from
  // my bank just did (and its undo), and players looked up for PvP.
  const U = { pick: null, q: '', note: null, undo: null, busy: false, error: null, tried: new Set(), problem: null };
  const profiles = new Map();

  // ── Levels ──────────────────────────────────────────────────────────────
  function realLevels() {
    const out = {};
    for (const k of LEVELS) out[k] = P.currentOf(k)?.level ?? (k === 'hitpoints' ? 10 : 1);
    return out;
  }
  const myLevels = g => ({ ...realLevels(), ...g.levels });
  function profileLevels(p) {
    const lv = {};
    for (const k of LEVELS) { const st = p.stats[SKILL_BY_KEY.get(k).id]; if (st) lv[k] = st.level; }
    return combatFromProfile(lv, p.stats[0]?.level).low;
  }
  const theirProfile = g => (g.pvp.name ? profiles.get(toSafeName(g.pvp.name)) || null : null);
  const theirReal = g => { const p = theirProfile(g); return p ? profileLevels(p) : { attack: 1, strength: 1, defence: 1, hitpoints: 10, ranged: 1, magic: 1, prayer: 1 }; };
  const theirLevels = g => ({ ...theirReal(g), ...g.pvp.levels });

  // A setup as combat.js counts it, with its spell (the strongest you can cast, till one's picked)
  function withSpell(s) {
    if (s.kind !== 'magic') return s;
    const sp = C.SPELL.get(s.spell);
    const fits = sp && (!sp.staff || s.slots.weapon === sp.staff);
    return fits ? s : { ...s, spell: C.bestSpell(s.levels.magic, s.slots) };
  }
  const setupOf = (g, kind = g.kind) => withSpell({ ...g.setups[kind], kind, levels: myLevels(g) });
  const theirKind = g => (g.pvp.gear === 'own' && g.pvp.setup ? g.pvp.setup.kind : g.kind);
  const theirSetup = g => (g.pvp.gear === 'own' && g.pvp.setup ? withSpell({ ...g.pvp.setup, levels: theirLevels(g) }) : { ...setupOf(g), levels: theirLevels(g) });
  // Whether a setup has been set up at all (something worn, or a spell picked)
  const used = (g, kind) => !!(Object.keys(g.setups[kind].slots).length || g.setups[kind].spell);
  const sideSetup = (g, side) => (side === 'them' ? g.pvp.setup : g.setups[g.kind]);
  const sideKind = (g, side) => (side === 'them' ? theirKind(g) : g.kind);

  // ── Items ───────────────────────────────────────────────────────────────
  const bonusOf = (e, k) => e?.b?.[B[k]] ?? 0;
  // What an item adds, all of it (its tooltip)
  function bonusText(id) {
    const e = EQUIPMENT[id];
    if (!e?.b) return 'No bonuses';
    const att = TYPES5.map((t, i) => [t, e.b[i]]).filter(([, v]) => v);
    const def = TYPES5.map((t, i) => [t, e.b[5 + i]]).filter(([, v]) => v);
    const out = [];
    if (att.length) out.push(`Attack: ${att.map(([t, v]) => `${t} ${signed(v)}`).join(', ')}`);
    if (def.length) out.push(`Defence: ${def.map(([t, v]) => `${t} ${signed(v)}`).join(', ')}`);
    const other = [['Strength', bonusOf(e, 'strengthbonus')], ['Ranged strength', bonusOf(e, 'rangebonus')], ['Prayer', bonusOf(e, 'prayerbonus')]].filter(([, v]) => v);
    if (other.length) out.push(other.map(([t, v]) => `${t} ${signed(v)}`).join(', '));
    return out.join('\n') || 'No bonuses';
  }
  // The few numbers that matter for a setup, on its line in the list
  function bonusLine(kind, e) {
    const v = k => bonusOf(e, k), parts = [];
    if (e.s === 'weapon' || e.s === 'ammo' || kind !== 'melee') {
      if (kind === 'melee') {
        const att = ['stabattack', 'slashattack', 'crushattack'].map(v), best = Math.max(...att);
        if (best) parts.push(`${signed(best)} ${['stab', 'slash', 'crush'][att.indexOf(best)]}`);
        if (v('strengthbonus')) parts.push(`${signed(v('strengthbonus'))} strength`);
      }
      if (kind === 'ranged') {
        if (v('rangeattack')) parts.push(`${signed(v('rangeattack'))} ranged`);
        if (v('rangebonus')) parts.push(`${v('rangebonus')} ranged strength`);
      }
      if (kind === 'magic' && v('magicattack')) parts.push(`${signed(v('magicattack'))} magic`);
    }
    if (e.s !== 'weapon' && e.s !== 'ammo') {
      const d = ['stabdefence', 'slashdefence', 'crushdefence'].map(v);
      if (d.some(Boolean)) parts.push(`def ${d.map(signed).join('/')}`);
      if (v('rangedefence')) parts.push(`ranged def ${signed(v('rangedefence'))}`);
      if (v('magicdefence')) parts.push(`magic def ${signed(v('magicdefence'))}`);
    }
    if (v('prayerbonus')) parts.push(`prayer ${signed(v('prayerbonus'))}`);
    if (e.s === 'weapon') parts.push(`${e.r ?? 4} ticks${e.two ? ', both hands' : ''}`);
    if (e.spec) parts.push('special');
    return parts.join(' · ');
  }
  // How much an item does for a setup: the list's order
  function relevance(kind, e) {
    const v = k => bonusOf(e, k);
    const def = (v('stabdefence') + v('slashdefence') + v('crushdefence') + v('rangedefence') + v('magicdefence')) / 5;
    if (kind === 'ranged') return v('rangeattack') + 1.5 * v('rangebonus') + def / 4;
    if (kind === 'magic') return 2 * v('magicattack') + def / 4;
    return Math.max(v('stabattack'), v('slashattack'), v('crushattack')) + 1.5 * v('strengthbonus') + def / 4;
  }
  const fitsKind = (kind, id) => (kind === 'ranged' ? !!EQUIPMENT[id]?.ranged : !EQUIPMENT[id]?.ranged);
  // "Defence 40 and Dragon Slayer"
  function needText(bad, levels) {
    const parts = Object.entries(bad.short).map(([sk, lv]) => `${SKILL_BY_KEY.get(sk)?.name || cap(sk)} ${lv}${levels ? ` (you're ${levels[sk] ?? 1})` : ''}`);
    if (bad.quest) parts.push(bad.quest);
    return listText(parts);
  }

  // ── Changing what's worn ────────────────────────────────────────────────
  // (a two-handed weapon takes the shield off, and a shield a two-handed weapon; a new weapon keeps the style
  // if it has one like it)
  function wear(st, slot, id) {
    const before = C.modesOf(st.slots)[st.mode];
    if (id) st.slots[slot] = id; else delete st.slots[slot];
    if (slot === 'weapon' && EQUIPMENT[id]?.two) delete st.slots.shield;
    if (slot === 'shield' && id && EQUIPMENT[st.slots.weapon]?.two) delete st.slots.weapon;
    if (slot === 'weapon') {
      const modes = C.modesOf(st.slots);
      let i = before ? modes.findIndex(m => m.style === before.style && m.type === before.type) : -1;
      if (i < 0 && before) i = modes.findIndex(m => m.style === before.style);
      st.mode = i >= 0 ? i : modes.findIndex(m => m.style === 'rapid') >= 0 && EQUIPMENT[id]?.ranged ? modes.findIndex(m => m.style === 'rapid') : 0;
    }
  }

  // ── The tab ─────────────────────────────────────────────────────────────
  function renderGear() {
    P.renderAccount('gear-account', 'gear');
    const body = $('gear-body');
    if (!body) return;
    if (!P.account()) { body.innerHTML = ''; return; }
    const g = gearState();
    // (a player looked up before: looked up again, once, when the tab's back)
    if (g.vs === 'player' && g.pvp.name && !profiles.has(toSafeName(g.pvp.name)) && !U.busy && !U.tried.has(toSafeName(g.pvp.name))) lookUp(g.pvp.name, true);
    const scroll = body.querySelector('.gear-opts')?.scrollTop;
    body.innerHTML = setupCard(g) + vsCard(g);
    const opts = body.querySelector('.gear-opts');
    if (opts && scroll) opts.scrollTop = scroll;
    applyFind();
  }

  // Your setup: which of the three, what's worn, your levels, style, prayers, potions and bonuses
  function setupCard(g) {
    const kindSeg = `<div class="seg gear-kinds" role="group" aria-label="Which setup">${KINDS.map(k => `<button type="button" data-gear-kind="${k}" data-side="you" class="${k === g.kind ? 'on' : ''}" aria-pressed="${k === g.kind}" title="${esc(`Your ${k} setup${used(g, k) ? '' : ': nothing set up yet'}`)}">${KIND_NAME[k]}</button>`).join('')}</div>`;
    const best = `<span class="gear-best"><span class="c-muted small-note">Best from my bank:</span>
        <button type="button" class="btn small" data-gear-best="damage" title="${esc(`Wear what in your bank does the most damage a second${g.vs === 'npc' && g.npc ? ` to ${MONSTER_BY_ID.get(g.npc).name}` : ''}, that your levels can wield`)}">For damage</button>
        <button type="button" class="btn small" data-gear-best="tank" title="${esc(`Wear what in your bank takes the least damage${g.vs === 'npc' && g.npc ? ` from ${MONSTER_BY_ID.get(g.npc).name}` : ''} (then does the most), that your levels can wield`)}">For tanking</button></span>`;
    const quests = `<label class="check" title="Some items wait for a quest: a rune platebody for Dragon Slayer, a dragon scimitar for Monkey Madness's, dragon weapons for Lost City and Heroes' Quest. Ticked, they count as yours to wear; unticked, Best from my bank leaves them out and the lists mark them."><input type="checkbox" data-gear-quests="1"${g.quests ? ' checked' : ''}> Quests done</label>`;
    const note = U.note && U.note.kind === g.kind ? `<div class="msg ${U.note.ok ? 'ok' : ''} gear-note">${U.note.html}${U.undo && U.undo.kind === g.kind ? ' <button type="button" class="linkish" data-gear-undo="1">Undo</button>' : ''}</div>` : '';
    return `<div class="card gear-card">
      <div class="bar wrap gear-top">${kindSeg}${best}${quests}</div>
      ${note}
      ${levelsHtml(myLevels(g), realLevels(), g.setups[g.kind].potions, 'data-gear-level', Object.keys(g.levels).length ? '<button type="button" class="linkish small-note" data-gear-reset="you">Back to your levels</button>' : '')}
      ${setupBody(g, 'you')}
    </div>`;
  }

  // The levels a setup is counted at: yours from the hiscores (or a player's), a level typed in a what-if, and
  // what a potion makes of it beside it
  function levelsHtml(levels, real, potions, attr, extra = '') {
    const boosted = C.boostedLevels(levels, potions);
    return `<div class="gear-levels">${LEVELS.map(k => {
      const s = SKILL_BY_KEY.get(k);
      const what = levels[k] !== real[k];
      const up = boosted[k] > levels[k] ? boosted[k] : null;
      const title = `${s.name}: ${what ? `${levels[k]}, a what-if (${real[k]} on the hiscores). Empty the box to go back.` : `${real[k]}. Type another level to see what it would do.`}${up ? `\nWith your potion: ${up}` : ''}`;
      return `<label class="gear-lv${what ? ' whatif' : ''}" title="${esc(title)}">${iconImg(s)}<input class="input small" ${attr}="${k}" inputmode="numeric" maxlength="2" value="${what ? levels[k] : ''}" placeholder="${real[k]}" aria-label="${esc(s.name)}">${up ? `<span class="gear-up">${up}</span>` : ''}</label>`;
    }).join('')}${extra}</div>`;
  }

  // What's worn and how it's used, for you or (PvP, their own gear) them
  function setupBody(g, side) {
    const kind = sideKind(g, side), st = sideSetup(g, side);
    const full = side === 'them' ? theirSetup(g) : setupOf(g);
    const levels = full.levels;
    const stats = C.playerStats(full);
    const bonus = C.bonusesOf(st.slots);
    const warn = warnings(g, kind, st, full, stats);
    return `<div class="gear-body">
      <div class="gear-left">
        ${wornHtml(st.slots, side, levels, g.quests)}
        <div class="c-faint small-note gear-hint">${U.pick?.side === side ? `Pick what to wear on your ${SLOT_NAME[U.pick.slot].toLowerCase()}.` : 'Click a slot to wear something.'}</div>
      </div>
      <div class="gear-right">${U.pick?.side === side ? pickerHtml(g, side, kind, st, levels) : `
        ${styleHtml(kind, st, full, stats, side, levels)}
        ${prayersHtml(kind, st, side, levels)}
        ${potionsHtml(kind, st, side)}
        ${bonusesHtml(bonus)}
        ${warn.map(w => `<div class="c-lose small-note gear-warn">${w}</div>`).join('')}`}
      </div>
    </div>`;
  }

  function wornHtml(slots, side, levels, quests) {
    return `<div class="gear-worn" role="group" aria-label="Worn equipment">${C.SLOTS.map(s => {
      const id = slots[s], [c, r] = GRID[s];
      const open = U.pick?.side === side && U.pick.slot === s;
      const bad = id ? C.wieldProblem(id, levels, { quests }) : null;
      const title = id ? `${SLOT_NAME[s]}: ${nameOf(id)}\n${bonusText(id)}${bad ? `\nNeeds ${needText(bad)}` : ''}\nClick to change it` : `${SLOT_NAME[s]}: nothing\nClick to wear something`;
      return `<button type="button" class="gear-slot${open ? ' on' : ''}${id ? ' has' : ''}${bad ? ' bad' : ''}" style="grid-area:${r} / ${c}" data-gear-slot="${s}" data-side="${side}" title="${esc(title)}" aria-label="${esc(`${SLOT_NAME[s]}: ${id ? nameOf(id) : 'nothing'}`)}" aria-pressed="${open}">${id ? icon(id) : `<span class="gs-empty">${SLOT_NAME[s]}</span>`}</button>`;
    }).join('')}</div>`;
  }

  // The items for a slot: what's in your bank first, then everything else, the most use to this setup first
  function pickerHtml(g, side, kind, st, levels) {
    const slot = U.pick.slot;
    const have = P.bank().items || {};
    const rows = Object.entries(EQUIPMENT).filter(([id, e]) => e.s === slot && ITEMS[id] && (slot !== 'weapon' || fitsKind(kind, id)))
      .map(([id, e]) => ({ id, e, n: have[id] || 0, bad: C.wieldProblem(id, levels, { quests: g.quests }), score: relevance(kind, e) }))
      .sort((a, b) => (!a.bad - !b.bad) * -1 || b.score - a.score || nameOf(a.id).localeCompare(nameOf(b.id)));
    const line = r => `<button type="button" class="gear-opt${r.id === st.slots[slot] ? ' on' : ''}${r.bad ? ' bad' : ''}" data-gear-wear="${esc(r.id)}" data-find="${esc(nameOf(r.id).toLowerCase())}" title="${esc(`${nameOf(r.id)}\n${bonusText(r.id)}${r.bad ? `\nNeeds ${needText(r.bad)}` : ''}${r.n ? `\nYou have ${fmt(r.n)}` : ''}`)}">
        ${icon(r.id, true)}<span class="go-name">${itemName(r.id)}</span><span class="go-b">${esc(bonusLine(kind, r.e))}</span>${r.bad ? `<span class="go-need">${esc(needText(r.bad))}</span>` : ''}${r.n ? `<span class="go-n">${fmt(r.n)} in bank</span>` : ''}</button>`;
    const mine = rows.filter(r => r.n > 0), rest = rows.filter(r => !r.n);
    const what = slot === 'weapon' ? (kind === 'ranged' ? 'bows, crossbows and what\'s thrown' : 'weapons') : `${SLOT_NAME[slot].toLowerCase()} slot items`;
    return `<div class="gear-pick" data-gear-pick="${slot}">
      <div class="bar wrap"><b class="gear-pick-h">${SLOT_NAME[slot]}</b>
        <input class="input small gear-find" type="search" data-gear-find="1" value="${esc(U.q)}" placeholder="Find one by name" aria-label="Find an item" autocomplete="off" spellcheck="false">
        ${st.slots[slot] ? '<button type="button" class="btn small" data-gear-off="1">Take it off</button>' : ''}
        <button type="button" class="linkish small-note" data-gear-close="1">Close</button></div>
      <div class="gear-opts">
        ${mine.length ? `<div class="gear-opt-h">In your bank</div>${mine.map(line).join('')}` : ''}
        <div class="gear-opt-h">${mine.length ? 'Everything else' : `Every one of the ${what}`}</div>${rest.map(line).join('')}
        <div class="c-faint small-note gear-none" hidden>Nothing by that name for this slot.</div>
      </div>
    </div>`;
  }
  // The list's search: lines shown or hidden where they are (typing never redraws it)
  function applyFind() {
    const box = document.querySelector('#gear-body .gear-opts');
    if (!box) return;
    const terms = P.searchTerms(U.q);
    let n = 0;
    for (const b of box.querySelectorAll('[data-gear-wear]')) { const on = terms.every(t => b.dataset.find.includes(t)); b.hidden = !on; if (on) n++; }
    for (const h of box.querySelectorAll('.gear-opt-h')) {
      let el = h.nextElementSibling, any = false;
      while (el && !el.classList.contains('gear-opt-h')) { if (el.dataset.gearWear && !el.hidden) any = true; el = el.nextElementSibling; }
      h.hidden = !any;
    }
    const none = box.querySelector('.gear-none');
    if (none) none.hidden = n > 0;
  }

  function styleHtml(kind, st, full, stats, side, levels) {
    const modes = C.modesOf(st.slots);
    const mi = Math.min(Math.max(0, st.mode | 0), modes.length - 1);
    const label = m => (m.type === 'ranged' ? m.name : `${m.name}: ${STYLE_NAME[m.style].toLowerCase()} ${m.type}`);
    const ranged = modes[mi].type === 'ranged';
    const modeSel = `<select class="input small" data-gear-mode="${side}" aria-label="Combat style" title="${esc(modes.map(m => `${label(m)}: ${styleTip(m.style, m.type === 'ranged')}`).join('\n'))}">${modes.map((m, i) => `<option value="${i}"${i === mi ? ' selected' : ''}>${esc(label(m))}</option>`).join('')}</select>`;
    if (kind !== 'magic') {
      return `<div class="gear-row"><span class="c-muted">Style</span> ${modeSel} <span class="c-faint small-note">${esc(styleTip(modes[mi].style, ranged))} · an attack every ${dec(stats.speed * 0.6, 1)} s</span></div>`;
    }
    const spells = COMBAT_SPELLS.map(sp => {
      const lack = sp.level > (levels.magic ?? 1) ? `Magic ${sp.level}` : sp.staff && st.slots.weapon !== sp.staff ? `wield ${aWord(nameOf(sp.staff))} ${nameOf(sp.staff)}` : '';
      return `<option value="${sp.id}"${sp.id === full.spell ? ' selected' : ''}${lack ? ' disabled' : ''}>${esc(`${sp.name}: up to ${sp.max}${lack ? ` (${lack})` : ''}`)}</option>`;
    }).join('');
    const sp = C.SPELL.get(full.spell);
    const charge = sp?.charged ? `<label class="check" title="${esc(`Charge (Magic 80) makes ${sp.name} hit up to ${sp.charged} while you wear the ${cap(sp.god)} cape and staff`)}"><input type="checkbox" data-gear-charge="${side}"${st.charge ? ' checked' : ''}> Charged</label>` : '';
    return `<div class="gear-row"><span class="c-muted">Spell</span> <select class="input small" data-gear-spell="${side}" aria-label="Spell"><option value=""${full.spell ? '' : ' selected'}>None you can cast</option>${spells}</select> ${charge}
        <span class="c-faint small-note">a cast every ${dec(RULES.magicRate * 0.6, 1)} s</span></div>
      <div class="gear-row"><span class="c-muted">Staff's style</span> ${modeSel} <span class="c-faint small-note">(its Defence bonus counts)</span></div>`;
  }

  function prayersHtml(kind, st, side, levels) {
    const sel = stat => {
      const list = PRAYERS.filter(p => (stat === 'protect' ? p.protect : p[stat]));
      const on = st.prayers[stat];
      const tip = `${list.map(p => `${p.name}: Prayer ${p.level}${stat === 'protect' ? '' : `, ${p[stat] - 100}% more ${cap(stat)}`}`).join('\n')}${list.some(p => p.level > (levels.prayer ?? 1)) ? `\nGreyed out: above your Prayer level (${levels.prayer ?? 1})` : ''}`;
      return `<label class="check gear-pray" title="${esc(tip)}"><span class="c-muted">${stat === 'protect' ? 'Protect' : cap(stat)}</span><select class="input small" data-gear-prayer="${stat}" data-side="${side}" aria-label="${esc(`${cap(stat)} prayer`)}"><option value="">None</option>${list.map(p => {
        const lack = p.level > (levels.prayer ?? 1);
        return `<option value="${p.id}"${p.id === on ? ' selected' : ''}${lack && p.id !== on ? ' disabled' : ''}>${esc(stat === 'protect' ? p.name.replace(/^Protect from /, '') : `${p.name} +${p[stat] - 100}%`)}</option>`;
      }).join('')}</select></label>`;
    };
    return `<div class="gear-row"><span class="c-muted">Prayers</span> ${[...PRAYERS_FOR[kind], 'protect'].map(sel).join(' ')}</div>`;
  }

  function potionsHtml(kind, st, side) {
    const box = id => { const p = POTION_BY.get(id); return `<label class="check" title="${esc(`${p.name}: ${p.boosts.map(([sk, c, pc]) => `${SKILL_BY_KEY.get(sk).name} +${c}${pc ? ` and ${pc}%` : ''}`).join(', ')}`)}"><input type="checkbox" data-gear-potion="${id}" data-side="${side}"${st.potions.includes(id) ? ' checked' : ''}> ${esc(p.name)}</label>`; };
    return `<div class="gear-row"><span class="c-muted">Potions</span> ${POTIONS_FOR[kind].map(box).join(' ')}
      <label class="check" title="An antifire potion takes 15 off what a dragon's fire does to you (the King Black Dragon's too)"><input type="checkbox" data-gear-antifire="${side}"${st.antifire ? ' checked' : ''}> Antifire</label></div>`;
  }

  function bonusesHtml(b) {
    const cell = v => `<td${v ? '' : ' class="c-faint"'}>${signed(v)}</td>`;
    return `<div class="table-wrap gear-bonus-wrap"><table class="grid gear-bonus"><thead><tr><th class="l">Bonuses</th>${TYPES5.map(t => `<th>${cap(t)}</th>`).join('')}</tr></thead><tbody>
      <tr><td class="l">Attack</td>${TYPES5.map(t => cell(b[`${t === 'ranged' ? 'range' : t}attack`])).join('')}</tr>
      <tr><td class="l">Defence</td>${TYPES5.map(t => cell(b[`${t === 'ranged' ? 'range' : t}defence`])).join('')}</tr>
    </tbody></table></div>
    <div class="small-note gear-other">Strength <b>${signed(b.strengthbonus)}</b> · Ranged strength <b>${signed(b.rangebonus)}</b> · Prayer <b>${signed(b.prayerbonus)}</b></div>`;
  }

  // What's wrong with a setup, said plainly: what you can't wield yet, ammo a weapon won't fire, a spell you can't cast
  function warnings(g, kind, st, full, stats) {
    const out = [];
    for (const s of C.SLOTS) {
      const id = st.slots[s], bad = id && C.wieldProblem(id, full.levels, { quests: g.quests });
      if (bad) out.push(`${esc(nameOf(id))} needs ${esc(needText(bad, full.levels))} to wear: it's counted as if you could.`);
    }
    const w = EQUIPMENT[st.slots.weapon];
    if (kind === 'ranged' && !w?.ranged) out.push('Wield a bow, a crossbow or something to throw for this setup to shoot.');
    const ammo = C.ammoProblem(st.slots);
    if (ammo === 'none') out.push(`Nothing in your quiver ${aWord(nameOf(st.slots.weapon))} ${esc(nameOf(st.slots.weapon).toLowerCase())} fires: put ${w.ranged === 'bolts' ? 'bolts' : w.ranged === 'ogre_arrows' ? 'ogre arrows' : 'arrows'} in the ammo slot.`);
    if (ammo === 'weak') out.push(`${esc(plural(st.slots.ammo))} need a ${w.ranged === 'bolts' ? 'crossbow' : 'bow'} for Ranged ${EQUIPMENT[st.slots.ammo].power} or more: ${aWord(nameOf(st.slots.weapon))} ${esc(nameOf(st.slots.weapon).toLowerCase())} can't fire them.`);
    if (kind === 'magic' && !full.spell) out.push('No combat spell your Magic level casts with what you wield.');
    for (const k of ['attack', 'strength', 'defence', 'protect']) {
      const p = PRAYER_BY.get(st.prayers[k]);
      if (p && p.level > (full.levels.prayer ?? 1)) out.push(`${esc(p.name)} needs Prayer ${p.level}: it's counted as if you had it.`);
    }
    return out;
  }

  // ── Against a monster, or a player ───────────────────────────────────────
  function vsCard(g) {
    const seg = `<div class="seg" role="group" aria-label="Against what">${[['npc', 'A monster'], ['player', 'A player']].map(([v, l]) => `<button type="button" data-gear-vs="${v}" class="${g.vs === v ? 'on' : ''}" aria-pressed="${g.vs === v}">${l}</button>`).join('')}</div>`;
    return `<div class="card gear-vs"><div class="bar wrap"><h4 class="gear-h">Against</h4>${seg}</div>${g.vs === 'player' ? pvpHtml(g) : npcVsHtml(g)}</div>`;
  }

  // A monster from what's typed: "Hill Giant (level 28)", "hill giant", "giant 28"
  function findMonster(text) {
    const t = String(text || '').trim().toLowerCase();
    if (!t) return { problem: 'Type a monster\'s name, or its name and level.' };
    const exact = MONSTERS.find(m => monsterName(m).toLowerCase() === t || m.id === t);
    if (exact) return { id: exact.id };
    const terms = P.searchTerms(t);
    const hits = MONSTERS.filter(m => P.searchHit(m.name.toLowerCase(), m.level, terms));
    const named = hits.filter(m => m.name.toLowerCase() === t);
    if (named.length === 1) return { id: named[0].id };
    if (hits.length === 1) return { id: hits[0].id };
    if (!hits.length) return { problem: `No monster matches <b>${esc(text)}</b>. Try part of its name, or its combat level.` };
    const list = (named.length ? named : hits).slice(0, 6).map(m => esc(monsterName(m)));
    return { problem: `Which one? ${list.join(', ')}${hits.length > 6 ? ` and ${hits.length - 6} more` : ''}. Pick it from the list, or add its level.` };
  }

  function npcVsHtml(g) {
    const m = g.npc && MONSTER_BY_ID.get(g.npc);
    const form = `<form class="bar wrap" data-form="gear-npc" autocomplete="off"><input class="input small npc-in" name="npc" list="gear-npcs" value="${m ? esc(monsterName(m)) : ''}" placeholder="A monster: its name, or name and level" data-gear-npc="1" aria-label="Monster" spellcheck="false">
      <button class="btn small" type="submit">Show</button>${m ? ` <button type="button" class="linkish small-note" data-gear-npc-page="${m.id}">Its page on the NPCs tab</button>` : ''}
      <datalist id="gear-npcs">${MONSTERS.map(x => `<option value="${esc(monsterName(x))}">`).join('')}</datalist></form>
      ${U.problem ? `<div class="msg error">${U.problem}</div>` : ''}`;
    if (!m) return `${form}<p class="note">Pick a monster to see your max hit against it, how often you hit, your damage a second and how long a kill takes; how it hits you back; and the chance you win a fight to the death.</p>`;
    return form + npcResults(g, setupOf(g), m.id);
  }

  // Its attacks as a line each: "melee (crush), 3 of 4 attacks: 45% hit you, up to 8"
  function attackLines(r, npc) {
    const parts = r.def.parts.filter(x => x.attack.kind !== 'none' || r.def.parts.length === 1);
    const share = x => (parts.length > 1 ? ` <span class="c-faint">(${Math.round(x.attack.p * 100)}% of its attacks)</span>` : '');
    return parts.map(x => {
      const a = x.attack;
      if (a.kind === 'none') return 'It doesn\'t attack.';
      if (a.kind === 'dragonfire') return `Dragonfire${share(x)}: always lands, for 0 to <b>${x.max}</b>${r.you.slots?.shield === SHIELD ? ` (through your ${esc(nameOf(SHIELD).toLowerCase())})` : r.you.protect === 'magic' ? ' (through Protect from Magic)' : ` (${aWord(nameOf(SHIELD))} ${esc(nameOf(SHIELD).toLowerCase())} takes it to 0 to ${a.shield})`}`;
      if (a.kind === 'breath') return `Fiery breath${share(x)}: always lands, for 0 to <b>${x.max}</b>`;
      const what = a.kind === 'melee' ? `Melee (${a.type})` : a.kind === 'ranged' ? 'Ranged' : 'Magic';
      const prot = x.p === 0 && r.you.protect && r.you.protect === a.kind;
      return `${what}${share(x)}: ${prot ? `nothing through your Protect from ${a.kind === 'melee' ? 'Melee' : a.kind === 'ranged' ? 'Missiles' : 'Magic'}` : `${a.sure ? 'always lands' : `<b>${hitPct(x.p)}</b> land on you`}, 0 to <b>${x.max}</b> a hit`}`;
    });
  }
  // The It column's numbers, over all its attacks: the most it hits, how often (its attacks that can miss), its rolls
  function theirColumn(r) {
    const parts = r.def.parts.filter(x => x.attack.kind !== 'none');
    // (what can land: a protect prayer's stops its melee, Ranged or spells)
    const max = Math.max(0, ...parts.filter(x => x.p > 0).map(x => x.max));
    const w = parts.reduce((a, x) => a + x.attack.p, 0) || 1;
    const p = parts.reduce((a, x) => a + x.attack.p * x.p, 0) / w;
    const rolled = parts.filter(x => !x.attack.sure && x.attack.kind !== 'dragonfire' && x.attack.kind !== 'breath');
    return { max, p, rolls: rolled.length === 1 ? { a: rolled[0].attack.attackRoll, d: r.you.defence[rolled[0].attack.type], type: rolled[0].attack.type } : null };
  }

  // You against a monster: the table, the fight, the special attack
  function npcResults(g, setup, npcId) {
    const r = C.vsNpc(setup, npcId);
    const m = MONSTER_BY_ID.get(npcId);
    const them = theirColumn(r);
    const f = r.fight;
    const typeName = t => (t === 'ranged' ? 'Ranged' : cap(t));
    const row = (label, mine, its, tip = '') => `<tr${tip ? ` title="${esc(tip)}"` : ''}><td class="l">${label}</td><td>${mine}</td><td>${its}</td></tr>`;
    const capped = r.off.capped ? ` <span class="c-faint" title="The server caps what a hit does to it">(capped)</span>` : '';
    const youKill = Number.isFinite(r.attacks) ? `${timeText(r.attacks * r.you.speed * 0.6)} <span class="c-faint">(${attacksText(r.attacks)})</span>` : 'never';
    const itKills = Number.isFinite(f.them.mean) ? `${timeText(f.them.seconds)} <span class="c-faint">(${attacksText(f.them.mean)})</span>` : 'never';
    const table = `<div class="table-wrap gear-res-wrap"><table class="grid gear-res"><thead><tr><th class="l"></th><th>You</th><th>${esc(m.name)}</th></tr></thead><tbody>
      ${row('Max hit', `<b>${r.off.max}</b>${capped}`, `<b>${them.max}</b>`)}
      ${row('Hits that land', `<b>${hitPct(r.off.p)}</b>`, `<b>${hitPct(them.p)}</b>`, 'Each attack is two rolls: randominc(attack roll) has to beat randominc(defence roll). A hit that lands does 0 to the max hit, each as likely.')}
      ${row('Average hit', dec(r.avgHit), dec(r.theirAvg), 'Each attack on average, misses and all')}
      ${row('Attacks every', `${dec(r.you.speed * 0.6, 1)} s`, `${dec(r.npc.speed * 0.6, 1)} s`, 'A game tick is 0.6 seconds')}
      ${row('Damage a second', `<b>${dec(r.dps)}</b>`, `<b>${dec(r.theirDps)}</b>`)}
      ${row('A kill takes', youKill, itKills, `How long you take to kill it on average (${fmt(r.npc.hp)} hitpoints), and it you (${fmt(r.you.hitpoints)}), with no food`)}
      ${row('Attack roll', fmt(r.you.attackRoll), them.rolls ? fmt(them.rolls.a) : '–', 'Your effective level × (your attack bonus + 64); its (its level + 9) × (its bonus + 64)')}
      ${row('Defence roll', `${fmt(r.off.defenceRoll)} <span class="c-faint">(its ${typeName(r.you.type)})</span>`, them.rolls ? `${fmt(them.rolls.d)} <span class="c-faint">(your ${typeName(them.rolls.type)})</span>` : '–', 'What the other\'s attack roll has to beat: its (Defence + 9) × (its defence bonus + 64), Magic for spells; yours from your Defence and bonuses (Magic and Defence against spells)')}
    </tbody></table></div>`;
    const noHarm = r.theirAvg <= 0;
    const verdict = !Number.isFinite(r.attacks) ? `<div class="gear-verdict c-lose">${r.you.kind === 'magic' && r.you.spell?.undead && !r.npc.undead ? `${esc(r.you.spell.name)} only hurts the undead.` : 'You can\'t hurt it with this.'}</div>`
      : `<div class="gear-verdict">You win <b class="${f.win >= 0.5 ? 'c-win' : 'c-lose'}">${winPct(f.win)}</b> of fights to the death${noHarm ? ': it can\'t hurt you' : `, with no food, ${f.hpLost >= r.you.hitpoints ? `and a kill would take more than your <b>${fmt(r.you.hitpoints)}</b> hitpoints` : `and lose ${f.hpLost < 0.5 ? 'less than <b>1</b> hitpoint' : `about <b>${fmt(Math.round(f.hpLost))}</b> hitpoint${Math.round(f.hpLost) === 1 ? '' : 's'}`} a kill`}`}.</div>`;
    const lines = attackLines(r, m);
    return `${table}${verdict}
      <div class="gear-its small-note"><span class="c-muted">How it attacks:</span> ${lines.join(' · ')}</div>
      ${specialHtml(r.special, setup)}`;
  }

  // A special attack, said: its hits, their chance and max hit, and what that comes to
  function specialHtml(s, setup, whose = 'Your') {
    if (!s) return '';
    const w = nameOf(setup.slots.weapon);
    const head = `${whose} ${esc(w.toLowerCase())}'s special attack <span class="c-faint">(${s.energy}% of the bar)</span>`;
    let text;
    if (s.spec.rampage) {
      const lv = C.boostedLevels(setup.levels, setup.potions);
      const drain = ['attack', 'defence', 'ranged', 'magic'].map(k => Math.trunc((lv[k] ?? 1) / 10));
      text = `Rampage: takes ${listText(['Attack', 'Defence', 'Ranged', 'Magic'].map((n, i) => `${drain[i]} off your ${n}`))}, and adds <b>${Math.trunc(10 + drain.reduce((a, x) => a + x, 0) / 4)}</b> to your Strength.`;
    } else if (s.spec.defence != null) text = `Adds <b>${s.spec.defence}</b> to your Defence.`;
    else if (s.spec.push) text = 'Pushes them back a square and stuns them: it does no damage.';
    else {
      const each = s.p == null ? '' : s.spec.sure ? 'always lands' : `<b>${hitPct(s.p)}</b> land${s.hits > 1 ? ' each' : 's'}`;
      text = `${s.hits > 1 ? `${s.hits} hits` : 'A hit'}${each ? `, ${each}` : ''}, 0 to <b>${s.max}</b>${s.protected ? ` (cut by ${whose === 'Their' ? 'your' : 'their'} protect prayer)` : ''}${s.avg != null ? `: <b>${dec(s.avg, 1)}</b> damage on average` : ''}.${s.ownDefence ? ` <span class="c-faint">(The server rolls it against ${whose === 'Their' ? 'their own Ranged defence, not yours' : 'your own Ranged defence, not theirs'}.)</span>` : ''}`;
    }
    return `<div class="tip gear-spec"><span>${head}: ${text}</span></div>`;
  }

  // ── PvP ─────────────────────────────────────────────────────────────────
  async function lookUp(name, auto = false) {
    const safe = toSafeName(name);
    U.tried.add(safe);
    U.busy = true; U.error = null;
    if (!auto) P.redraw();
    try {
      const p = await P.api.player(name);
      if (!p) U.error = `No hiscores entry for <b>${esc(toDisplayName(name))}</b>. Check the spelling, or type their levels in.`;
      else { profiles.set(p.safe, p); P.onProfile?.(p); }
    } catch (e) {
      U.error = P.errorText(e);
    } finally {
      U.busy = false;
      if (S.tab === 'gear') P.redraw();
    }
  }

  function pvpHtml(g) {
    const p = theirProfile(g);
    const lv = theirLevels(g), real = theirReal(g);
    const status = U.busy ? '<span class="pending">Looking them up…</span>' : U.error ? `<span class="c-lose">${U.error}</span>`
      : p ? `Combat ${combatLevel(lv)} · from the hiscores` : g.pvp.name ? '' : 'Look them up, or type their levels in.';
    const form = `<form class="bar wrap" data-form="gear-pvp" autocomplete="off"><input class="input small gear-name" name="name" maxlength="12" list="plan-names" value="${esc(g.pvp.name)}" placeholder="Their username" spellcheck="false" aria-label="Their username">
      <button class="btn small" type="submit">Look up</button> <span class="small-note c-faint">${status}</span></form>`;
    const seg = `<div class="seg" role="group" aria-label="Their gear">${[['same', 'Same as yours'], ['own', 'Their own']].map(([v, l]) => `<button type="button" data-gear-pvp-gear="${v}" class="${g.pvp.gear === v ? 'on' : ''}" aria-pressed="${g.pvp.gear === v}">${l}</button>`).join('')}</div>`;
    const theirs = theirSetup(g);
    const own = g.pvp.gear === 'own' && g.pvp.setup;
    const kindSeg = own ? `<div class="seg gear-kinds" role="group" aria-label="Their setup">${KINDS.map(k => `<button type="button" data-gear-kind="${k}" data-side="them" class="${k === theirs.kind ? 'on' : ''}" aria-pressed="${k === theirs.kind}">${KIND_NAME[k]}</button>`).join('')}</div>` : '';
    return `${form}
      <div class="gear-sub"><span class="c-muted small-note">Their levels</span>${levelsHtml(lv, real, theirs.potions, 'data-gear-their', Object.keys(g.pvp.levels).length ? '<button type="button" class="linkish small-note" data-gear-reset="them">Back to the hiscores</button>' : '')}</div>
      <div class="bar wrap"><span class="c-muted">Their gear</span> ${seg} ${kindSeg}${own ? '' : `<span class="c-faint small-note">What you wear in your ${KIND_NAME[g.kind]} setup, your style, prayers and potions, at their levels</span>`}</div>
      ${own ? setupBody(g, 'them') : ''}
      ${pvpResults(g, setupOf(g), theirs, g.pvp.name || 'Them')}`;
  }

  function pvpResults(g, mine, theirs, name) {
    const r = C.vsPlayer(mine, theirs);
    const f = r.fight;
    const typeName = t => (t === 'ranged' ? 'Ranged' : cap(t));
    const row = (label, a, b, tip = '') => `<tr${tip ? ` title="${esc(tip)}"` : ''}><td class="l">${label}</td><td>${a}</td><td>${b}</td></tr>`;
    const maxOf = (x, s) => `<b>${x.max}</b>${x.protected ? ` <span class="c-faint">(${s.maxHit} without their prayer)</span>` : ''}`;
    const kill = (mean, speed) => (Number.isFinite(mean) ? `${timeText(mean * speed * 0.6)} <span class="c-faint">(${attacksText(mean)})</span>` : 'never');
    const table = `<div class="table-wrap gear-res-wrap"><table class="grid gear-res"><thead><tr><th class="l"></th><th>You</th><th>${esc(toDisplayName(name))}</th></tr></thead><tbody>
      ${row('Max hit', maxOf(r.ab, r.you), maxOf(r.ba, r.them), 'In PvP a protect prayer against the style takes 40% off its max hit (it doesn\'t stop it), and a hit does no more than the other has left')}
      ${row('Hits that land', `<b>${hitPct(r.ab.p)}</b>`, `<b>${hitPct(r.ba.p)}</b>`)}
      ${row('Average hit', dec(r.avgHit), dec(r.theirAvg))}
      ${row('Attacks every', `${dec(r.you.speed * 0.6, 1)} s`, `${dec(r.them.speed * 0.6, 1)} s`)}
      ${row('Damage a second', `<b>${dec(r.dps)}</b>`, `<b>${dec(r.theirDps)}</b>`)}
      ${row('A kill takes', kill(r.attacks, r.you.speed), kill(r.theirAttacks, r.them.speed), `How long each takes to kill the other on average: they have ${fmt(r.them.hitpoints)} hitpoints, you ${fmt(r.you.hitpoints)}; no food`)}
      ${row('Attack roll', fmt(r.you.attackRoll), fmt(r.them.attackRoll))}
      ${row('Defence roll', `${fmt(r.ab.defenceRoll)} <span class="c-faint">(their ${typeName(r.you.type)})</span>`, `${fmt(r.ba.defenceRoll)} <span class="c-faint">(your ${typeName(r.them.type)})</span>`)}
    </tbody></table></div>`;
    const verdict = !Number.isFinite(r.attacks) && !Number.isFinite(r.theirAttacks) ? '<div class="gear-verdict">Neither of you can hurt the other.</div>'
      : `<div class="gear-verdict">You win <b class="${f.win >= 0.5 ? 'c-win' : 'c-lose'}">${winPct(f.win)}</b> of fights to the death <span class="c-faint small-note">(no food or special attacks, both at full hitpoints, you hitting first)</span>.</div>`;
    return `${table}${verdict}${specialHtml(r.special, mine)}${specialHtml(r.theirSpecial, theirs, 'Their')}`;
  }

  // ── A monster's page on the NPCs tab: each setup against it ─────────────
  function npcHtml(npcId) {
    if (!P.account()) return `<div class="plan-sec gear-npc"><h4>You against it</h4><p class="note">Enter your username above, then set up your gear on the Gear tab, to see how you'd do against it.</p></div>`;
    const g = gearState();
    const kinds = KINDS.filter(k => used(g, k));
    if (!kinds.length) return `<div class="plan-sec gear-npc"><h4>You against it</h4><p class="note">Set up your melee, ranged or magic gear on the Gear tab (Best from my bank does it from what you have) to see how you'd do against it: your max hit, how often you hit, how long a kill takes and your chance to win. <button type="button" class="linkish" data-gear-open="${g.kind}" data-npc="${npcId}">Open the Gear tab</button></p></div>`;
    const rows = kinds.map(k => {
      const st = setupOf(g, k);
      const r = C.vsNpc(st, npcId);
      const them = theirColumn(r);
      const what = k === 'magic' ? (st.spell ? C.SPELL.get(st.spell).name : 'no spell') : st.slots.weapon ? nameOf(st.slots.weapon) : 'unarmed';
      const can = Number.isFinite(r.attacks);
      return `<tr><td class="l"><span class="sk-cell">${st.slots.weapon ? icon(st.slots.weapon, true) : ''}<b>${KIND_NAME[k]}</b> <span class="c-faint small-note">${esc(what)}</span></span></td>
        <td>${r.off.max}</td><td>${hitPct(r.off.p)}</td><td>${dec(r.dps)}</td><td>${can ? timeText(r.attacks * r.you.speed * 0.6) : 'never'}</td>
        <td>${hitPct(them.p)}</td><td>${them.max}</td><td>${can ? `<b class="${r.fight.win >= 0.5 ? 'c-win' : 'c-lose'}">${winPct(r.fight.win)}</b>` : '–'}</td>
        <td><button type="button" class="btn small" data-gear-open="${k}" data-npc="${npcId}" title="See it all on the Gear tab, and change what you wear">Gear</button></td></tr>`;
    }).join('');
    return `<div class="plan-sec gear-npc"><h4>You against it <span class="c-faint small-note">(your setups on the Gear tab, at your levels${Object.keys(g.levels).length ? ' and what-ifs' : ''})</span></h4>
      <div class="table-wrap"><table class="grid gear-npc-t"><thead><tr><th class="l">Setup</th><th title="Your max hit on it">Max hit</th><th title="Your hits that land on it">You hit</th><th title="Your damage a second">DPS</th><th title="How long a kill takes on average">A kill</th><th title="Its attacks that land on you">It hits</th><th title="Its max hit on you">Its max</th><th title="The chance you win a fight to the death, with no food">You win</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <div class="c-faint small-note">A fight to the death with no food, you hitting first, with the prayers and potions each setup has.</div></div>`;
  }

  // ── What goals ask ──────────────────────────────────────────────────────
  // A Ranged goal's: what the Ranged setup shoots, at a style (the goal's Longrange, else the setup's
  // Accurate or Rapid). → { gear: { attack, strength, ammo, weapon, rate }, style, boost (your level with its
  // potion), problem } or null with no account.
  function rangedFor(goalStyle) {
    const g = gearState();
    if (!g) return null;
    const st = g.setups.ranged;
    const gear = C.rangedGearOf(st.slots);
    const modes = C.modesOf(st.slots);
    const mine = modes[Math.min(Math.max(0, st.mode | 0), modes.length - 1)]?.style;
    const style = goalStyle === 'longrange' ? 'longrange' : mine === 'accurate' && gear.weapon ? 'accurate' : 'rapid';
    const boost = st.potions.some(id => POTION_BY.get(id)?.boosts.some(([sk]) => sk === 'ranged')) ? lv => C.boostedLevels({ ranged: lv }, st.potions).ranged : null;
    const levels = myLevels(g);
    const need = {};
    for (const id of new Set([gear.weapon, gear.ammo].filter(Boolean))) need[id] = C.wieldProblem(id, levels, { quests: g.quests });
    return { ...gear, style, boost, potions: st.potions, need };
  }
  // A melee goal's: how your melee setup does against a monster at a level, in the goal's style (the same
  // kind of hit as your setup's where the weapon has it). → { p, max, theirP, theirMax, mode, weapon } or
  // { problem: 'style' } (no such style on the weapon), null with no account or setup.
  function meleeAt(npcId, style, levels = {}) {
    const g = gearState();
    if (!g || !used(g, 'melee')) return null;
    const st = g.setups.melee;
    const mode = C.modeFor(st.slots, style, st.mode);
    if (mode == null) return { problem: 'style', weapon: st.slots.weapon };
    const setup = { ...setupOf(g, 'melee'), mode };
    setup.levels = { ...setup.levels, ...levels };
    const r = C.vsNpc(setup, npcId);
    const them = theirColumn(r);
    return { p: r.off.p, max: r.off.max, theirP: them.p, theirMax: them.max, mode: C.modesOf(st.slots)[mode], weapon: st.slots.weapon, attackRoll: r.you.attackRoll, defenceRoll: r.off.defenceRoll };
  }
  // A Magic goal's: a combat spell with your Magic setup (its staff and bonuses), on the Gear tab's monster if
  // one's picked. → { max, p (or null), npc } or null with no account.
  function spellAt(spellId, levels = {}) {
    const g = gearState();
    if (!g || !C.SPELL.has(spellId)) return null;
    const setup = { ...setupOf(g, 'magic'), spell: spellId };
    setup.levels = { ...setup.levels, ...levels };
    const you = C.playerStats(setup);
    const npc = g.npc && C.npcOf(g.npc);
    if (!npc) return { max: you.maxHit, p: null, npc: null };
    const off = C.youVsNpc({ ...you, slots: setup.slots }, npc);
    return { max: off.max, p: off.p, avg: (off.p * off.max) / 2, npc: g.npc, name: MONSTER_BY_ID.get(g.npc)?.name };
  }
  const usedKind = kind => { const g = gearState(); return !!g && used(g, kind); };

  // ── Events ──────────────────────────────────────────────────────────────
  function bestFromBank(focus) {
    const g = gearState();
    const items = P.bank().items || {};
    const kind = g.kind, st = g.setups[kind];
    const levels = myLevels(g);
    const npcId = g.vs === 'npc' ? g.npc : null;
    const any = Object.keys(EQUIPMENT).some(id => items[id] > 0);
    if (!any) { U.note = { kind, html: 'Your bank has nothing to wear yet: put in what you have on the Bank tab (typed, or read from screenshots), then try again.' }; U.undo = null; return; }
    const r = C.bestFromBank({ kind, focus, levels, items, npcId, quests: g.quests, prayers: st.prayers, potions: st.potions, spell: st.spell, antifire: st.antifire });
    if (!r) { U.note = { kind, html: kind === 'ranged' ? 'Your bank has no bow, crossbow or thrown weapon your levels can wield, with what it fires.' : 'Nothing in your bank your levels can wield for this.' }; U.undo = null; return; }
    const before = JSON.parse(JSON.stringify(st));
    const same = JSON.stringify(Object.entries(r.slots).sort()) === JSON.stringify(Object.entries(st.slots).sort()) && (r.mode === st.mode);
    update(x => {
      const s = x.setups[kind];
      s.slots = r.slots; s.mode = r.mode;
      if (kind === 'magic' && r.spell) s.spell = r.spell;
    });
    const list = C.SLOTS.filter(s => r.slots[s]).map(s => itemName(r.slots[s]));
    const vs = npcId ? ` against ${esc(MONSTER_BY_ID.get(npcId).name)}` : ' (against no monster in particular: pick one below to fit it to that)';
    U.note = { kind, ok: true, html: same ? `That's already the best your bank has ${focus === 'tank' ? 'for tanking' : 'for damage'}${npcId ? ` against ${esc(MONSTER_BY_ID.get(npcId).name)}` : ''}.`
      : `From your bank, ${focus === 'tank' ? 'for tanking' : 'for the most damage'}${vs}: ${listText(list)}${list.length ? '.' : 'nothing.'} Only what's in your bank counts: put in what you wear too.` };
    U.undo = same ? null : { kind, setup: before };
  }

  function onClick(e) {
    const t = e.target;
    const open = t.closest('[data-gear-open]');
    if (open) {
      update(g => { g.kind = KINDS.includes(open.dataset.gearOpen) ? open.dataset.gearOpen : g.kind; g.vs = 'npc'; if (MONSTER_BY_ID.has(open.dataset.npc)) g.npc = open.dataset.npc; });
      U.pick = null; U.note = null; U.problem = null;
      P.goTab('gear');
      window.scrollTo({ top: 0 });
      return true;
    }
    if (!t.closest('#view-gear')) return false;
    const kindBtn = t.closest('[data-gear-kind]');
    if (kindBtn) {
      const k = kindBtn.dataset.gearKind;
      if (kindBtn.dataset.side === 'them') update(g => { if (g.pvp.setup) { if (g.pvp.setup.kind !== k) { g.pvp.setup = { ...cleanSetup(g.setups[k]), kind: k }; } } });
      else update(g => { g.kind = k; });
      U.pick = null; U.q = '';
      P.redraw();
      return true;
    }
    const slot = t.closest('[data-gear-slot]');
    if (slot) {
      const same = U.pick && U.pick.side === slot.dataset.side && U.pick.slot === slot.dataset.gearSlot;
      U.pick = same ? null : { side: slot.dataset.side, slot: slot.dataset.gearSlot };
      U.q = '';
      P.redraw();
      if (U.pick) document.querySelector('#gear-body [data-gear-find]')?.focus({ preventScroll: true });
      return true;
    }
    const wearBtn = t.closest('[data-gear-wear]');
    if (wearBtn && U.pick) {
      const { side, slot: s } = U.pick;
      update(g => { const st = side === 'them' ? g.pvp.setup : g.setups[g.kind]; if (st) wear(st, s, wearBtn.dataset.gearWear); });
      U.pick = null; U.q = ''; U.note = null;
      P.redraw();
      return true;
    }
    if (t.closest('[data-gear-off]') && U.pick) {
      const { side, slot: s } = U.pick;
      update(g => { const st = side === 'them' ? g.pvp.setup : g.setups[g.kind]; if (st) wear(st, s, null); });
      U.pick = null; U.q = ''; U.note = null;
      P.redraw();
      return true;
    }
    if (t.closest('[data-gear-close]')) { U.pick = null; U.q = ''; P.redraw(); return true; }
    const best = t.closest('[data-gear-best]');
    if (best) { U.pick = null; bestFromBank(best.dataset.gearBest); P.redraw(); return true; }
    if (t.closest('[data-gear-undo]') && U.undo) {
      const { kind, setup } = U.undo;
      update(g => { g.setups[kind] = cleanSetup(setup); });
      U.undo = null; U.note = null;
      P.redraw();
      return true;
    }
    const vs = t.closest('[data-gear-vs]');
    if (vs) { update(g => { g.vs = vs.dataset.gearVs; }); U.pick = null; U.problem = null; P.redraw(); return true; }
    const pg = t.closest('[data-gear-pvp-gear]');
    if (pg) {
      update(g => {
        g.pvp.gear = pg.dataset.gearPvpGear;
        // (their own starts as a copy of yours, to change)
        if (g.pvp.gear === 'own' && !g.pvp.setup) g.pvp.setup = { ...cleanSetup(g.setups[g.kind]), kind: g.kind };
      });
      U.pick = null;
      P.redraw();
      return true;
    }
    const reset = t.closest('[data-gear-reset]');
    if (reset) { update(g => { if (reset.dataset.gearReset === 'them') g.pvp.levels = {}; else g.levels = {}; }); P.redraw(); return true; }
    const page = t.closest('[data-gear-npc-page]');
    if (page) { P.openNpc(page.dataset.gearNpcPage); return true; }
    return false;
  }

  function onChange(e) {
    const t = e.target, d = t.dataset;
    if (!t.closest('#view-gear')) return false;
    const st = g => (d.side === 'them' || d.gearMode === 'them' || d.gearSpell === 'them' || d.gearCharge === 'them' || d.gearAntifire === 'them' ? g.pvp.setup : g.setups[g.kind]);
    if (d.gearQuests) { update(g => { g.quests = t.checked; }); P.redraw(); return true; }
    if (d.gearMode) { update(g => { const s = st(g); if (s) s.mode = Number(t.value) || 0; }); P.redraw(); return true; }
    if (d.gearSpell != null && t.tagName === 'SELECT') { update(g => { const s = st(g); if (s) s.spell = C.SPELL.has(t.value) ? t.value : null; }); P.redraw(); return true; }
    if (d.gearCharge) { update(g => { const s = st(g); if (s) s.charge = t.checked; }); P.redraw(); return true; }
    if (d.gearAntifire) { update(g => { const s = st(g); if (s) s.antifire = t.checked; }); P.redraw(); return true; }
    if (d.gearPrayer) { update(g => { const s = st(g); if (s) { if (PRAYER_BY.has(t.value)) s.prayers[d.gearPrayer] = t.value; else delete s.prayers[d.gearPrayer]; } }); P.redraw(); return true; }
    if (d.gearPotion) {
      update(g => { const s = st(g); if (!s) return; s.potions = s.potions.filter(x => x !== d.gearPotion); if (t.checked) s.potions.push(d.gearPotion); });
      P.redraw();
      return true;
    }
    if (d.gearLevel || d.gearTheir) {
      const k = d.gearLevel || d.gearTheir, n = Number(String(t.value).trim());
      update(g => {
        const what = d.gearLevel ? g.levels : g.pvp.levels;
        const real = d.gearLevel ? realLevels()[k] : theirReal(g)[k];
        if (t.value.trim() === '' || !okLevel(k, n) || n === real) delete what[k]; else what[k] = n;
      });
      P.entered(() => P.redraw());
      return true;
    }
    if (d.gearNpc) { pickMonster(t.value); return true; }
    return false;
  }
  function pickMonster(text) {
    const r = findMonster(text);
    if (r.problem) { U.problem = r.problem; P.redraw(); return; }
    U.problem = null;
    const g0 = gearState();
    if (g0 && g0.npc !== r.id) U.note = null;
    update(g => { g.npc = r.id; });
    P.entered(() => P.redraw());
  }

  function onInput(e) {
    const t = e.target;
    if (t.dataset?.gearFind) { U.q = t.value; applyFind(); return true; }
    return false;
  }

  function onSubmit(form) {
    if (form.dataset.form === 'gear-npc') { pickMonster(form.npc.value); return true; }
    if (form.dataset.form === 'gear-pvp') {
      const name = form.name.value.trim();
      const problem = checkName(name);
      if (problem) { U.error = esc(problem); P.redraw(); return true; }
      update(g => { if (toSafeName(g.pvp.name) !== toSafeName(name)) g.pvp.levels = {}; g.pvp.name = toDisplayName(name); });
      lookUp(name);
      return true;
    }
    return false;
  }

  return {
    renderGear, onClick, onChange, onInput, onSubmit, npcHtml,
    rangedFor, meleeAt, spellAt, usedKind,
    get picking() { return !!U.pick; },
  };
}
