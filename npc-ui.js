// Planner+ monster views: the NPCs tab (the database: every monster's stats,
// the XP of a kill and what it drops) and Slayer goals (a plan of kills: the XP
// they give, the loot to expect, what you got, and how lucky that is).
//
// Slayer isn't in this version of the game yet. Its goals are where monster
// plans live meanwhile, so that when the skill comes its tasks are planned
// here, on what's already counted: loot.js (drops, chances, luck, XP), the
// bank, prices and goals. A skill goal trained on monsters (Attack, Strength,
// Defence, Hitpoints, Ranged) makes one for its kills with "Plan the loot".
//
// A Slayer goal: { id, skill: 'slayer', type: 'kills', value (kills planned),
// npc (a monster's id), style (KILL_STYLES), created, ring?, legends?, from?
// (the skill goal it was made for), done? (kills done), got? ({ item: how many
// you got }), banked? (what of got has gone into the bank) }, and from v3.1:
// leave? ([items you don't pick up]), alch? ([items you high alch: counted as
// their high alch in coins, and banked as coins]), herbs? ('grimy': the herb
// table's herbs as the one Unid herb; else each herb, cleaned), bring? ({ item:
// how many you carry each trip: taken off each loot screenshot, so it isn't
// counted as loot }), runesKept? (alching leaves your bank's nature runes be),
// shots? ([the screenshots whose loot it has, as file keys: none is counted twice]).
// Per account (v3.1): slayerMark.<account> = { at, xp10: { skill: XP } }, the
// combat XP when kills were last counted from it (a session's kills are the
// Hitpoints XP gained since, over what a kill gives; v3.2: or since one of the
// account's Gains snapshots).
// Created by planner-ui.js with what it shares (P).

import { SLAYER, SKILL_BY_KEY, MAX_LEVEL } from './skills.js';
import { ITEMS, MONSTERS, UNID_HERBS, METHODS } from './gamedata.js';
import { NPC_INFO, NPC_PICS, NPC_MAPS } from './npcdata.js';
import { killDrops, killXp, KILL_STYLES, atLeastOne, dryChance, killsFor, luck, rateText, styleOfSkillGoal, MONSTER_BY_ID, CLEAN_HERBS, COUNTED_SKILLS, xpGained, killsXp, killsFromHp, leftOver, guessAlchs, coinsDropped } from './loot.js';
import { levelForXp10, MAX_XP10 } from './planner.js';
import { highAlch } from './prices.js';
import { store, snapshots } from './store.js';
import { sortTh, sortFrom, savedSort, sortedBy } from './tablesort.js';

const MAX_KILLS = 10_000_000;
const STAT_NAMES = ['Attack', 'Strength', 'Defence', 'Hitpoints', 'Ranged', 'Magic'];
// (v3.3) What the NPCs tab's list sorts by (a column's name clicked), and the ones that sort the biggest first the first time.
const NPC_SORTS = ['level', 'name', 'hp', 'att', 'str', 'def', 'rng', 'mag', 'xp', 'loot'];
const NPC_SORTS_DESC = ['hp', 'att', 'str', 'def', 'rng', 'mag', 'xp', 'loot'];
// (and a monster's drops on its page)
const DROP_SORTS = ['value', 'name', 'chance', 'avg', 'kills'];
const DROP_SORTS_DESC = ['value', 'chance', 'avg'];
const BONUS_NAMES = { attackbonus: 'Attack', strengthbonus: 'Strength', rangebonus: 'Ranged', stabdefence: 'Stab defence', slashdefence: 'Slash defence', crushdefence: 'Crush defence', rangedefence: 'Ranged defence', magicdefence: 'Magic defence' };
const BANDS = [...new Set(MONSTERS.map(m => m.group))];
const monsterName = m => `${m.name} (level ${m.level})`;
// High Level Alchemy, as Magic's row has it: level 55, 65 XP, a nature rune and 5 fire runes a cast
const HIGH_ALCH = METHODS.find(m => m.id === 'mg_highlvl_alchemy');
// "at_fire_giant_86" -> "fire_giant_86": a combat skill's row and its monster
export const monsterOfMethod = id => (/^(at|st|df|hp|rg)_/.test(id) ? id.slice(3) : null);
export const isSlayerGoal = g => g?.skill === SLAYER.key;
// The herb table's herbs on a goal: cleaned (each herb its own item) unless you keep them grimy.
// (A goal from v3.0 that has unid herbs in what it got keeps them that way.)
export const herbsOf = goal => goal?.herbs || (goal?.got?.[UNID_HERBS.item] > 0 ? 'grimy' : 'clean');
// A goal's style, one a kill of it can be fought in (only Magic hurts a battle mage).
function styleFor(npc, style) {
  if (killXp(npc, style)) return style;
  return KILL_STYLES.find(s => killXp(npc, s.id))?.id || 'accurate';
}
// How sure: 0.2084 -> "21%", 0.0004 -> "0.04%", 0.99996 -> "99.996%"
export function chanceText(p) {
  if (p >= 1) return '100%';
  if (p <= 0) return '0%';
  const x = p * 100;
  if (x < 0.0001) return 'under 0.0001%';
  if (x >= 99.5) { for (let d = 1; d <= 6; d++) { const t = x.toFixed(d); if (Number(t) < 100) return `${t.replace(/0+$/, '').replace(/\.$/, '')}%`; } return '>99.9999%'; }
  if (x >= 10) return `${Math.round(x)}%`;
  if (x >= 1) return `${x.toFixed(1).replace(/\.0$/, '')}%`;
  if (x >= 0.01) return `${x.toPrecision(2).replace(/0+$/, '').replace(/\.$/, '')}%`;
  return `${x.toPrecision(1)}%`;
}
// "about 1 in 5", "about 1 in 1,240"
export function oneIn(p) {
  if (p <= 0) return 'never';
  if (p >= 0.5) return null;
  const n = 1 / p;
  return `about 1 in ${n >= 100 ? Math.round(n).toLocaleString('en-US') : n >= 10 ? Math.round(n) : n.toFixed(1).replace(/\.0$/, '')}`;
}
// "1.56 ×": kills against the drop rate's kills
const timesText = x => `${x >= 10 ? Math.round(x) : x.toFixed(2).replace(/\.?0+$/, '')} ×`;

// What going dry means, in words: "Rune scimitar: 200 kills without one is 1.56 ×
// the drop rate (1/128). Going this dry happens to 21% of players (about 1 in 4.8)."
export function drySentence(name, p, kills) {
  if (!(p > 0) || p >= 1 || !(kills > 0)) return '';
  const dry = dryChance(p, kills);
  const one = oneIn(dry);
  return `${name}: ${kills.toLocaleString('en-US')} kill${kills === 1 ? '' : 's'} without one is ${timesText(kills * p)} the drop rate (${rateText(p)}). Going this dry happens to ${chanceText(dry)} of players${one ? ` (${one})` : ''}.`;
}
// What can be high alched off a goal's loot: what sells (not coins, not a clue scroll), and has an alch value.
export const canAlch = slug => !!ITEMS[slug] && slug !== 'coins' && ITEMS[slug].gp == null && !ITEMS[slug].untradeable && (highAlch(slug) || 0) > 0;

export function createNpcUi(P) {
  const { esc, fmt, gpShort, xpText, iconImg, itemIcon, itemName, priceTip, prices, S, $ } = P;
  // ── Prefs of the NPCs tab ───────────────────────────────────────────────
  const saved = store.get('npcUi', {});
  const N = {
    q: '',
    band: BANDS.includes(saved.band) ? saved.band : null,
    // (v3.3: { key, desc }; up to v3.2 a Sort button's name, and dir: -1 for Level or Name the other way)
    sort: savedSort(typeof saved.sort === 'string' && saved.dir === -1 && ['level', 'name'].includes(saved.sort) ? { key: saved.sort, desc: true } : saved.sort, NPC_SORTS, NPC_SORTS_DESC),
    style: KILL_STYLES.some(s => s.id === saved.style) ? saved.style : 'accurate',
    ring: !!saved.ring,
    legends: !!saved.legends,
    herbs: saved.herbs === 'grimy' ? 'grimy' : 'clean',
    dropSort: savedSort(saved.dropSort, DROP_SORTS, DROP_SORTS_DESC),      // (v3.3) a monster page's drops
    open: null,                       // the monster shown on its own, or null for the list
    kills: {},                        // monster id -> kills typed into its Plan kills box
    planStyle: {},                    // monster id -> the style picked in its Plan kills box
  };
  const saveNpcUi = () => store.set('npcUi', { band: N.band, sort: N.sort, dropSort: N.dropSort, style: N.style, ring: N.ring, legends: N.legends, herbs: N.herbs });
  // A goal's loot read from screenshots, waiting for you to check it: goal id -> { busy | error | rows, … }
  const shots = new Map();
  // A goal's dry checker: goal id -> { item, kills }
  const dryPick = new Map();
  // A goal's loot table sort: goal id -> { key, desc } (v3.3: a column's name clicked; till then, Expected value)
  const lootSort = new Map();
  // (v3.1) What a goal's plan says about what was just done, with a way back: goal id -> { html, kind, undo }
  const notes = new Map();
  // A goal's deposit, being made: goal id -> { amounts: { item: how many } }
  const deposits = new Map();
  // A goal's "what you bring", being changed: goal id -> { items: { item: how many }, add: item }
  const brings = new Map();
  // Slayer goals just made with a skill goal's "Plan the loot": its button says so
  const fresh = new Set();

  // ── Drops and their worth ───────────────────────────────────────────────
  // (worked out once for each monster and set of options)
  const DROPS = new Map();
  function dropsOf(npc, { ring = false, legends = false, herbs = 'clean' } = {}) {
    const key = `${npc}|${ring ? 1 : 0}${legends ? 1 : 0}${herbs === 'grimy' ? 'g' : 'c'}`;
    if (!DROPS.has(key)) DROPS.set(key, killDrops(npc, { ring, legends, herbs }));
    return DROPS.get(key);
  }
  const goalOpts = goal => ({ ring: !!goal.ring, legends: !!goal.legends, herbs: herbsOf(goal) });
  const tabOpts = () => ({ ring: N.ring, legends: N.legends, herbs: N.herbs });
  // An item's worth for loot: its price, and nothing for what can't be sold
  // (a quest item; a clue scroll is worth nothing at the market).
  const untradeable = slug => !!ITEMS[slug]?.untradeable && (ITEMS[slug]?.gp == null || !!ITEMS[slug]?.clue);
  const worthOf = slug => (untradeable(slug) ? 0 : prices.priceOf(slug));
  // For the database list, where most prices haven't been checked: high alch stands in.
  const roughWorth = slug => { const p = worthOf(slug); return p != null ? { gp: p, rough: false } : { gp: highAlch(slug) || 0, rough: true }; };
  // (v3.1) On a goal: what you leave on the ground is worth nothing to you, and
  // what you alch is its high alch, in coins. null: no price yet.
  const taken = (goal, slug) => !(goal?.leave || []).includes(slug);
  const alched = (goal, slug) => taken(goal, slug) && (goal?.alch || []).includes(slug) && canAlch(slug);
  const priceIn = (goal, slug) => (!goal ? worthOf(slug) : !taken(goal, slug) ? 0 : alched(goal, slug) ? highAlch(slug) : worthOf(slug));
  // The average loot of a kill: { total, missing (no price), rough (high alch stood in) }
  function lootValue(drops, rough = false, goal = null) {
    let total = 0, roughOnes = 0;
    const missing = [];
    for (const [slug, d] of drops) {
      if (rough) { const w = roughWorth(slug); total += d.q * w.gp; if (w.rough && d.q * w.gp > 0) roughOnes++; continue; }
      const gp = priceIn(goal, slug);
      if (gp == null) { missing.push(slug); continue; }
      total += d.q * gp;
    }
    return { total, missing, rough: roughOnes };
  }
  // What you got is worth: { total, missing }
  function gotValue(goal) {
    let total = 0;
    const missing = [];
    for (const [slug, n] of Object.entries(goal.got || {})) {
      if (!(n > 0)) continue;
      const gp = priceIn(goal, slug);
      if (gp == null) missing.push(slug); else total += gp * n;
    }
    return { total, missing };
  }
  // Which items to ask the market for: a monster's drops that can be sold.
  const sellable = drops => [...drops.keys()].filter(s => !untradeable(s) && ITEMS[s]?.gp == null);

  // "150", "2–12", "150 or 37": how many one drop of it is
  function amountText(d) {
    const counts = new Set();
    let lo = Infinity, hi = 0;
    for (const part of d.parts) {
      const [a, b] = Array.isArray(part.count) ? part.count : [part.count, part.count];
      counts.add(a === b ? fmt(a) : `${fmt(a)}–${fmt(b)}`);
      lo = Math.min(lo, a); hi = Math.max(hi, b);
    }
    const list = [...counts];
    // (coins come in many amounts: from the least to the most)
    return list.length > 3 ? `${fmt(lo)}–${fmt(hi)}` : list.length > 1 ? `${list.slice(0, -1).join(', ')} or ${list[list.length - 1]}` : list[0];
  }
  // Where an item comes from, for its tooltip: "Rare drop table (1/128 of kills): 20/128 of its rolls …"
  const FROM = { main: 'its own drop table', always: 'every kill', clue: 'a clue scroll (members, while you hold none)', randomherb: 'the herb table', randomjewel: 'the gem table', ultrarare_getitem: 'the rare drop table', megararetable: 'the mega rare table', randomjunk: 'the junk table' };
  function fromText(d) {
    const by = new Map();
    for (const part of d.parts) by.set(part.from, (by.get(part.from) || 0) + part.p);
    return [...by].map(([from, p]) => `${rateText(p)} from ${FROM[from] || from}`).join('; ');
  }
  const noted = d => d.parts.some(x => x.noted);

  // ── Shared bits ─────────────────────────────────────────────────────────
  const goalOf = id => P.goals().find(g => g.id === id) || null;
  const kills = text => P.parseAmount(text);
  // A monster from what's typed: "Fire giant (level 86)", "fire giant", "giant 86"
  function findMonster(text) {
    const t = String(text || '').trim().toLowerCase();
    if (!t) return { problem: 'Pick a monster: type part of its name, or its name and level.' };
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
  const datalist = id => `<datalist id="${id}">${MONSTERS.map(m => `<option value="${esc(monsterName(m))}">`).join('')}</datalist>`;
  const styleSelect = (attr, value, npc = null) => `<select class="input small" ${attr} aria-label="Fighting style">${KILL_STYLES.map(s => {
    const ok = !npc || !!killXp(npc, s.id);
    return `<option value="${s.id}"${s.id === value ? ' selected' : ''}${ok ? '' : ' disabled'}>${esc(s.name)}${ok ? '' : ' (not on this monster)'}</option>`;
  }).join('')}</select>`;
  const herbsSelect = (attr, value) => `<label class="check" title="The herb table's herbs are all a grimy &quot;Herb&quot; until you clean (identify) them"><span class="c-muted">Herbs</span>
    <select class="input small" ${attr} aria-label="Herbs"><option value="clean"${value !== 'grimy' ? ' selected' : ''}>Cleaned: each herb, with its chance</option><option value="grimy"${value === 'grimy' ? ' selected' : ''}>Kept grimy: one Unid herb</option></select></label>`;
  // "+444 Attack XP, +147.6 Hitpoints XP"
  const xpList = (xp, n = 1, unit = '') => Object.entries(xp || {}).filter(([, x]) => x > 0)
    .map(([k, x]) => `<b class="c-xp">+${xpText(x * n)}</b> ${esc(SKILL_BY_KEY.get(k)?.name || k)}${unit}`).join(', ');
  const info = id => NPC_INFO[id] || null;
  const ticks = t => `${t} tick${t === 1 ? '' : 's'} (${(t * 0.6).toFixed(1).replace(/\.0$/, '')} s)`;
  const listText = list => (list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0] || '');

  // (v3.3) How it attacks, from the server's scripts: melee (as stab, slash or crush), ranged, magic, dragonfire.
  const hitsOf = i => i?.hits || ['melee'];
  const attackText = i => listText(hitsOf(i).map(h => (h === 'melee' ? i.style || 'crush' : h)));
  // The monster's own numbers: stats, how it fights, where it is.
  function monsterFacts(m) {
    const i = info(m.id);
    if (!i) return '';
    const stats = STAT_NAMES.map((name, k) => `<span class="nf-stat" title="${esc(name)}">${iconImg(SKILL_BY_KEY.get(name.toLowerCase()))}<b>${fmt(i.stats[k])}</b></span>`).join('');
    const bonus = Object.entries(i.bonus || {}).filter(([, v]) => v).map(([k, v]) => `${BONUS_NAMES[k] || k} ${v > 0 ? '+' : ''}${v}`);
    const facts = [
      `Attacks with ${esc(attackText(i))}`,
      i.speed ? `every ${ticks(i.speed)}` : '',
      i.aggressive ? '<b>aggressive</b>' : '',
      i.respawn ? `back ${ticks(i.respawn)} after a kill` : '',
      i.size > 1 ? `${i.size} by ${i.size} squares` : '',
      m.n === 1 ? 'one of a kind' : `${fmt(m.n)} in the world${i.under ? ', most of them under ground' : ''}`,
    ].filter(Boolean);
    const bones = m.bones ? `Leaves ${itemName(m.bones)}` : 'Leaves nothing to bury';
    return `<div class="nf">
      <div class="nf-stats">${stats}</div>
      <div class="c-faint small-note">${facts.join(' · ')} · ${bones}${bonus.length ? `<br>Bonuses: ${esc(bonus.join(', '))}` : ''}</div>
      ${i.examine ? `<div class="nf-examine c-muted small-note">“${esc(i.examine)}”</div>` : ''}
      ${m.note ? `<div class="c-faint small-note">* ${esc(m.note)}</div>` : ''}
    </div>`;
  }

  // (v3.3) A monster's page: its picture (LostHQ's render of the game's model), its numbers, a minimap of
  // where most of them are (drawn from Lost City's map files, a yellow dot each, as the game's minimap has
  // them) and every place they are, the most first. The pictures and minimaps are two sheets, each loaded
  // once a page shows one (npcdata.js NPC_PICS, NPC_MAPS).
  const PLACES_SHOWN = 6;
  function monsterTop(m) {
    const i = info(m.id);
    const pic = i?.pic == null ? '' : `<div class="npc-pic" role="img" aria-label="${esc(m.name)}" title="${esc(`${m.name}: LostHQ's render of the game's model`)}"
      style="background-image:url('${NPC_PICS.sheet}');background-size:${NPC_PICS.perRow * NPC_PICS.size}px auto;background-position:-${(i.pic % NPC_PICS.perRow) * NPC_PICS.size}px -${Math.floor(i.pic / NPC_PICS.perRow) * NPC_PICS.size}px"></div>`;
    const where = i?.where || [];
    const place = ([text, n]) => `<li>${esc(text)}${where.length > 1 || n > 1 ? ` <span class="c-faint">(${fmt(n)})</span>` : ''}</li>`;
    const places = !where.length ? (m.note ? '' : '<p class="c-faint small-note">Not on the map: a script puts it in the world.</p>')
      : `<div class="npc-where"><h5>Where ${m.n === 1 ? 'it is' : 'they are'}</h5><ul>${where.slice(0, PLACES_SHOWN).map(place).join('')}</ul>${where.length > PLACES_SHOWN
        ? `<details><summary>${fmt(where.length - PLACES_SHOWN)} more place${where.length - PLACES_SHOWN === 1 ? '' : 's'}</summary><ul>${where.slice(PLACES_SHOWN).map(place).join('')}</ul></details>` : ''}</div>`;
    const map = i?.map == null ? '' : `<figure class="npc-map"><div class="npc-map-img" role="img" aria-label="${esc(m.n === 1 ? 'A minimap of where it is' : 'A minimap of where the biggest group of them is')}"
      style="--sheet:url('${NPC_MAPS.sheet}');--mw:${NPC_MAPS.w};--mh:${NPC_MAPS.h};--sw:${NPC_MAPS.perRow * NPC_MAPS.w};--mx:${(i.map % NPC_MAPS.perRow) * NPC_MAPS.w};--my:${Math.floor(i.map / NPC_MAPS.perRow) * NPC_MAPS.h}"></div>
      <figcaption class="c-faint small-note">${m.n === 1 ? 'Where it is, as on the game\'s minimap' : `${where.length > 1 ? 'The biggest group of them' : 'Where they are'}: a yellow dot each, as on the game's minimap`}</figcaption></figure>`;
    return `<div class="npc-top${pic ? ' has-pic' : ''}">${pic}<div class="npc-facts">${monsterFacts(m)}${places}</div>${map}</div>`;
  }

  // ── The NPCs tab ────────────────────────────────────────────────────────
  function renderNpcs() {
    P.renderAccount('npcs-account', 'npcs');
    const body = $('npcs-body');
    if (!body) return;
    const m = N.open && MONSTER_BY_ID.get(N.open);
    if (m) {
      // (v3.3: its places shown in full stay that way through a redraw, as prices come in)
      const more = body.querySelector(`[data-npc-page="${CSS.escape(m.id)}"] .npc-where details`)?.open;
      body.innerHTML = npcPage(m);
      if (more) body.querySelector('.npc-where details').open = true;
      return;
    }
    N.open = null;
    body.innerHTML = npcList();
    applyNpcSearch();
  }

  // Every monster: a row each, with the XP and loot of a kill.
  function npcList() {
    const opts = tabOpts();
    const rows = MONSTERS.map(m => {
      const xp = killXp(m.id, N.style);
      const xpOwn = xp ? Object.values(xp).reduce((a, x) => a + x, 0) : -1;
      const drops = dropsOf(m.id, opts);
      const value = lootValue(drops, true);
      return { m, xp, xpOwn, drops, value };
    });
    // (v3.3) Sorted by a column's name: the list's own order (level, then name) breaks ties.
    const stat = (r, k) => info(r.m.id)?.stats[k];
    const value = {
      level: r => r.m.level, name: r => r.m.name, hp: r => r.m.hp,
      att: r => stat(r, 0), str: r => stat(r, 1), def: r => stat(r, 2), rng: r => stat(r, 4), mag: r => stat(r, 5),
      xp: r => (r.xpOwn >= 0 ? r.xpOwn : null), loot: r => r.value.total,
    }[N.sort.key];
    const sorted = sortedBy(rows, value, N.sort.desc);
    const style = KILL_STYLES.find(s => s.id === N.style);
    // (v3.3: its attack stats are faint where it doesn't attack that way: Attack and Strength for melee,
    // Ranged for shooting or throwing, Magic for spells; Defence is always there)
    const statTd = (v, on) => `<td${on ? '' : ' class="c-faint"'}>${v == null ? '–' : fmt(v)}</td>`;
    const tr = ({ m, xp, drops, value }) => {
      const st = info(m.id)?.stats || [];
      const hits = hitsOf(info(m.id));
      const on = [hits.includes('melee'), hits.includes('melee'), true, hits.includes('ranged'), hits.includes('magic')];
      // the three drops worth most on average (what a kill is mostly worth)
      const best = [...drops].map(([slug, d]) => [slug, d, d.q * roughWorth(slug).gp]).filter(([, , v]) => v > 0).sort((a, b) => b[2] - a[2]).slice(0, 4);
      const title = `${monsterName(m)}: ${fmt(m.hp)} hitpoints${m.n === 1 ? ', one of a kind' : `, ${fmt(m.n)} in the world`}${m.note ? `\n${m.note}` : ''}\nClick for its stats, every drop and a plan of kills.`;
      return `<tr data-npc="${m.id}" data-find="${esc(m.name.toLowerCase())}" data-cb="${m.level}" data-grp="${esc(m.group)}" title="${esc(title)}">
        <td>${m.level}</td>
        <td class="l"><span class="sk-cell"><button type="button" class="linkish npc-name" data-npc-open="${m.id}">${esc(m.name)}</button>${m.note ? ' <span class="catch" aria-hidden="true">*</span>' : ''}</span></td>
        <td>${fmt(m.hp)}</td>
        ${[0, 1, 2, 4, 5].map((k, n) => statTd(st[k], on[n])).join('')}
        <td class="l">${xp ? `<span class="small-note">${xpList(xp)}</span>` : '<span class="c-faint small-note">Magic only</span>'}</td>
        <td title="${esc(value.rough ? `${value.rough} of its drops have no market price checked yet: their high alch stands in. Its own page checks them.` : 'The average loot of a kill at your prices')}">${value.total ? `${value.rough ? '≈' : ''}${gpShort(value.total)}` : '<span class="c-faint">–</span>'}</td>
        <td class="l npc-best">${best.map(([slug, d]) => `<span title="${esc(`${ITEMS[slug]?.name || slug}: ${rateText(d.p)} a kill`)}">${itemIcon(slug, true)}</span>`).join('')}</td>
        <td><button type="button" class="btn small" data-npc-open="${m.id}" data-npc-plan="1" title="Open it, with a plan of kills to add as a Slayer goal">Plan kills</button></td>
      </tr>`;
    };
    // (by level, the bands' own headings, the highest first the other way round)
    const groups = N.sort.key === 'level' ? (N.sort.desc ? [...BANDS].reverse() : BANDS) : [null];
    const cols = [
      ['<th title="Combat level">Lvl</th>', { key: 'level' }],
      ['<th class="l">Monster</th>', { key: 'name' }],
      ['<th title="Hitpoints: a kill is this much damage">HP</th>', { key: 'hp', desc: true }],
      ['<th title="Its Attack level (faint where it doesn\'t fight in melee)">Att</th>', { key: 'att', desc: true }],
      ['<th title="Its Strength level (faint where it doesn\'t fight in melee)">Str</th>', { key: 'str', desc: true }],
      ['<th title="Its Defence level: the higher, the harder it is to hit">Def</th>', { key: 'def', desc: true }],
      ['<th title="Its Ranged level (faint where it doesn\'t shoot or throw)">Rng</th>', { key: 'rng', desc: true }],
      ['<th title="Its Magic level (faint where it doesn\'t cast spells)">Mag</th>', { key: 'mag', desc: true }],
      [`<th class="l" title="${esc(`The XP of a kill: ${style.name}`)}">XP a kill</th>`, { key: 'xp', desc: true }],
      ['<th title="The average loot of a kill">Loot a kill</th>', { key: 'loot', desc: true }],
      ['<th class="l" title="What a kill is mostly worth">Best drops</th>', null],
      ['<th></th>', null],
    ];
    // (every row is there, for the search to show: applyNpcSearch hides what the band leaves out)
    const body = groups.map(g => {
      const list = g ? sorted.filter(r => r.m.group === g) : sorted;
      return (g ? `<tr class="grp" data-grp="${esc(g)}"><td colspan="${cols.length}">${esc(g)}</td></tr>` : '') + list.map(tr).join('');
    }).join('');
    const band = (g, label) => `<button type="button" class="chip${(N.band || 'all') === g ? ' on' : ''}" data-npc-band="${esc(g)}" aria-pressed="${(N.band || 'all') === g}">${esc(label)}</button>`;
    return `<div class="card npc-db">
      <div class="bar wrap find-bar"><input class="input small find-in" type="search" data-npc-search="1" value="${esc(N.q)}" placeholder="Search monsters: a name, or a combat level" aria-label="Search monsters" autocomplete="off" spellcheck="false">
        <span class="c-faint small-note" data-npc-found></span></div>
      <div class="group-pick" role="group" aria-label="Combat levels">${BANDS.map(g => band(g, g)).join('')}${band('all', 'All')}</div>
      <div class="bar wrap">
        <span class="c-muted small-note">XP in</span> ${styleSelect('data-npc-style="1"', N.style)}
        <label class="check" title="A ring of wealth makes the gem table's rolls land on a gem more often (from 1 in 128 rolls of nothing to none)"><input type="checkbox" data-npc-opt="ring"${N.ring ? ' checked' : ''}> Ring of wealth</label>
        <label class="check" title="With Legends' Quest done, the gem table's rarest roll is the mega rare table instead of a talisman"><input type="checkbox" data-npc-opt="legends"${N.legends ? ' checked' : ''}> Legends' Quest done</label>
      </div>
      <p class="note">Every monster, ${fmt(MONSTERS.length)} of them, with the server's own numbers: its stats, the XP a kill gives (a point of damage is 4 XP to the style's skill and 1.33 to Hitpoints) and its drop table, read from the server's scripts and checked against <a href="https://2004.losthq.rs/?p=npcdb" target="_blank" rel="noopener">LostHQ's NPC database</a> (where the two differ, the server's is used). Drops assume a members world. Loot a kill is the average at your prices; ≈ where some drops have no market price checked yet (their high alch stands in). A monster's attack stats are faint where it doesn't attack that way (the server's scripts say how each one does). Click a column's name to sort by it, and a monster for its picture (<a href="https://2004.losthq.rs/?p=npcdb" target="_blank" rel="noopener">LostHQ</a>'s render of the game's model), a minimap of where it is, every drop and a plan of kills.</p>
      <div class="table-wrap"><table class="grid npc-t" data-band="${esc(N.band || '')}">
        <thead><tr>${cols.map(([th, spec]) => (spec ? sortTh(th, 'npc-sort', spec, N.sort) : th)).join('')}</tr></thead>
        <tbody>${body}</tbody></table></div>
    </div>`;
  }

  // The list's search: rows shown or hidden where they stand (typing never redraws it).
  function applyNpcSearch() {
    const table = document.querySelector('#npcs-body table.npc-t');
    if (!table) return;
    const terms = P.searchTerms(N.q);
    const band = table.dataset.band;
    const groups = new Set();
    let n = 0;
    for (const tr of table.querySelectorAll('tr[data-npc]')) {
      const on = terms.length ? P.searchHit(tr.dataset.find, tr.dataset.cb, terms) : !band || tr.dataset.grp === band;
      tr.hidden = !on;
      if (on) { n++; groups.add(tr.dataset.grp); }
    }
    for (const tr of table.querySelectorAll('tr.grp')) tr.hidden = !groups.has(tr.dataset.grp);
    const out = document.querySelector('[data-npc-found]');
    if (out) out.textContent = !terms.length ? '' : n ? `${fmt(n)} found, whatever their level` : 'No monster matches that. Try part of its name, or its combat level.';
    for (const chip of document.querySelectorAll('#npcs-body [data-npc-band]')) {
      const on = !terms.length && chip.dataset.npcBand === (band || 'all');
      chip.classList.toggle('on', on);
      chip.setAttribute('aria-pressed', String(on));
    }
  }

  // The style a plan of kills starts in (v3.1): the one your combat skill goals
  // train (a Strength goal: Aggressive), else the NPC list's.
  function startStyle(npc) {
    const g = P.goals().find(x => ['attack', 'strength', 'defence', 'ranged'].includes(x.skill));
    const style = g ? styleOfSkillGoal(g.skill, g.opts?.style) : N.style;
    return styleFor(npc, style);
  }

  // One monster: its numbers, the XP of a kill in each style, every drop, and a plan of kills.
  function npcPage(m) {
    const drops = dropsOf(m.id, tabOpts());
    prices.want(sellable(drops));
    const value = lootValue(drops);
    // (the row highlighted is the style the plan above is in; a click on another plans in it)
    const style = styleFor(m.id, N.planStyle[m.id] || startStyle(m.id));
    const xpRows = KILL_STYLES.map(s => {
      const xp = killXp(m.id, s.id);
      return `<tr${s.id === style ? ' class="hl"' : ''}${xp ? ` data-plan-style="${s.id}" title="Plan kills in ${esc(s.name)}"` : ''}><td class="l">${esc(s.name)}${s.id === style ? ' <span class="c-faint small-note">← your plan</span>' : ''}</td><td class="l">${xp ? xpList(xp) : '<span class="c-faint">can\'t be used on it</span>'}</td></tr>`;
    }).join('');
    const typed = N.kills[m.id] ?? '';
    const plans = P.goals().filter(g => isSlayerGoal(g) && g.npc === m.id);
    const account = P.account();
    const planBox = !account
      ? `<p class="note">Enter your username above to plan kills: a plan is a Slayer goal of that account's.</p>`
      : `<form class="bar wrap" data-form="npc-plan" autocomplete="off">
          <span class="c-muted">Plan</span>
          <input class="input small num" name="kills" inputmode="numeric" placeholder="Kills" value="${esc(String(typed))}" aria-label="Kills to plan" data-npc-kills="${m.id}">
          <span class="c-muted">kills in</span> ${styleSelect(`name="style" data-plan-pick="${m.id}"`, style, m.id)}
          <button class="btn small" type="submit">Add a Slayer goal</button>
          <span class="c-faint small-note">For ${esc(account)}: the XP, the loot to expect and the chance of each drop over those kills, then what you get. The style is the XP it counts (it starts with the one your combat goals train).</span>
        </form>
        ${plans.length ? `<div class="c-faint small-note">Already planned: ${plans.map(g => `<button type="button" class="linkish" data-act="npc-goto" data-goal-id="${g.id}">${fmt(g.value)} kills</button>`).join(', ')}</div>` : ''}`;
    return `<div class="card npc-page" data-npc-page="${m.id}">
      <div class="npc-head"><button type="button" class="linkish" data-act="npc-back">‹ All monsters</button>
        <h3>${esc(m.name)} <span class="c-faint">level ${m.level}</span></h3><span class="grow"></span>
        <span class="c-muted small-note">${fmt(m.hp)} hitpoints</span></div>
      ${monsterTop(m)}
      <div class="plan-sec"><h4>Plan kills</h4>${planBox}</div>
      <div class="plan-sec"><h4>XP a kill <span class="c-faint small-note">(highlighted: the style your plan is in; click another to plan in it)</span></h4>
        <div class="table-wrap"><table class="grid xp-t"><thead><tr><th class="l">Style</th><th class="l">XP</th></tr></thead><tbody>${xpRows}</tbody></table></div>
        <div class="c-faint small-note">A point of damage is 4 XP to the style's skill (Controlled: 1.33 to each of Attack, Strength and Defence; Longrange: 2 to Ranged and Defence) and 1.33 to Hitpoints, whatever the style. Magic is the 2 XP a point of damage only: each cast's own XP depends on the spell.</div>
      </div>
      <div class="plan-sec"><h4>Drops <span class="c-faint">(a kill is worth ${value.missing.length ? 'about' : ''} <b>${gpShort(value.total)}</b> gp on average${value.missing.length ? `, ${value.missing.length} without a price yet` : ''})</span></h4>
        <div class="bar wrap">
          <label class="check"><input type="checkbox" data-npc-opt="ring"${N.ring ? ' checked' : ''}> Ring of wealth</label>
          <label class="check"><input type="checkbox" data-npc-opt="legends"${N.legends ? ' checked' : ''}> Legends' Quest done</label>
          ${[...drops.keys()].some(s => CLEAN_HERBS.has(s) || s === UNID_HERBS.item) ? herbsSelect('data-npc-herbs="1"', N.herbs) : ''}
          <span class="c-faint small-note">Members world. A clue scroll drops only while you hold none.</span>
        </div>
        ${dropTable(drops, null)}
      </div>
    </div>`;
  }

  // A monster's drops: per kill, or over a plan's kills (n) with what you got after done.
  // goal: a Slayer goal (its loot table), or null (the NPCs tab)
  function dropTable(drops, goal) {
    // (v3.3: sorted by a column's name; rows level on it keep the commonest first)
    const byChance = [...drops].map(([slug, d]) => ({ slug, d })).sort((a, b) => b.d.p - a.d.p);
    if (!goal) {
      const list = byChance.map(x => ({ ...x, gp: worthOf(x.slug) }));
      const cols = [
        ['<th class="l">Item</th>', { key: 'name', value: x => ITEMS[x.slug]?.name || x.slug }],
        ['<th title="The chance a kill drops it, as the drop table has it">A kill</th>', { key: 'chance', desc: true, value: x => x.d.p }],
        ['<th title="How many one drop is">Each drop</th>', null],
        ['<th title="How many a kill gives on average">Average</th>', { key: 'avg', desc: true, value: x => x.d.q }],
        ['<th title="The kills by which half of players have one, and 9 in 10">Kills for 50% / 90%</th>', { key: 'kills', value: x => (x.d.p >= 1 ? 1 : killsFor(x.d.p, 0.5)) }],
        ['<th title="The average a kill gives, at your prices">Value a kill</th>', { key: 'value', desc: true, value: x => (untradeable(x.slug) || x.gp == null ? null : x.d.q * x.gp) }],
      ];
      const spec = cols.find(([, c]) => c?.key === N.dropSort.key)?.[1] || cols[5][1];
      const head = cols.map(([th, c]) => (c ? sortTh(th, 'drop-sort', c, { key: spec.key, desc: N.dropSort.key === spec.key ? N.dropSort.desc : true }) : th)).join('');
      const sorted = sortedBy(list, spec.value, N.dropSort.key === spec.key ? N.dropSort.desc : true);
      const row = ({ slug, d, gp }) => {
        const half = killsFor(d.p, 0.5), most = killsFor(d.p, 0.9);
        const value = untradeable(slug) ? '<span class="c-faint">–</span>' : gp == null ? '<span class="c-faint">?</span>' : gpShort(d.q * gp);
        return `<tr title="${esc(itemTitle(slug, d))}"><td class="l">${itemLink(slug, d)}</td><td>${esc(rateText(d.p))}</td><td>${esc(amountText(d))}</td><td>${amt(d.q)}</td><td>${d.p >= 1 ? '1' : `${fmt(half)} / ${fmt(most)}`}</td><td>${value}</td></tr>`;
      };
      return `<div class="table-wrap"><table class="grid loot-t"><thead><tr>${head}</tr></thead><tbody>${sorted.map(row).join('')}</tbody></table></div>`;
    }
    const n = goal.value;
    const done = goal.done || 0;
    const got = goal.got || {}, banked = goal.banked || {};
    const list = byChance.map(x => ({ ...x, gp: priceIn(goal, x.slug) }));
    // ...and anything you got that it doesn't drop (typed in by hand before the monster was changed)
    const extra = Object.keys(got).filter(s => got[s] > 0 && !drops.has(s));
    const inBank = Object.values(banked).some(x => x > 0);
    // (a gp sum, or nothing to sort by where its cell is a ? or a –; what's left on the ground is worth nothing)
    const worth = (x, k) => (!taken(goal, x.slug) ? 0 : untradeable(x.slug) || x.gp == null ? null : k * x.gp);
    const looted = `<th class="wrap${done ? '' : ' sep-l'}" title="Your loot: type it in, or − and + by one drop">Looted</th>`;
    const cols = [
      [`<th title="Take: untick what you leave on the ground. It's left out of the value, the screenshots and your bank.">Take</th>`, null],
      [`<th title="Alch: tick what you high alch. It's counted as its high alch in coins, and goes into your bank as coins.">Alch</th>`, null],
      ['<th class="l">Item</th>', { key: 'name', value: x => ITEMS[x.slug]?.name || x.slug }],
      ['<th title="The chance a kill drops it, as the drop table has it">A kill</th>', { key: 'chance', desc: true, value: x => x.d.p }],
      ['<th title="How many one drop is">Each drop</th>', null],
      [`<th title="How many on average in ${esc(fmt(n))} kills">Expected</th>`, { key: 'expected', desc: true, value: x => x.d.q }],
      [`<th class="wrap" title="The chance of at least one in ${esc(fmt(n))} kills">At least one<br>in ${esc(gpShort(n))}</th>`, { key: 'atleast', desc: true, value: x => atLeastOne(x.d.p, n) }],
      ['<th class="wrap" title="Expected, at your prices (alched: its high alch)">Expected<br>value</th>', { key: 'value', desc: true, value: x => worth(x, x.d.q * n) }],
      ...(done ? [
        [`<th class="wrap sep-l" title="How many on average after the ${esc(fmt(done))} kills you've done">Expected<br>after ${esc(gpShort(done))}</th>`, { key: 'expdone', desc: true, value: x => x.d.q }],
        [looted, { key: 'looted', desc: true, value: x => got[x.slug] || 0 }],
        ['<th class="l" title="How your loot compares with other players\' after as many kills">Luck</th>', null],
      ] : [[looted, { key: 'looted', desc: true, value: x => got[x.slug] || 0 }]]),
      ['<th class="wrap" title="What your loot is worth, at your prices (alched: its high alch)">Actual<br>value</th>', { key: 'got', desc: true, value: x => worth(x, got[x.slug] || 0) }],
      ...(inBank ? [['<th class="wrap" title="How much of your loot you\'ve put in your bank (alched: as coins)">Banked</th>', { key: 'banked', desc: true, value: x => banked[x.slug] || 0 }]] : []),
    ];
    const asked = lootSort.get(goal.id);
    const spec = cols.find(([, c]) => c && c.key === asked?.key)?.[1] || cols.find(([, c]) => c?.key === 'value')[1];
    const sort = spec.key === asked?.key ? asked : { key: 'value', desc: true };
    const head = cols.map(([th, c]) => (c ? sortTh(th, 'loot-sort', c, sort) : th)).join('');
    const sortedList = sortedBy(list, spec.value, sort.desc);
    const row = ({ slug, d, gp }) => {
      const take = taken(goal, slug), alch = alched(goal, slug);
      const at1 = atLeastOne(d.p, n);
      const g = got[slug] || 0;
      const value = !take ? '<span class="c-faint">–</span>' : untradeable(slug) ? '<span class="c-faint">–</span>' : gp == null ? '<span class="c-faint">?</span>' : gpShort(d.q * n * gp);
      const actual = !g ? '<span class="c-faint">–</span>' : gp == null ? '<span class="c-faint">?</span>' : gpShort(g * gp);
      const luckCell = !take ? '<span class="c-faint">left on the ground</span>' : luckText(slug, d, done, g);
      const doneCells = done ? `<td class="sep-l">${amt(d.q * done)}</td><td class="got">${gotBox(slug, g, d)}</td><td class="l small-note luck">${luckCell}</td>` : `<td class="got sep-l">${gotBox(slug, g, d)}</td>`;
      const alchBox = canAlch(slug) ? `<input type="checkbox" data-alch="${slug}"${alch ? ' checked' : ''}${take ? '' : ' disabled'} title="${esc(`High alch it: ${fmt(highAlch(slug))} coins each, and into your bank as coins`)}" aria-label="${esc(`Alch ${ITEMS[slug]?.name || slug}`)}">` : '';
      return `<tr title="${esc(itemTitle(slug, d, goal))}" data-loot="${slug}"${take ? '' : ' class="off"'}>
        <td class="c"><input type="checkbox" data-take="${slug}"${take ? ' checked' : ''} title="Take it: untick what you leave on the ground" aria-label="${esc(`Take ${ITEMS[slug]?.name || slug}`)}"></td>
        <td class="c">${alchBox}</td>
        <td class="l">${itemLink(slug, d)}${alch ? ' <span class="alch-tag" title="High alched: counted in coins">alched</span>' : ''}</td><td>${esc(rateText(d.p))}</td><td>${esc(amountText(d))}</td><td>${amt(d.q * n)}</td><td>${d.p >= 1 ? '–' : chanceText(at1)}</td><td>${value}</td>${doneCells}<td>${actual}</td>${inBank ? `<td class="c-faint">${banked[slug] ? fmt(banked[slug]) : ''}</td>` : ''}</tr>`;
    };
    const extraRows = extra.map(slug => `<tr data-loot="${slug}" title="${esc(`${ITEMS[slug]?.name || slug}: not something this monster drops`)}"><td></td><td></td><td class="l"><span class="sk-cell">${itemIcon(slug, true)} ${itemName(slug)} <span class="c-faint small-note">(not its drop)</span></span></td><td colspan="5"></td>${done ? `<td class="sep-l"></td><td class="got">${gotBox(slug, got[slug], null)}</td><td></td>` : `<td class="got sep-l">${gotBox(slug, got[slug], null)}</td>`}<td>${worthOf(slug) != null ? gpShort(worthOf(slug) * got[slug]) : '<span class="c-faint">?</span>'}</td>${inBank ? `<td class="c-faint">${banked[slug] ? fmt(banked[slug]) : ''}</td>` : ''}</tr>`).join('');
    // (v3.2) Hide unticked loot: what you leave on the ground, out of the table (the one switch every table has)
    const shown = S.hideOff ? sortedList.filter(x => taken(goal, x.slug)) : sortedList;
    const hidden = list.length - shown.length;
    const body = shown.length || extraRows ? `${shown.map(row).join('')}${extraRows}` : `<tr><td class="l c-faint" colspan="${cols.length}">Everything is unticked under Take, and hidden. Untick Hide unticked loot to see it.</td></tr>`;
    return `<div class="bar wrap"><span class="c-muted small-note">Click a column's name to sort by it.</span>
        ${P.hideOffBox('Take', 'loot', hidden)}</div>
      <div class="table-wrap"><table class="grid loot-t"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }
  // An item's name in a loot table: with its icon, and (v3.2) a link to its line on the Prices tab.
  function itemLink(slug, d) {
    const name = `${itemIcon(slug, true)} ${itemName(slug)}${d && noted(d) ? ' <span class="c-faint small-note">(noted)</span>' : ''}`;
    return P.pricedLine(slug) ? `<a class="sk-cell mk" ${P.priceLink(slug)} title="See its price on the Prices tab">${name}</a>` : `<span class="sk-cell">${name}</span>`;
  }
  function itemTitle(slug, d, goal = null) {
    const name = ITEMS[slug]?.name || slug;
    const herb = CLEAN_HERBS.get(slug);
    const clean = herb && goal && herbsOf(goal) === 'clean' ? `\nCleaned: Herblore ${herb.level}, ${xpText(herb.xp)} XP to identify one` : '';
    const alch = goal && alched(goal, slug) ? `\nHigh alched: ${fmt(highAlch(slug))} coins each` : '';
    return `${name}: ${fromText(d)}${untradeable(slug) ? '\nCan\'t be traded: not counted in the value.' : `\n${priceTip(slug)}`}${alch}${clean}`;
  }
  // an amount on average: whole numbers as they are, small ones to two places
  const amt = x => (x >= 100 ? fmt(Math.round(x)) : x >= 10 ? x.toFixed(1).replace(/\.0$/, '') : x >= 0.01 ? x.toFixed(2).replace(/\.?0+$/, '') : x > 0 ? x.toPrecision(1) : '0');
  // − and + go a drop at a time: an item every drop of which is the same amount (a rune scimitar), else one
  const stepOf = d => (d?.one > 0 ? d.one : 1);
  function gotBox(slug, n, d) {
    const name = ITEMS[slug]?.name || slug;
    return `<span class="got-box"><button type="button" class="mv" data-got-step="-${stepOf(d)}" data-slug="${slug}" title="One drop fewer" aria-label="One ${esc(name)} drop fewer"${n > 0 ? '' : ' disabled'}>−</button><input class="input small num" data-got="${slug}" inputmode="numeric" value="${n ? fmt(n) : ''}" placeholder="0" aria-label="${esc(name)} looted"><button type="button" class="mv" data-got-step="${stepOf(d)}" data-slug="${slug}" title="One drop more" aria-label="One ${esc(name)} drop more">+</button></span>`;
  }
  // How lucky your loot is, after done kills: in drops where every drop is the same amount, else in the amount.
  function luckText(slug, d, done, got) {
    if (!done) return '';
    if (d.p >= 1 && d.one) return got === d.one * done ? '<span class="c-faint">every kill</span>' : '';
    if (!got) {
      const dry = dryChance(d.p, done);
      const x = done * d.p;
      const tip = drySentence(ITEMS[slug]?.name || slug, d.p, done);
      if (x < 1) return `<span class="c-faint" title="${esc(tip)}">none yet: ${chanceText(dry)} go this long</span>`;
      return `<span class="${dry < 0.1 ? 'c-lose' : ''}" title="${esc(tip)}">dry ${esc(timesText(x))} rate · ${chanceText(dry)} go this dry</span>`;
    }
    const l = luck(d, done, got);
    const what = l.drops ? `${fmt(l.count)} drop${l.count === 1 ? '' : 's'} (${amt(l.expectedDrops)} expected)` : `${fmt(got)} (${amt(l.expected)} expected)`;
    const tip = `${what} after ${fmt(done)} kills. ${chanceText(l.fewer)} of players would have fewer, ${chanceText(l.more)} more.`;
    if (l.fewer > 0.5) return `<span class="c-win" title="${esc(tip)}">luckier than ${chanceText(l.fewer)}</span>`;
    if (l.more > 0.5) return `<span class="c-lose" title="${esc(tip)}">${chanceText(l.more)} get more</span>`;
    return `<span title="${esc(tip)}">about as expected</span>`;
  }

  // ── Slayer goals ────────────────────────────────────────────────────────
  function addSlayerGoal({ npc, value, style, from = null, ring = false, legends = false }) {
    const id = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const goal = { id, skill: SLAYER.key, type: 'kills', value, npc, style: styleFor(npc, style), created: Date.now(), ...(from ? { from } : {}), ...(ring ? { ring: true } : {}), ...(legends ? { legends: true } : {}), ...(N.herbs === 'grimy' ? { herbs: 'grimy' } : {}) };
    const list = P.goals();
    list.push(goal);
    P.saveGoals(list);
    S.open.add(id);
    P.saveUi();
    // (counting kills from XP starts now, unless there's XP still to be counted)
    if (!readMark() || !sessionGain()) setMark();
    return goal;
  }
  // The new goal's form, under the skill buttons, when Slayer is picked.
  function newGoalHtml(picker) {
    const d = S.newSlayer || (S.newSlayer = { npc: '', kills: '' });
    return `<div class="card goal-new">
      ${picker}
      <form class="bar wrap" data-form="goal" autocomplete="off">
        <span class="goal-skill">${iconImg(SLAYER)} Slayer</span>
        <input class="input small npc-in" name="npc" list="npc-names" value="${esc(d.npc)}" placeholder="Monster: a name, or a name and level" aria-label="Monster" spellcheck="false">
        ${datalist('npc-names')}
        <input class="input small num" name="value" inputmode="numeric" value="${esc(d.kills)}" placeholder="Kills" aria-label="Kills">
        <button class="btn small" type="submit">Add goal</button>
        <span class="c-faint small-note">A plan of kills: the XP they give, the loot to expect and the chance of each drop, then what you get. Slayer isn't in this version of the game yet: its tasks will be planned here when it comes. Or find a monster on the <button type="button" class="linkish" data-act="npc-tab">NPCs</button> tab.</span>
      </form>
    </div>`;
  }
  function addFromForm(form) {
    const found = findMonster(form.npc.value);
    const n = kills(form.value.value);
    S.newSlayer = { npc: form.npc.value, kills: form.value.value };
    if (found.problem) return { problem: found.problem };
    if (!(n > 0)) return { problem: 'How many kills? Type a number, like 500 or 1.5k.' };
    if (n > MAX_KILLS) return { problem: `That's more kills than this plans for (${fmt(MAX_KILLS)} at most).` };
    const goal = addSlayerGoal({ npc: found.id, value: Math.floor(n), style: startStyle(found.id), ring: N.ring, legends: N.legends });
    S.newSlayer = { npc: '', kills: '' };
    return { goal };
  }

  // A skill goal's monster line: "Plan the loot" makes a Slayer goal of its kills,
  // or opens the one it made.
  function planLootButton(goal, methodId, runs) {
    const npc = monsterOfMethod(methodId);
    if (!npc || !info(npc) || !(runs > 0)) return '';
    const mine = P.goals().find(g => isSlayerGoal(g) && g.from === goal.id && g.npc === npc);
    const m = MONSTER_BY_ID.get(npc);
    if (!mine) {
      return ` <button type="button" class="linkish small-note plan-loot" data-act="npc-plan-loot" data-npc="${npc}" data-kills="${runs}" title="${esc(`Add a Slayer goal for these ${fmt(runs)} kills: the XP, the drops to expect and their value, and what you actually get`)}">Plan the loot</button>`;
    }
    const same = mine.value === runs;
    const added = fresh.has(mine.id) ? ' <span class="c-win small-note">added as a Slayer goal:</span>' : '';
    return `${added} <button type="button" class="linkish small-note plan-loot" data-act="npc-goto" data-goal-id="${mine.id}" title="${esc(`Your Slayer goal for ${fmt(mine.value)} ${m.name} kills`)}">${fresh.has(mine.id) ? 'see its loot plan' : 'Loot plan'}${same ? '' : ` (${fmt(mine.value)} kills)`}</button>${same ? '' : ` <button type="button" class="linkish small-note" data-act="npc-sync" data-goal-id="${mine.id}" data-kills="${runs}" title="Make that Slayer goal these kills">make it ${fmt(runs)}</button>`}`;
  }
  function planLootFor(goal, npc, runs) {
    const mine = P.goals().find(g => isSlayerGoal(g) && g.from === goal.id && g.npc === npc);
    if (mine) return mine;
    const style = styleOfSkillGoal(goal.skill, goal.opts?.style);
    return addSlayerGoal({ npc, value: runs, style, from: goal.id, ring: N.ring, legends: N.legends });
  }

  // Reached: as many kills done as planned.
  const reached = g => (g.done || 0) >= g.value;

  // The card on the Goals tab.
  function goalCard(goal, first, last) {
    const m = MONSTER_BY_ID.get(goal.npc);
    const open = S.open.has(goal.id);
    const editing = S.editing?.id === goal.id;
    const done = Math.min(goal.done || 0, MAX_KILLS);
    let sub = '', bar = '', plan = '';
    const title = m ? `${esc(m.name)} <span class="c-faint">(level ${m.level})</span> · ${fmt(done)} / <b>${fmt(goal.value)}</b> kills` : 'A monster no longer in the data';
    if (m) {
      const drops = dropsOf(m.id, goalOpts(goal));
      prices.want(sellable(drops));
      const value = lootValue(drops, false, goal);
      const xp = killXp(m.id, goal.style) || {};
      const xpLine = xpList(xp, goal.value, ' XP');
      const from = goal.from && P.goals().find(g => g.id === goal.from);
      const fromText = from ? ` · for your <button type="button" class="linkish" data-act="npc-goto" data-goal-id="${from.id}">${esc(SKILL_BY_KEY.get(from.skill)?.name || from.skill)} goal</button>` : '';
      const left = goal.value - done;
      sub = reached(goal)
        ? `<span class="c-win">Reached</span> · ${fmt(done)} kills · ${xpLine}${fromText}`
        : `<b>${fmt(left)}</b> kill${left === 1 ? '' : 's'} to go · ${xpLine} · loot about <b>${value.missing.length ? '≈' : ''}${gpShort(value.total * goal.value)}</b> gp${fromText}`;
      const p = Math.min(100, (done / goal.value) * 100);
      bar = `<div class="pbar goal-bar${reached(goal) ? ' maxed' : ''}" title="${p.toFixed(1)}% of the kills done"><div style="width:${p.toFixed(1)}%"></div></div>`;
      if (open) plan = planHtml(goal, m, drops, value);
    }
    return `<div class="card goal slayer-goal" data-goal="${goal.id}">
      <div class="goal-head">${iconImg(SLAYER)} <span class="goal-name">Slayer</span>
        <span class="goal-title">${title}</span>
        <button type="button" class="linkish small-note" data-act="edit-goal" aria-expanded="${editing}" title="Change this goal: the monster or the kills">Edit</button>
        <span class="grow"></span>
        ${m ? `<button type="button" class="btn small" data-act="toggle-plan" aria-expanded="${open}">${open ? `Hide ${P.PLAN_LABEL}` : P.PLAN_LABEL}</button>` : ''}
        ${P.moveButtons('Slayer', first, last)}
        <button type="button" class="x" data-act="remove-goal" title="Remove this goal" aria-label="Remove goal">✕</button>
      </div>
      ${editing ? editHtml(goal) : ''}
      <div class="goal-sub">${sub}</div>
      ${bar}
      ${plan}
    </div>`;
  }

  // Moving the goalpost: another monster, or another number of kills. What you got stays.
  function editHtml(goal) {
    const e = S.editing;
    const m = MONSTER_BY_ID.get(goal.npc);
    const npcText = e.npc ?? (m ? monsterName(m) : '');
    const value = e.draft ?? goal.value;
    return `<form class="bar wrap goal-edit" data-form="edit-goal" autocomplete="off">
      <span class="c-muted small-note">Change this goal to</span>
      <input class="input small npc-in" name="npc" list="npc-names-edit" value="${esc(npcText)}" aria-label="Monster" spellcheck="false">
      ${datalist('npc-names-edit')}
      <input class="input small num" name="value" inputmode="numeric" value="${esc(String(value))}" aria-label="Kills">
      <span class="c-muted small-note">kills</span>
      <button class="btn small" type="submit">Save</button>
      <button type="button" class="linkish" data-act="edit-cancel">Cancel</button>
      ${e.problem ? `<span class="c-lose small-note">${e.problem}</span>` : '<span class="c-faint small-note">Your kills done and your loot stay as they are.</span>'}
    </form>`;
  }
  function saveEdit(goal, form) {
    const e = S.editing;
    const found = findMonster(form.npc.value);
    const n = kills(form.value.value);
    e.npc = form.npc.value; e.draft = form.value.value;
    if (found.problem) { e.problem = found.problem; return false; }
    if (!(n > 0) || n > MAX_KILLS) { e.problem = `Kills go from 1 to ${fmt(MAX_KILLS)}.`; return false; }
    P.updateGoal(goal.id, g => {
      if (g.npc !== found.id) { g.npc = found.id; g.style = styleFor(found.id, g.style); }
      g.value = Math.floor(n);
    });
    S.editing = null;
    return true;
  }

  // The plan: options, kills done, the XP, the loot table, what you got and the dry checker.
  function planHtml(goal, m, drops, value) {
    const done = goal.done || 0;
    const got = goal.got || {};
    const style = goal.style || 'accurate';
    const xp = killXp(m.id, style) || {};
    // XP, and the level each skill gets to (from your XP now)
    const xpLines = Object.entries(xp).filter(([, x]) => x > 0).map(([k, x]) => {
      const cur = P.currentOf(k);
      const total = x * goal.value, left = x * Math.max(0, goal.value - done);
      const to = cur?.ranked ? levelForXp10(Math.min(MAX_XP10, cur.xp10 + left)) : 0;
      return `<div class="step">${iconImg(SKILL_BY_KEY.get(k))}<div class="step-main"><b class="c-xp">+${xpText(total)}</b> ${esc(SKILL_BY_KEY.get(k).name)} XP <span class="c-faint">(${xpText(x)} a kill)</span>${to > (cur?.level || 0) ? ` <span class="c-faint">· the ${fmt(Math.max(0, goal.value - done))} still to do take you from level ${cur.level} to ${to}</span>` : ''}</div></div>`;
    }).join('');
    const bones = m.bones && drops.get(m.bones) && taken(goal, m.bones) ? drops.get(m.bones) : null;
    // (v3.2: what the drops give besides, a row each like the kills' own: burying, alching, cleaning)
    const bury = bones ? xpRow('prayer', Math.round(bones.q * goal.value * (P.buryXp(m.bones) || 0)), 'if you bury them',
      `(${fmt(Math.round(bones.q * goal.value))} ${itemName(m.bones)}, ${xpText(P.buryXp(m.bones) || 0)} each)`) : '';
    const priced = value.missing.length === 0;
    const gv = gotValue(goal);
    const anyGot = Object.values(got).some(n => n > 0);
    const shot = shots.get(goal.id);
    const hidden = S.tableOff.has(goal.id);
    const diff = bankDiff(goal);
    const expectedDone = value.total * done;
    // (what you got against what's to be expected: in the money line)
    const vs = done && anyGot && priced && !gv.missing.length && expectedDone > 0
      ? ` <span class="${gv.total >= expectedDone ? 'c-win' : 'c-lose'}">(${gv.total >= expectedDone ? '+' : '−'}${Math.round(Math.abs(gv.total / expectedDone - 1) * 100)}% against what's expected)</span>` : '';
    const herbsHere = [...drops.keys()].some(s => CLEAN_HERBS.has(s) || s === UNID_HERBS.item);
    return `<div class="plan slayer-plan">
      <div class="plan-opts">
        <span class="c-muted">Fight in</span> ${styleSelect('data-sopt="style"', style, m.id)}
        <label class="check" title="A ring of wealth makes the gem table's rolls land on a gem more often"><input type="checkbox" data-sopt="ring"${goal.ring ? ' checked' : ''}> Ring of wealth</label>
        <label class="check" title="With Legends' Quest done, the gem table's rarest roll is the mega rare table instead of a talisman"><input type="checkbox" data-sopt="legends"${goal.legends ? ' checked' : ''}> Legends' Quest done</label>
        ${herbsHere ? herbsSelect('data-sopt="herbs"', herbsOf(goal)) : ''}
        <button type="button" class="linkish" data-act="npc-show" data-npc="${m.id}">${esc(m.name)} on the NPCs tab</button>
      </div>
      ${monsterFacts(m)}
      <div class="plan-sec"><h4>Your kills</h4>
        <div class="bar wrap kills-bar">
          <span class="c-muted">Kills done</span>
          <span class="got-box"><button type="button" class="mv" data-done-step="-1" title="One kill fewer" aria-label="One kill fewer"${done > 0 ? '' : ' disabled'}>−</button><input class="input small num" data-done="1" inputmode="numeric" value="${done ? fmt(done) : ''}" placeholder="0" aria-label="Kills done"><button type="button" class="mv" data-done-step="1" title="One kill more" aria-label="One kill more">+</button></span>
          <span class="c-faint">of ${fmt(goal.value)}${done < goal.value ? ` · ${fmt(goal.value - done)} to go` : ''}</span>
          <span class="c-faint small-note">Your kills are counted from your XP too: when the hiscores show new combat XP, the box above your goals asks what you killed. <button type="button" class="linkish small-note" data-act="ses-open" data-go-top="1" title="Count kills from your XP since your last count, or since a Gains snapshot">Count kills from my XP…</button></span>
        </div>
      </div>
      <div class="plan-sec"><h4>XP from ${fmt(goal.value)} kills</h4><div class="steps">${xpLines || '<span class="c-faint">None in this style.</span>'}${bury}${alchLine(goal, drops)}${cleanLine(goal, drops)}</div></div>
      <div class="plan-sec loot-sec"><h4>Loot from ${fmt(goal.value)} kills: about <span class="c-xp">${priced ? '' : '≈'}${gpShort(value.total * goal.value)}</span> gp <span class="c-faint">(${gpShort(value.total)} a kill${priced ? '' : `; ${value.missing.length} without a price yet`})</span>
          <button type="button" class="linkish small-note" data-act="table-toggle" aria-expanded="${!hidden}">${hidden ? 'Show table' : 'Hide table'}</button></h4>
        ${noteHtml(goal)}
        ${hidden ? '' : `<div class="c-faint small-note">Expected: the average over ${fmt(goal.value)} kills. At least one: the chance of one or more in that many. ${done ? `After your ${fmt(done)} kills: what's to be expected, your loot, and how lucky that is.` : 'Type in your kills done above to compare what you get with what\'s to be expected.'} − and + change your loot by one drop. Untick <b>Take</b> for what you leave on the ground; tick <b>Alch</b> for what you high alch (counted as coins).</div>
        ${dropTable(drops, goal)}`}
        <div class="money">
          ${done ? `<span>Expected after ${fmt(done)} kills: <b>${priced ? '' : '≈'}${gpShort(expectedDone)}</b> gp</span>` : ''}
          ${anyGot ? `<span>Looted: <b class="c-xp">${gpShort(gv.total)}</b> gp${gv.missing.length ? ` <span class="c-faint">(${gv.missing.length} without a price)</span>` : ''}${vs}</span>` : ''}
          ${alchCoins(goal, drops)}
        </div>
        ${bringLine(goal)}
        <div class="bar wrap">
          <button type="button" class="btn small" data-act="loot-pick" title="Read your loot from screenshots of your inventory: a trip each">Read loot from screenshots</button>
          ${diff.any ? `<button type="button" class="btn small" data-act="loot-deposit-open" aria-expanded="${deposits.has(goal.id)}" title="${esc(diff.text)}">Deposit to my bank…</button>` : anyGot ? '<span class="c-faint small-note">All your loot is in your bank.</span>' : ''}
          ${anyGot ? '<button type="button" class="linkish small-note" data-act="loot-clear">Clear my loot</button>' : ''}
        </div>
        ${deposits.has(goal.id) ? depositHtml(goal) : ''}
        ${brings.has(goal.id) ? bringHtml(goal, drops) : ''}
        ${shot ? shotsHtml(goal, shot) : ''}
      </div>
      ${dryHtml(goal, drops)}
    </div>`;
  }

  // ── Alching and cleaning (v3.1) ─────────────────────────────────────────
  // What you alch, over the plan's kills and so far: each item a cast of High
  // Level Alchemy (65 Magic XP, a nature rune, 5 fire runes unless you wield a
  // staff of fire).
  function alchCasts(goal, drops) {
    let plan = 0, soFar = 0, coinsPlan = 0, coinsSoFar = 0;
    for (const slug of goal.alch || []) {
      if (!alched(goal, slug)) continue;
      const d = drops.get(slug), ha = highAlch(slug);
      if (d) { plan += d.q * goal.value; coinsPlan += d.q * goal.value * ha; }
      const n = goal.got?.[slug] || 0;
      soFar += n; coinsSoFar += n * ha;
    }
    return { plan, soFar, coinsPlan, coinsSoFar };
  }
  function alchLine(goal, drops) {
    const c = alchCasts(goal, drops);
    if (!c.plan && !c.soFar) return '';
    const magic = P.currentOf('magic');
    const low = magic && magic.level < HIGH_ALCH.level ? ` <span class="c-lose">High Level Alchemy takes Magic ${HIGH_ALCH.level}: you're ${magic.level}${magic.ranked ? '' : ' at most'}.</span>` : '';
    const natures = P.bank().items.naturerune || 0;
    return xpRow('magic', Math.round(c.plan * HIGH_ALCH.xp), 'if you alch them',
      `(about ${fmt(Math.round(c.plan))} casts of High Level Alchemy, ${xpText(HIGH_ALCH.xp)} each${c.soFar ? `; +${xpText(c.soFar * HIGH_ALCH.xp)} for the ${fmt(c.soFar)} you've alched` : ''}: a nature rune a cast, and 5 fire runes unless you wield a staff of fire)${low}`,
      `<label class="check alch-runes" title="When something you alched goes into your bank (as the coins it made), a nature rune for each cast comes out of it"><input type="checkbox" data-sopt="runes"${goal.runesKept ? '' : ' checked'}> When I deposit something I alched, take a nature rune per cast out of my bank <span class="c-faint">(you have ${fmt(natures)})</span></label>`);
  }
  const alchCoins = (goal, drops) => {
    const c = alchCasts(goal, drops);
    return c.plan || c.soFar ? `<span title="What you alch, in coins: its high alch">Alching: about <b>${gpShort(c.coinsPlan)}</b> coins over ${fmt(goal.value)} kills${c.soFar ? `, <b class="c-xp">${gpShort(c.coinsSoFar)}</b> so far` : ''}</span>` : '';
  };
  // Cleaning: each herb its Herblore XP to identify (the server's), where your level lets you.
  function cleanLine(goal, drops) {
    if (herbsOf(goal) !== 'clean') return '';
    const herbs = [...drops].filter(([s]) => CLEAN_HERBS.has(s) && taken(goal, s));
    if (!herbs.length) return '';
    const herblore = P.currentOf('herblore');
    const level = herblore?.level || 1;
    let plan = 0, soFar = 0;
    const cant = [];
    for (const [slug, d] of herbs) {
      const h = CLEAN_HERBS.get(slug);
      if (h.level > level) { cant.push(`${ITEMS[slug].name} (${h.level})`); continue; }
      plan += d.q * goal.value * h.xp;
      soFar += (goal.got?.[slug] || 0) * h.xp;
    }
    return xpRow('herblore', Math.round(plan), 'if you clean them',
      `(the herbs${soFar ? `; +${xpText(soFar)} for the ones you've looted` : ''})${cant.length ? ` <span class="c-lose">At Herblore ${level} you can't clean ${esc(listText(cant))} yet.</span>` : ''}`);
  }
  // A skill's XP as a row with its icon, the way the kills' own XP is shown: "+15,000 Prayer XP if you bury them (…)".
  function xpRow(skill, xp10, how, more = '', extra = '') {
    const sk = SKILL_BY_KEY.get(skill);
    return `<div class="step xp-row">${iconImg(sk)}<div class="step-main"><b class="c-xp">+${xpText(xp10)}</b> ${esc(sk.name)} XP ${how} <span class="c-faint">${more}</span>${extra ? `<div>${extra}</div>` : ''}</div></div>`;
  }

  // ── What you bring (v3.1) ───────────────────────────────────────────────
  // Supplies you carry that the monster drops too (runes, coins, arrows): taken
  // off each trip's screenshot, so they're never counted as loot.
  function bringLine(goal) {
    const b = Object.entries(goal.bring || {}).filter(([, n]) => n > 0);
    return `<div class="c-faint small-note bring-line">What you bring each trip: ${b.length ? esc(listText(b.map(([s, n]) => `${fmt(n)} ${ITEMS[s]?.name || s}`))) : 'nothing it drops'} <button type="button" class="linkish small-note" data-act="bring-open" aria-expanded="${brings.has(goal.id)}">${b.length ? 'Change' : 'Set it'}</button>
      <span>· it's taken off each screenshot of your loot, so what you carry (and loot from before this goal) isn't counted as loot.</span></div>`;
  }
  function bringHtml(goal, drops) {
    const st = brings.get(goal.id);
    const slugs = Object.keys(st.items);
    const options = [...drops.keys()].filter(s => !slugs.includes(s) && ITEMS[s]).sort((a, b) => itemName(a).localeCompare(itemName(b)));
    return `<div class="card bring-edit">
      <div class="shots-title">What you bring each trip</div>
      <p class="note">What you carry that ${esc(MONSTER_BY_ID.get(goal.npc)?.name || 'it')} drops too (runes, coins, arrows) is taken off each trip's screenshot. Read it from a screenshot of your inventory as you set off, or type it in.</p>
      <div class="shot-list">${slugs.map(s => `<label class="shot-row">${itemIcon(s, true)} <span class="shot-name">${itemName(s)}</span><input class="input small num" data-bring="${s}" inputmode="numeric" value="${st.items[s] ? fmt(st.items[s]) : ''}" placeholder="0" aria-label="${esc(ITEMS[s]?.name || s)} you bring"></label>`).join('') || '<span class="c-faint small-note">Nothing yet.</span>'}</div>
      <div class="bar wrap">
        <select class="input small" data-bring-add="1" aria-label="An item to add"><option value="">Add an item it drops…</option>${options.map(s => `<option value="${s}">${itemName(s)}</option>`).join('')}</select>
        <button type="button" class="btn small" data-act="bring-read" title="Read it from a screenshot of your inventory as you set off">Read it from a screenshot</button>
        <span class="grow"></span>
        <button type="button" class="btn small" data-act="bring-save">Save</button>
        <button type="button" class="btn small" data-act="bring-cancel">Cancel</button>
      </div>
    </div>`;
  }

  // ── Into the bank (v3.1) ────────────────────────────────────────────────
  // What "Deposit to my bank" starts with: what you got less what's gone into
  // the bank already. You can deposit after every trip, after a few, or at the
  // end, and change any amount first. Alched loot goes in as coins.
  function bankDiff(goal) {
    const got = goal.got || {}, banked = goal.banked || {};
    const out = {};
    for (const slug of new Set([...Object.keys(got), ...Object.keys(banked)])) {
      if (ITEMS[slug]?.clue || !ITEMS[slug]) continue;           // (a clue scroll is read, not banked)
      const d = (got[slug] || 0) - (banked[slug] || 0);
      if (d) out[slug] = d;
    }
    const adds = Object.entries(out).filter(([, n]) => n > 0), less = Object.entries(out).filter(([, n]) => n < 0);
    const say = list => list.map(([s, n]) => `${fmt(Math.abs(n))} ${ITEMS[s]?.name || s}`).join(', ');
    const text = [adds.length ? `Loot that isn't in your bank yet: ${say(adds)}.` : '', less.length ? `Your bank has more from this goal than you looted: ${say(less)}.` : ''].filter(Boolean).join(' ');
    return { out, any: adds.length + less.length > 0, adds, less, text };
  }
  function depositHtml(goal) {
    const st = deposits.get(goal.id);
    const diff = bankDiff(goal);
    const rows = Object.keys(diff.out).map(s => {
      const n = st.amounts[s] ?? diff.out[s];
      const as = alched(goal, s) ? ` <span class="c-faint small-note">→ ${fmt(highAlch(s))} coins each</span>` : '';
      return `<label class="shot-row"><input type="checkbox" data-dep-on="${s}"${st.off.has(s) ? '' : ' checked'}> ${itemIcon(s, true)} <span class="shot-name">${itemName(s)}${as}</span>
        <input class="input small num" data-dep="${s}" inputmode="numeric" value="${fmt(n)}" aria-label="${esc(ITEMS[s]?.name || s)} to deposit" title="${diff.out[s] < 0 ? 'Less than nothing takes them back out of your bank' : 'How many to put in your bank'}">
        <span class="shot-was c-faint">looted ${fmt(goal.got?.[s] || 0)} · banked ${fmt(goal.banked?.[s] || 0)}</span></label>`;
    }).join('');
    return `<div class="card deposit-edit">
      <div class="shots-title">Deposit to my bank</div>
      <p class="note">Your loot that isn't in your bank yet: change an amount, or untick what stays out for now. What you alched goes in as the coins it made (its high alch)${goal.runesKept ? '' : ', and a nature rune for each cast comes out of your bank'}. Nothing else in your bank changes.</p>
      <div class="shot-list">${rows}</div>
      <div class="bar wrap"><button type="button" class="btn small" data-act="loot-deposit">Deposit</button><button type="button" class="btn small" data-act="loot-deposit-cancel">Cancel</button></div>
    </div>`;
  }
  // Puts amounts into the bank as loot of this goal: { item: n } (less than
  // nothing takes it back out). Alched ones go in as coins, their nature runes
  // come out. Returns what it says it did.
  function deposit(goal, amounts) {
    const b = P.bank();
    const banked = { ...(goal.banked || {}) };
    const did = [];
    let coins = 0, casts = 0;
    for (const [slug, n] of Object.entries(amounts)) {
      if (!n || !ITEMS[slug] || ITEMS[slug].clue) continue;
      if (alched(goal, slug)) { coins += n * highAlch(slug); casts += n; }
      else b.items[slug] = Math.max(0, (b.items[slug] || 0) + n);
      if (!b.items[slug]) delete b.items[slug];
      banked[slug] = Math.max(0, (banked[slug] || 0) + n);
      if (!banked[slug]) delete banked[slug];
      did.push(`${n < 0 ? '−' : ''}${fmt(Math.abs(n))} ${ITEMS[slug].name}${alched(goal, slug) ? ' (alched)' : ''}`);
    }
    if (coins) { b.items.coins = Math.max(0, (b.items.coins || 0) + coins); if (!b.items.coins) delete b.items.coins; }
    let runes = 0;
    if (casts > 0 && !goal.runesKept && b.items.naturerune > 0) {
      runes = Math.min(casts, b.items.naturerune);
      b.items.naturerune -= runes;
      if (!b.items.naturerune) delete b.items.naturerune;
    }
    P.saveBank(b);
    P.updateGoal(goal.id, g => { g.banked = banked; });
    return { did, coins, runes };
  }
  const depositText = r => `${r.did.length > 6 ? `${r.did.slice(0, 6).join(', ')} and ${r.did.length - 6} more` : listText(r.did)}${r.coins ? ` (${gpShort(r.coins)} coins from alching${r.runes ? `, ${fmt(r.runes)} nature rune${r.runes === 1 ? '' : 's'} out` : ''})` : ''}`;

  // ── What the plan says it just did, with Undo (v3.1) ────────────────────
  // undo: the goals and the bank as they were before (JSON), put back as they were.
  const snapshot = () => ({ goals: JSON.stringify(P.goals()), bank: JSON.stringify(P.bank()), mark: JSON.stringify(readMark()) });
  function restore(snap) {
    P.saveGoals(JSON.parse(snap.goals));
    const b = JSON.parse(snap.bank);
    P.saveBank(b);
    const mark = JSON.parse(snap.mark);
    if (mark) store.set(markKey(), mark); else store.remove(markKey());
  }
  function say(goalId, html, undo = null) { notes.set(goalId, { html, undo }); }
  function noteHtml(goal) {
    const n = notes.get(goal.id);
    if (!n) return '';
    return `<div class="msg ok slayer-msg">${n.html}${n.undo ? ' <button type="button" class="linkish" data-act="note-undo">Undo</button>' : ''} <button type="button" class="linkish c-faint" data-act="note-close" aria-label="Close">✕</button></div>`;
  }

  // ── Kills counted from XP (v3.1) ────────────────────────────────────────
  // When the hiscores show combat XP gained since kills were last counted, a box
  // above your goals says so: choose what you killed (kills of each of your
  // Slayer goals' monsters and any other; one of them takes whatever XP the
  // others leave, 1.33 Hitpoints XP a point of damage, whatever the style: your
  // topmost Slayer goal, till you pick another), or Not now. What's left over
  // can be taken off a goal's kills (the XP it was for). v3.2: the box itself
  // makes no guess, and the XP can be counted from any of the account's Gains
  // snapshots instead of the last count (the default, every time).
  const markKey = () => `slayerMark.${P.safe()}`;
  const readMark = () => (P.safe() ? store.get(markKey(), null) : null);
  function xpNow() {
    if (!P.profile()) return null;
    const out = {};
    for (const k of COUNTED_SKILLS) { const c = P.currentOf(k); if (c?.ranked) out[k] = c.xp10; }
    return out;
  }
  function setMark() {
    const xp = xpNow();
    if (xp) store.set(markKey(), { at: P.profile()?.fetchedAt || Date.now(), xp10: xp });
  }
  const whenText = t => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  // The account's Gains snapshots there's combat XP since, newest first: [{ t, xp10 }]
  // (a skill without a row then counts nothing: its XP then isn't known)
  function snapBases() {
    const now = xpNow(), at = P.profile()?.fetchedAt || Date.now();
    if (!now || !P.account()) return [];
    const out = [];
    for (const snap of snapshots.list(P.account())) {
      if (snap.t >= at) continue;
      const xp10 = {};
      for (const k of COUNTED_SKILLS) {
        const st = snap.stats[SKILL_BY_KEY.get(k).id];
        xp10[k] = st ? Math.round(st.xp * 10) : now[k];
      }
      if ((xpGained(xp10, now).hitpoints || 0) > 0) out.push({ t: snap.t, xp10 });
    }
    return out.reverse();
  }
  // What the XP is counted from: the last count (the default), or a snapshot ('t:<time>'): { at, xp10 } or null
  function baseline() {
    if (ses.from?.startsWith('t:')) {
      const t = Number(ses.from.slice(2));
      const b = snapBases().find(x => x.t === t);
      if (b) return { at: b.t, xp10: b.xp10 };
    }
    return readMark();
  }
  // XP gained since the baseline: { skill: tenths }, or null when there's none to count
  function sessionGain() {
    const base = baseline(), now = xpNow();
    if (!base || !now) return null;
    const g = xpGained(base.xp10, now);
    return g.hitpoints > 0 ? g : null;
  }
  // "since <the last count ▾>": the last count, or one of the Gains snapshots
  function fromSelect() {
    const mark = readMark();
    const bases = snapBases();
    const opts = [`<option value="prev"${ses.from?.startsWith('t:') ? '' : ' selected'}>${mark ? `the previous count, ${esc(whenText(mark.at))}` : 'the previous count'}</option>`];
    // (the 30 newest, and the first)
    const shown = bases.length > 31 ? [...bases.slice(0, 30), bases[bases.length - 1]] : bases;
    for (const b of shown) opts.push(`<option value="t:${b.t}"${ses.from === `t:${b.t}` ? ' selected' : ''}>${b === bases[bases.length - 1] && bases.length > 1 ? 'the first snapshot' : 'a Gains snapshot'}, ${esc(whenText(b.t))}</option>`);
    return `<select class="input small ses-from" data-ses-from="1" aria-label="Count the XP from" title="The XP is counted from your last count, or from any of this account's snapshots on the Gains tab">${opts.join('')}</select>`;
  }
  // The chooser's state: open, the baseline, kills typed for each goal (and other monsters), which row takes the rest.
  const ses = { open: false, from: 'prev', kills: {}, rest: null, others: [], reduce: '', hidden: null, note: null };
  const slayerGoals = () => P.goals().filter(isSlayerGoal).filter(g => MONSTER_BY_ID.has(g.npc));
  const hpOf = (npc, style) => killXp(npc, style)?.hitpoints || 0;
  // A monster's Slayer goal: the first not reached, else any
  const goalFor = npc => (npc ? slayerGoals().find(g => g.npc === npc && !reached(g)) || slayerGoals().find(g => g.npc === npc) || null : null);
  // The rows the chooser counts: [{ key, npc, style, kills, goal? }], the rest row filled in from what the
  // others leave: the one you pick, else your topmost Slayer goal (the first not reached), unless you've
  // typed its kills ('-': none takes the rest).
  const topGoal = list => list.find(g => !reached(g)) || list[0] || null;
  function sessionRows(gain) {
    const list = slayerGoals();
    const rest = ses.rest === '-' ? null : ses.rest ?? topGoal(list)?.id ?? null;
    const rows = list.map(g => ({ key: g.id, npc: g.npc, style: g.style, goal: g, kills: ses.kills[g.id] ?? 0 }));
    for (const o of ses.others) {
      const found = o.text ? findMonster(o.text) : null;
      if (found?.id) rows.push({ key: o.key, npc: found.id, style: o.style || startStyle(found.id), kills: ses.kills[o.key] ?? 0, other: o });
      else rows.push({ key: o.key, npc: null, kills: 0, other: o, problem: found?.problem });
    }
    const restRow = rows.find(r => r.key === rest && r.npc);
    if (restRow) {
      const others = rows.filter(r => r !== restRow && r.npc && r.kills > 0);
      const left = (gain.hitpoints || 0) - (killsXp(others).hitpoints || 0);
      restRow.kills = Math.max(0, killsFromHp(restRow.npc, restRow.style, left));
      restRow.rest = true;
    }
    return rows;
  }
  function sessionHtml() {
    if (!P.profile() || !slayerGoals().length) return '';
    if (!readMark()) { setMark(); if (!ses.open) return ''; }
    const note = ses.note ? `<div class="msg ok session-msg">${ses.note.html}${ses.note.undo ? ' <button type="button" class="linkish" data-act="ses-undo">Undo</button>' : ''} <button type="button" class="linkish c-faint" data-act="ses-note-close" aria-label="Close">✕</button></div>` : '';
    const gain = sessionGain();
    if (!gain && !ses.open) return note;
    if (!gain) {
      // (opened from a plan, with nothing since the count it's from: an earlier snapshot may have some)
      return `${note}<div class="card session open" data-session="1">
        <div class="bar wrap"><span>No new combat XP since ${fromSelect()}${snapBases().length ? ': pick an earlier snapshot.' : '. Refresh XP after a session, and it\'s counted here.'}</span>
          <span class="grow"></span><button type="button" class="btn small" data-act="ses-cancel">Close</button></div>
      </div>`;
    }
    const sig = JSON.stringify([ses.from, gain]);
    if (ses.hidden === sig && !ses.open) return note;
    const gained = COUNTED_SKILLS.filter(k => gain[k] > 0).map(k => `<b class="c-xp">+${xpText(gain[k])}</b> ${esc(SKILL_BY_KEY.get(k).name)}`).join(', ');
    const list = slayerGoals();
    if (!ses.open) {
      return `${note}<div class="card session" data-session="1">
        <div class="bar wrap"><span>New combat XP since ${fromSelect()}: ${gained} XP.</span>
          <span class="grow"></span>
          <button type="button" class="btn small" data-act="ses-open">Choose what I killed</button>
          <button type="button" class="linkish small-note" data-act="ses-hide" title="Ask again when there's more XP">Not now</button></div>
      </div>`;
    }
    const rows = sessionRows(gain);
    const counted = rows.filter(r => r.npc && r.kills > 0);
    const left = leftOver(gain, counted);
    // (what's left of a kill the line that takes the rest rounds off is that line's: not something else)
    const restRow = rows.find(r => r.rest);
    const slack = restRow ? hpOf(restRow.npc, restRow.style) / 2 : 5;
    const leftHp = Math.abs(left.hitpoints || 0) <= slack ? 0 : left.hitpoints || 0;
    const rowHtml = r => {
      const m = r.npc && MONSTER_BY_ID.get(r.npc);
      const xp = r.npc && r.kills > 0 ? xpList(killsXp([r])) : '';
      const name = r.goal
        ? `<span class="ses-name">${esc(m.name)} <span class="c-faint small-note">(your goal: ${fmt(r.goal.done || 0)} / ${fmt(r.goal.value)})</span></span>`
        : `<span class="ses-name"><input class="input small npc-in" list="npc-names-ses" data-ses-npc="${r.key}" value="${esc(r.other.text || '')}" placeholder="Another monster" aria-label="Another monster" spellcheck="false"></span>`;
      return `<div class="ses-row${r.rest ? ' rest' : ''}">
        ${name}
        <input class="input small num" data-ses="${r.key}" inputmode="numeric" value="${r.kills ? fmt(r.kills) : ''}" placeholder="0" aria-label="Kills"${r.npc ? '' : ' disabled'}>
        <span class="c-faint small-note">kills</span>
        ${r.npc ? (r.rest ? '<span class="rest-tag" title="This one takes whatever XP the others leave">the rest of the XP</span>' : `<button type="button" class="linkish small-note" data-act="ses-rest" data-key="${r.key}" title="Let this one take whatever XP the others leave">the rest</button>`) : ''}
        <span class="small-note">${xp}</span>
        ${r.problem ? `<span class="c-lose small-note">${r.problem}</span>` : ''}
        ${r.other ? `<button type="button" class="x" data-act="ses-del" data-key="${r.key}" aria-label="Remove">✕</button>` : ''}
      </div>`;
    };
    // (what's left over can come off a goal's kills: the XP it was for)
    const cut = g => Math.max(0, Math.min((g.value || 0) - (g.done || 0) - (rows.find(r => r.key === g.id)?.kills || 0), Math.floor(leftHp / Math.max(1, hpOf(g.npc, g.style)))));
    const cutters = leftHp > 0 ? list.filter(g => cut(g) > 0) : [];
    const leftXp = xpList(Object.fromEntries(Object.entries(left).filter(([, x]) => x > 0)));
    const reduceSel = cutters.length ? ` <label class="check">Take it off <select class="input small" data-ses-reduce="1" aria-label="Take it off a goal"><option value="">no goal</option>${cutters.map(g => `<option value="${g.id}"${ses.reduce === g.id ? ' selected' : ''}>your ${esc(MONSTER_BY_ID.get(g.npc).name)} goal: ${fmt(g.value)} → ${fmt(g.value - cut(g))} kills</option>`).join('')}</select></label> <span class="c-faint small-note">(the XP it was for: a goal for some XP needs fewer kills)</span>` : '';
    const leftText = !counted.length
      ? `<div class="ses-left">Not counted yet: ${leftXp} XP. Type the kills of each monster you killed, or click <b>the rest</b> on the one that takes whatever XP the others leave.${reduceSel ? ` All of it from something else?${reduceSel}` : ''}</div>`
      : leftHp > 0
      ? `<div class="ses-left">Left over: ${leftXp} XP, from something else.${reduceSel}</div>`
      : leftHp < 0 ? `<div class="ses-left c-lose">Those come to ${xpText(-leftHp)} more Hitpoints XP than you gained: fewer kills, or another style?</div>`
      : '<div class="ses-left c-faint">That\'s all of it.</div>';
    const any = counted.some(r => r.goal || goalFor(r.npc));
    return `${note}<div class="card session open" data-session="1">
      <div class="shots-title">What did you kill since ${fromSelect()}?</div>
      <p class="note">You gained ${gained} XP. One line takes whatever XP the others leave (a kill's Hitpoints XP is 1.33 a point of damage, whatever the style): your topmost Slayer goal, till you click <b>the rest</b> on another. Type the others' kills, and it follows.</p>
      ${datalist('npc-names-ses')}
      <div class="ses-rows">${rows.map(rowHtml).join('')}</div>
      <div class="bar wrap"><button type="button" class="linkish" data-act="ses-add">+ another monster</button></div>
      ${leftText}
      <div class="bar wrap">
        <button type="button" class="btn small" data-act="ses-count">${any ? 'Count these kills' : ses.reduce && leftHp > 0 ? 'Take it off that goal' : 'Count nothing: skip this XP'}</button>
        <button type="button" class="btn small" data-act="ses-cancel">Cancel</button>
      </div>
    </div>`;
  }
  // Counts kills of goals (rows: [{ goal, kills }]), takes what's left off one (reduce), and moves the mark on.
  function countSession(rows, reduce = null) {
    const undo = snapshot();
    const said = [];
    let most = null;
    for (const row of rows) {
      // (another monster that's one of your goals' after all: that goal's kills)
      const r = row.goal ? row : { ...row, goal: goalFor(row.npc) };
      if (!r.goal || !(r.kills > 0)) continue;
      P.updateGoal(r.goal.id, g => { g.done = Math.min(MAX_KILLS, (g.done || 0) + r.kills); });
      said.push(`${fmt(r.kills)} ${MONSTER_BY_ID.get(r.goal.npc).name} kill${r.kills === 1 ? '' : 's'}`);
      if (!most || r.kills > most.kills) most = r;
    }
    let cut = '';
    if (reduce) {
      let to = 0;
      P.updateGoal(reduce.goal.id, g => { g.value = Math.max(g.done || 1, g.value - reduce.by); to = g.value; });
      cut = `Your ${esc(MONSTER_BY_ID.get(reduce.goal.npc).name)} goal is ${fmt(reduce.by)} kill${reduce.by === 1 ? '' : 's'} fewer, ${fmt(to)}: the XP they were for.`;
    }
    setMark();
    ses.open = false; ses.from = 'prev'; ses.kills = {}; ses.rest = null; ses.others = []; ses.reduce = '';
    // (and the loot of those kills, next: read from screenshots into that goal's plan)
    const loot = most ? ` <button type="button" class="linkish" data-act="ses-loot" data-goal-id="${most.goal.id}">Read the ${esc(MONSTER_BY_ID.get(most.goal.npc).name)} loot from screenshots</button>` : '';
    const html = [said.length ? `Counted: ${esc(listText(said))}.` : '', cut].filter(Boolean).join(' ');
    ses.note = { html: html ? `${html}${loot}` : 'Skipped: that XP isn\'t counted as kills.', undo };
  }

  // The dry checker: any drop, any number of kills without it.
  function dryHtml(goal, drops) {
    const rare = [...drops].filter(([s, d]) => d.p < 1 && d.p > 0 && taken(goal, s));
    if (!rare.length) return '';
    const pick = dryPick.get(goal.id) || {};
    // (the rarest drop worth the most, to start with)
    const start = rare.map(([s, d]) => [s, d, (worthOf(s) || 0) * d.q]).sort((a, b) => b[2] - a[2] || a[1].p - b[1].p)[0][0];
    const slug = drops.has(pick.item) && drops.get(pick.item).p < 1 ? pick.item : start;
    const d = drops.get(slug);
    const k = pick.kills ?? (goal.done && !(goal.got?.[slug] > 0) ? goal.done : Math.round(1 / d.p) * 2);
    const sentence = k > 0 ? drySentence(ITEMS[slug]?.name || slug, d.p, k) : '';
    const opts = rare.sort((a, b) => itemName(a[0]).localeCompare(itemName(b[0]))).map(([s, x]) => `<option value="${s}"${s === slug ? ' selected' : ''}>${esc(ITEMS[s]?.name || s)} (${esc(rateText(x.p))})</option>`).join('');
    return `<div class="plan-sec dry"><h4>How dry is dry?</h4>
      <div class="bar wrap"><select class="input small" data-dry-item="1" aria-label="Drop">${opts}</select>
        <span class="c-muted">after</span> <input class="input small num" data-dry-kills="1" inputmode="numeric" value="${k ? fmt(k) : ''}" placeholder="Kills" aria-label="Kills without it"> <span class="c-muted">kills without one</span></div>
      <div class="dry-out">${sentence ? `<span>${esc(sentence)}</span>` : '<span class="c-faint">Type how many kills.</span>'}
        <span class="c-faint small-note">${esc(`Half of players have one by ${fmt(killsFor(d.p, 0.5))} kills; 9 in 10 by ${fmt(killsFor(d.p, 0.9))}, and 99 in 100 by ${fmt(killsFor(d.p, 0.99))}.`)}</span></div>
    </div>`;
  }

  // ── Loot from screenshots ───────────────────────────────────────────────
  // Each screenshot is a trip's loot, read from the inventory (the bank can be
  // open: its side panel is the inventory). What a monster doesn't drop is left
  // out, and what you bring each trip is taken off; you check the rest (any
  // amount can be changed), then it's added to what you got, and to your bank
  // too if you like.
  async function readInventories(files) {
    const seen = new Set();
    const list = [...files].filter(f => f && (/^image\//.test(f.type) || /\.png$/i.test(f.name || ''))).filter(f => {
      const key = `${f.name}|${f.size}|${f.lastModified}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!list.length) return { error: 'That isn\'t a picture. Use the PNG screenshots LostKit saves.' };
    const { B, D, icons } = await P.getReader();
    const reads = [];
    for (const f of list) {
      const name = f.name || 'Pasted picture';
      // (which file it is: a goal remembers the screenshots whose loot it has, so none is counted twice)
      const file = { name, key: `${f.name}|${f.size}|${f.lastModified}`, at: f.lastModified || 0 };
      try {
        const bmp = await createImageBitmap(f);
        const r = B.readInventory(P.pixelsOf(bmp, bmp.width, bmp.height), icons, D.STACK_FONT);
        bmp.close?.();
        reads.push({ ...file, ...r });
      } catch (e) {
        reads.push({ ...file, ok: false, why: 'unreadable' });
      }
    }
    // (in the order they were taken: the last is the latest)
    reads.sort((a, b) => a.at - b.at);
    return { B, reads, count: list.length };
  }
  async function readLoot(goalId, files) {
    const goal = goalOf(goalId);
    if (!goal) return;
    shots.set(goalId, { busy: [...files].length });
    P.renderGoals();
    try {
      const got = await readInventories(files);
      if (got.error) { shots.set(goalId, { error: got.error }); P.renderGoals(); return; }
      const { B, reads } = got;
      const sh = { B, reads, one: false, again: false, early: false, edited: new Set(), alchKills: tripKills(goal), alch: {}, alchEdited: false, ...lootReview(goal, B, reads, {}) };
      startAlch(goal, sh);
      shots.set(goalId, sh);
      prices.want(sh.rows.map(r => r.slug));
    } catch (e) {
      shots.set(goalId, { error: e?.message || String(e) });
    }
    P.renderGoals();
  }
  // The review of some screenshots of loot: each one a trip, or (one) all of
  // them the same trip, when only the last counts (it shows all that trip's
  // loot so far). What a monster doesn't drop is left out; what you bring comes
  // off each trip. A screenshot whose loot the goal has already is left out
  // too, unless you say to count it again (again), and so is one taken before
  // the goal was set, unless you say to count it (early): its loot is from before.
  function lootReview(goal, B, reads, { one = false, again = false, early = false } = {}) {
    const before = new Set(goal.shots || []);
    const isEarly = r => !!(goal.created && r.at && r.at < goal.created);
    const ok = reads.filter(r => r.ok && (again || !before.has(r.key)) && (early || !isEarly(r)));
    const use = one ? ok.slice(-1) : ok;
    const drops = dropsOf(goal.npc, goalOpts(goal));
    const bring = goal.bring || {};
    const sum = B.sumReads(use);
    // Two items with one icon: the one this monster drops, where only one of them is.
    const rows = B.reviewRows(sum, { likelier: P.LIKELIER_TWIN });
    for (const r of rows) {
      if (!r.choices) continue;
      const its = r.choices.filter(c => drops.has(c));
      if (its.length === 1) r.slug = its[0];
    }
    const keep = rows.filter(r => drops.has(r.slug) || r.choices?.some(c => drops.has(c)));
    const skipped = rows.filter(r => !keep.includes(r));
    const trips = use.length;
    const amounts = {}, brought = {};
    for (const r of keep) {
      const less = Math.min(r.count, (bring[r.slug] || 0) * trips);
      brought[r.key] = less;
      amounts[r.key] = r.count - less;
    }
    // (what you leave on the ground isn't ticked: you won't have picked it up)
    const off = new Set(keep.filter(r => !taken(goal, r.slug)).map(r => r.key));
    // (the coins: some may be what alching on the way made, v3.2)
    const coinsKey = keep.find(r => r.slug === 'coins')?.key || null;
    const coinsRead = coinsKey ? amounts[coinsKey] : 0;
    return { rows: keep, skipped, others: sum.others, unknown: sum.unknown, off, amounts, brought, trips, used: use.map(r => r.key), coinsKey, coinsRead,
      repeats: reads.filter(r => r.ok && before.has(r.key)).length, earlier: reads.filter(r => r.ok && !before.has(r.key) && isEarly(r)).length };
  }
  function shotsHtml(goal, sh) {
    if (sh.error) return `<div class="msg error">${esc(sh.error)} <button type="button" class="linkish" data-act="loot-discard">Close</button></div>`;
    if (sh.busy) return `<div class="shots-drop"><span class="busy">Reading ${sh.busy} screenshot${sh.busy === 1 ? '' : 's'}…</span></div>`;
    const m = MONSTER_BY_ID.get(goal.npc);
    const bad = sh.reads.filter(r => !r.ok);
    const ok = sh.reads.length - bad.length;
    const problems = bad.map(r => `<li><b>${esc(r.name)}</b>: ${r.why === 'no-inventory' ? 'nothing in an inventory in this one.' : 'couldn\'t open this picture.'}</li>`).join('');
    const got = goal.got || {};
    const rows = sh.rows.map(it => {
      const read = it.approx ? `≈${esc(gpShort(it.count))}` : fmt(it.count);
      const name = it.choices
        ? `<select class="input small shot-as" data-loot-as="${it.key}" aria-label="Which item this is" title="These look exactly the same in the game: pick the one this is">${it.choices.map(c => `<option value="${c}"${c === it.slug ? ' selected' : ''}>${itemName(c)}</option>`).join('')}</select>`
        : itemName(it.slug);
      const unsure = it.unsure ? ' <span class="shot-check" title="A close call between items that look alike: check this one">check</span>' : '';
      const brought = sh.brought[it.key] ? ` · ${fmt(sh.brought[it.key])} you bring taken off` : '';
      const left = !taken(goal, it.slug) ? ' · you leave it on the ground' : '';
      const alching = it.key === sh.coinsKey && alchOn(sh) && alchCoinsOf(sh) ? ` · ${fmt(alchCoinsOf(sh))} from alching` : '';
      return `<label class="shot-row"><input type="checkbox" data-loot-shot="${it.key}"${sh.off.has(it.key) ? '' : ' checked'}>
        ${itemIcon(it.slug, true)} <span class="shot-name">${name}${unsure}</span>
        <input class="input small num" data-loot-n="${it.key}" inputmode="numeric" value="${fmt(sh.amounts[it.key] ?? it.count)}" aria-label="${esc(ITEMS[it.slug]?.name || it.slug)} to add" title="How many to add to your loot">
        <span class="shot-was c-faint">read ${read}${brought}${alching}${left}${got[it.slug] ? ` · you have ${fmt(got[it.slug])}` : ''}</span></label>`;
    }).join('');
    const skipped = sh.skipped.length + sh.others + sh.unknown;
    const names = [...new Set(sh.skipped.map(r => ITEMS[r.slug]?.name || r.slug))];
    return `<div class="card shots-result loot-shots" data-drop="1">
      <div class="shots-title">From ${ok} screenshot${ok === 1 ? '' : 's'}: ${sh.rows.length} kind${sh.rows.length === 1 ? '' : 's'} of ${esc(m?.name || 'its')} loot</div>
      ${sh.repeats ? `<label class="check loot-one" title="This goal has these screenshots' loot already: counting them again counts that loot twice"><input type="checkbox" data-loot-again="1"${sh.again ? ' checked' : ''}> ${sh.repeats === ok ? (ok === 1 ? 'You\'ve added this one\'s loot before' : `You've added all ${ok} of these before`) : `${fmt(sh.repeats)} of these you've added before`}, so ${sh.again ? 'they count again' : `${sh.repeats === 1 ? 'it\'s' : 'they\'re'} left out`}: count ${sh.repeats === 1 ? 'it' : 'them'} again</label>` : ''}
      ${sh.earlier ? `<label class="check loot-one" title="Taken before you set this goal: what it shows was picked up before it"><input type="checkbox" data-loot-early="1"${sh.early ? ' checked' : ''}> ${sh.earlier === ok ? (ok === 1 ? 'This one was' : `All ${ok} of these were`) : `${fmt(sh.earlier)} of these ${sh.earlier === 1 ? 'was' : 'were'}`} taken before you set this goal, so ${sh.early ? `${sh.earlier === 1 ? 'it counts' : 'they count'}` : `${sh.earlier === 1 ? 'it\'s' : 'they\'re'} left out`}: count ${sh.earlier === 1 ? 'it' : 'them'} too</label>` : ''}
      ${sh.trips > 1 || sh.one ? `<label class="check loot-one" title="A screenshot shows everything picked up on its trip so far: of several taken on one trip, only the last counts"><input type="checkbox" data-loot-one="1"${sh.one ? ' checked' : ''}> They're all one trip: count only the last one</label>` : ''}
      <p class="note">${sh.one ? 'Only the last screenshot counts: it has all that trip\'s loot' : 'Each screenshot counts as a trip\'s loot'}${Object.keys(goal.bring || {}).length ? ', less what you bring each trip' : ''}. ${skipped ? `${fmt(skipped)} other slot${skipped === 1 ? '' : 's'} ${skipped === 1 ? 'was' : 'were'} left out${names.length ? `: ${esc(names.slice(0, 8).join(', '))}${names.length > 8 ? ' …' : ''}, which ${esc(m?.name || 'it')} doesn't drop` : ''}.` : ''} Change any amount, or untick what wasn't from these kills (what you had with you before them: or set <b>what you bring</b>, and it's taken off every time).
        <b>Add to my loot</b> counts it as these kills' loot; then <b>Deposit to my bank…</b> under the table puts what isn't in your bank yet into it.</p>
      ${problems ? `<ul class="shot-problems">${problems}</ul>` : ''}
      ${rows ? `<div class="shot-list">${rows}</div>` : `<p class="c-faint">None of what ${esc(m?.name || 'it')} drops is in these screenshots.</p>`}
      ${alchHtml(goal, sh)}
      <div class="bar wrap">
        ${rows || alchCoinsOf(sh) ? '<button type="button" class="btn small" data-act="loot-apply">Add to my loot</button>' : ''}
        <button type="button" class="btn small" data-act="loot-discard">${rows ? 'Discard' : 'Close'}</button>
      </div>
    </div>`;
  }
  // The review's lines as amounts: { item: n }
  function shotAmounts(sh) {
    const out = {};
    for (const r of sh.rows) {
      if (sh.off.has(r.key)) continue;
      const n = sh.amounts[r.key] ?? r.count;
      if (n > 0) out[r.slug] = (out[r.slug] || 0) + n;
    }
    return out;
  }
  function applyLoot(goalId) {
    const sh = shots.get(goalId);
    const goal = goalOf(goalId);
    if (!sh?.rows || !goal) return;
    const undo = snapshot();
    const add = shotAmounts(sh);
    // (what was alched on the way: loot too, alched; the coins it made aren't coins dropped)
    const alchedNow = alchOn(sh) ? Object.entries(sh.alch || {}).filter(([, n]) => n > 0) : [];
    for (const [slug, n] of alchedNow) add[slug] = (add[slug] || 0) + n;
    P.updateGoal(goalId, g => {
      const got = { ...(g.got || {}) };
      for (const [slug, n] of Object.entries(add)) got[slug] = (got[slug] || 0) + n;
      g.got = got;
      if (alchedNow.length) g.alch = [...new Set([...(g.alch || []), ...alchedNow.map(([slug]) => slug)])];
      // (the screenshots it's from: not counted again; and the kills it's for, so the next trips' are told apart)
      g.shots = [...new Set([...(g.shots || []), ...(sh.used || [])])].slice(-400);
      g.lootDone = g.done || 0;
    });
    shots.delete(goalId);
    const alchedSet = new Set(alchedNow.map(([slug]) => slug));
    const lines = Object.entries(add).map(([s, n]) => `${fmt(n)} ${ITEMS[s]?.name || s}${alchedSet.has(s) ? ' (alched)' : ''}`);
    const what = lines.length > 6 ? `${lines.slice(0, 6).join(', ')} and ${lines.length - 6} more` : listText(lines);
    say(goalId, lines.length ? `Added to your loot: ${esc(what)}.` : 'Nothing was added.', undo);
  }

  // ── Alching on the way (v3.2) ───────────────────────────────────────────
  // The coins a loot screenshot shows are coins dropped and the coins alching
  // made on the way. What was alched is guessed (loot.js guessAlchs) from the
  // kills on those trips, the drop rates and what you alch: what's ticked under
  // Alch, or with none ticked, the drops an alch gives 1,000 coins or more for,
  // and only when there are more coins than the kills would drop. You change it
  // to what you did; the alched drops are loot (alched), and the rest of the
  // coins are coins dropped. What you bring that a cast uses (nature runes, and
  // fire runes if you bring them) comes off what you bring.
  const ALCH_WORTH = 1000;
  function alchCandidates(goal, drops) {
    const ticked = (goal.alch || []).filter(s => drops.has(s) && canAlch(s) && taken(goal, s));
    if (ticked.length) return ticked;
    return [...drops.keys()].filter(s => canAlch(s) && taken(goal, s) && highAlch(s) >= ALCH_WORTH);
  }
  // The kills on the trips a screenshot is from: since loot was last added, else all of them.
  function tripKills(goal) {
    const done = goal.done || 0, since = done - (goal.lootDone ?? 0);
    return since > 0 ? since : done;
  }
  const alchCoinsOf = sh => Object.entries(sh.alch || {}).reduce((t, [slug, n]) => t + (n > 0 ? n * highAlch(slug) : 0), 0);
  function guessFor(goal, sh) {
    const drops = dropsOf(goal.npc, goalOpts(goal));
    const ticked = (goal.alch || []).some(s => drops.has(s) && canAlch(s));
    const { mean, sd } = coinsDropped(drops.get('coins'), sh.alchKills);
    // (with nothing ticked under Alch, only coins well over what the kills drop say there was alching)
    if (!ticked && !(sh.coinsRead > mean + 2 * sd + 100)) return {};
    const items = alchCandidates(goal, drops).map(slug => ({ slug, q: drops.get(slug).q, ha: highAlch(slug) }));
    return guessAlchs({ coins: sh.coinsRead || 0, kills: sh.alchKills, coinDrop: drops.get('coins') || null, items }).counts;
  }
  // The guess, and what it shows; then the amounts it changes.
  function startAlch(goal, sh) {
    if (!sh.alchEdited) sh.alch = sh.coinsRead > 0 ? guessFor(goal, sh) : {};
    sh.alchOpen = sh.alchOpen || Object.keys(sh.alch).length > 0;
    syncAlch(goal, sh);
  }
  // The coins dropped are what's read less what alching made; the runes the casts took come off what you bring.
  // (v3.3) The Coins line unticked: the coins aren't these kills', so nothing was alched on these trips either.
  const alchOn = sh => !(sh.coinsKey && sh.off?.has(sh.coinsKey));
  function syncAlch(goal, sh) {
    const casts = alchOn(sh) ? Object.values(sh.alch || {}).reduce((t, n) => t + (n > 0 ? n : 0), 0) : 0;
    if (sh.coinsKey && !sh.edited.has(sh.coinsKey)) sh.amounts[sh.coinsKey] = Math.max(0, sh.coinsRead - (casts ? alchCoinsOf(sh) : 0));
    const bring = goal.bring || {};
    for (const [slug, per] of [['naturerune', 1], ['firerune', 5]]) {
      const r = sh.rows.find(x => x.slug === slug);
      if (!r || !bring[slug] || sh.edited.has(r.key)) continue;
      const less = Math.min(r.count, Math.max(0, bring[slug] * sh.trips - per * casts));
      sh.brought[r.key] = less;
      sh.amounts[r.key] = r.count - less;
    }
  }
  function alchHtml(goal, sh) {
    if (!(sh.coinsRead > 0)) return '';
    const drops = dropsOf(goal.npc, goalOpts(goal));
    const alchable = [...drops.keys()].filter(s => canAlch(s) && taken(goal, s));
    if (!alchable.length) return '';
    if (!alchOn(sh)) return '<div class="alch-guess c-faint small-note">The Coins line is unticked, so nothing alched on these trips is counted either.</div>';
    if (!sh.alchOpen) return `<div class="alch-guess c-faint small-note">The ${fmt(sh.coinsRead)} coins are counted as dropped. <button type="button" class="linkish small-note" data-act="alch-open">Alched something on these trips?</button></div>`;
    const { mean, sd } = coinsDropped(drops.get('coins'), sh.alchKills);
    const counts = sh.alch || {};
    const used = alchCoinsOf(sh);
    // (a line each for what's guessed or typed and what you tick under Alch; anything else from the list)
    const ticked = (goal.alch || []).filter(s => drops.has(s) && canAlch(s) && taken(goal, s));
    const listed = [...new Set([...ticked, ...Object.keys(counts)])].filter(slug => ITEMS[slug]);
    const row = slug => `<label class="shot-row">${itemIcon(slug, true)} <span class="shot-name">${itemName(slug)}</span>
        <input class="input small num" data-alch-n="${slug}" inputmode="numeric" value="${counts[slug] ? fmt(counts[slug]) : ''}" placeholder="0" aria-label="${esc(ITEMS[slug].name)} alched">
        <span class="shot-was c-faint">× ${fmt(highAlch(slug))} = ${fmt((counts[slug] || 0) * highAlch(slug))} coins</span></label>`;
    // (the others worth an alch, dearest first)
    const others = alchable.filter(s => !listed.includes(s) && highAlch(s) >= 100).sort((a, b) => highAlch(b) - highAlch(a) || itemName(a).localeCompare(itemName(b)));
    const dropped = sh.coinsRead - used;
    const kills = `<input class="input small num alch-kills" data-alch-kills="1" inputmode="numeric" value="${sh.alchKills ? fmt(sh.alchKills) : ''}" placeholder="0" aria-label="Kills on these trips" title="The kills on the trips these screenshots are from (since you last added loot)">`;
    return `<div class="card alch-guess">
      <div class="shots-title">Coins, and what you alched</div>
      <p class="note">${fmt(sh.coinsRead)} coins read. ${kills} kills drop about <b>${fmt(Math.round(mean))}</b> coins${sd >= 1 ? ` (most often within ${fmt(Math.round(sd))} of it)` : ''}${!used ? `. Alched some? ${listed.length ? 'Type how many' : 'Pick it from the list'}.` : sh.alchEdited ? `, and <b>${fmt(used)}</b> of them are what you alched.`
        : `, so <b>${fmt(used)}</b> of them look like alching: a guess from the drop rates${(goal.alch || []).length ? ' and what you tick under Alch' : ''}. Change it to what you alched.`}</p>
      <div class="shot-list">${listed.map(row).join('')}</div>
      ${others.length ? `<select class="input small" data-alch-add="1" aria-label="Another item you alched"><option value="">Something else you alched…</option>${others.map(s => `<option value="${s}">${esc(ITEMS[s].name)} (${fmt(highAlch(s))} coins)</option>`).join('')}</select>` : ''}
      <div class="small-note">${dropped < 0 ? `<span class="c-lose">That's ${fmt(-dropped)} coins more alching than the coins read: fewer?</span>` : `Coins dropped: <b>${fmt(dropped)}</b> (the Coins line above).`} What you alched counts as loot, alched: its high alch is its worth, and it goes into your bank as coins.</div>
    </div>`;
  }

  // ── Events (called by planner-ui.js; true when handled) ─────────────────
  function onClick(e, act) {
    const t = e.target;
    const card = t.closest('[data-goal]');
    const goal = card && goalOf(card.dataset.goal);
    // the NPCs tab
    const openBtn = t.closest('[data-npc-open]');
    if (openBtn) { showNpc(openBtn.dataset.npcOpen, !!openBtn.dataset.npcPlan); return true; }
    const sort = t.closest('[data-npc-sort]');
    if (sort) {
      N.sort = sortFrom(sort, sort.dataset.npcSort);
      saveNpcUi(); renderNpcs();
      return true;
    }
    // (v3.3: a monster page's drops, by a column's name)
    const dropSort = t.closest('[data-drop-sort]');
    if (dropSort) { N.dropSort = sortFrom(dropSort, dropSort.dataset.dropSort); saveNpcUi(); renderNpcs(); return true; }
    const band = t.closest('[data-npc-band]');
    if (band) { N.band = band.dataset.npcBand === 'all' ? null : band.dataset.npcBand; N.q = ''; saveNpcUi(); renderNpcs(); return true; }
    const npcRow = t.closest('tr[data-npc]');
    if (npcRow && !t.closest('a, button, input, select')) { showNpc(npcRow.dataset.npc); return true; }
    // (a monster's page: a style's row plans in it)
    const planStyle = t.closest('[data-plan-style]');
    const page = t.closest('[data-npc-page]');
    if (planStyle && page) { N.planStyle[page.dataset.npcPage] = planStyle.dataset.planStyle; renderNpcs(); return true; }
    // a Slayer goal's plan
    if (goal && isSlayerGoal(goal)) {
      const step = t.closest('[data-got-step]');
      if (step) {
        const slug = step.dataset.slug, by = Number(step.dataset.gotStep);
        P.updateGoal(goal.id, g => {
          const got = { ...(g.got || {}) };
          const n = Math.max(0, (got[slug] || 0) + by);
          if (n > 0) got[slug] = n; else delete got[slug];
          g.got = got;
        });
        P.renderGoals();
        return true;
      }
      const dstep = t.closest('[data-done-step]');
      if (dstep) {
        P.updateGoal(goal.id, g => { g.done = Math.min(MAX_KILLS, Math.max(0, (g.done || 0) + Number(dstep.dataset.doneStep))); if (!g.done) delete g.done; });
        P.renderGoals();
        return true;
      }
      const ls = t.closest('[data-loot-sort]');
      if (ls) { lootSort.set(goal.id, sortFrom(ls, ls.dataset.lootSort)); P.renderGoals(); return true; }
    }
    if (!act) return false;
    switch (act.dataset.act) {
      case 'npc-back': showNpc(null); return true;
      case 'npc-tab': P.goTab('npcs'); return true;
      case 'npc-show': showNpc(act.dataset.npc); P.goTab('npcs'); return true;
      case 'npc-plan-loot': {
        const from = goal;
        if (!from) return true;
        const made = planLootFor(from, act.dataset.npc, Number(act.dataset.kills));
        // (said where you clicked, v3.1: its button now opens it)
        fresh.add(made.id);
        P.renderGoals();
        return true;
      }
      case 'npc-goto': fresh.delete(act.dataset.goalId); goTo(act.dataset.goalId); return true;
      case 'npc-sync': P.updateGoal(act.dataset.goalId, g => { g.value = Number(act.dataset.kills); }); P.renderGoals(); return true;
      // loot
      case 'loot-pick': if (goal) pickLoot(goal.id, 'loot'); return true;
      case 'loot-apply': if (goal) { applyLoot(goal.id); P.renderGoals(); } return true;
      case 'alch-open': { const sh = goal && shots.get(goal.id); if (sh?.rows) { sh.alchOpen = true; P.renderGoals(); } return true; }
      case 'loot-discard': if (goal) { shots.delete(goal.id); P.renderGoals(); } return true;
      case 'loot-deposit-open': if (goal) { if (deposits.has(goal.id)) deposits.delete(goal.id); else deposits.set(goal.id, { amounts: {}, off: new Set() }); P.renderGoals(); } return true;
      case 'loot-deposit-cancel': if (goal) { deposits.delete(goal.id); P.renderGoals(); } return true;
      case 'loot-deposit': {
        if (!goal) return true;
        const st = deposits.get(goal.id);
        const diff = bankDiff(goal);
        const amounts = {};
        for (const s of Object.keys(diff.out)) if (!st?.off.has(s)) amounts[s] = st?.amounts[s] ?? diff.out[s];
        const undo = snapshot();
        const r = deposit(goal, amounts);
        deposits.delete(goal.id);
        say(goal.id, r.did.length ? `Put in your bank: ${esc(depositText(r))}. <button type="button" class="linkish" data-act="to-bank" data-skill="slayer">See your bank</button>` : 'Nothing was deposited.', r.did.length ? undo : null);
        P.renderGoals();
        return true;
      }
      case 'loot-clear':
        if (!goal) return true;
        if (!act.dataset.armed) { act.dataset.armed = '1'; act.textContent = 'Click again to clear'; return true; }
        { const undo = snapshot(); P.updateGoal(goal.id, g => { delete g.got; delete g.banked; delete g.shots; }); say(goal.id, 'Your loot is cleared (your bank is as it was).', undo); }
        P.renderGoals();
        return true;
      case 'note-undo': if (goal && notes.get(goal.id)?.undo) { restore(notes.get(goal.id).undo); notes.set(goal.id, { html: 'Undone.' }); P.renderGoals(); } return true;
      case 'note-close': if (goal) { notes.delete(goal.id); P.renderGoals(); } return true;
      // what you bring
      case 'bring-open': if (goal) { if (brings.has(goal.id)) brings.delete(goal.id); else brings.set(goal.id, { items: { ...(goal.bring || {}) } }); P.renderGoals(); } return true;
      case 'bring-cancel': if (goal) { brings.delete(goal.id); P.renderGoals(); } return true;
      case 'bring-save': {
        if (!goal) return true;
        const st = brings.get(goal.id);
        const items = Object.fromEntries(Object.entries(st?.items || {}).filter(([, n]) => n > 0));
        P.updateGoal(goal.id, g => { if (Object.keys(items).length) g.bring = items; else delete g.bring; });
        brings.delete(goal.id);
        say(goal.id, Object.keys(items).length ? `What you bring each trip: ${esc(listText(Object.entries(items).map(([s, n]) => `${fmt(n)} ${ITEMS[s]?.name || s}`)))}. It's taken off each screenshot of your loot.` : 'You bring nothing it drops: screenshots are counted as they are.');
        P.renderGoals();
        return true;
      }
      case 'bring-read': if (goal) pickLoot(goal.id, 'bring'); return true;
      // kills counted from XP
      case 'ses-open': ses.open = true; ses.kills = {}; ses.rest = null; ses.reduce = ''; P.renderGoals(); if (act.dataset.goTop) document.querySelector('#goals-list .session')?.scrollIntoView({ block: 'nearest' }); return true;
      case 'ses-cancel': ses.open = false; ses.from = 'prev'; P.renderGoals(); return true;
      case 'ses-hide': { const g = sessionGain(); ses.hidden = g ? JSON.stringify([ses.from, g]) : null; ses.open = false; P.renderGoals(); return true; }
      case 'ses-add': ses.others.push({ key: `o${Date.now().toString(36)}${ses.others.length}`, text: '' }); P.renderGoals(); return true;
      case 'ses-del': ses.others = ses.others.filter(o => o.key !== act.dataset.key); delete ses.kills[act.dataset.key]; if (ses.rest === act.dataset.key) ses.rest = null; P.renderGoals(); return true;
      case 'ses-rest': ses.rest = act.dataset.key; delete ses.kills[act.dataset.key]; P.renderGoals(); return true;
      case 'ses-count': {
        const gain = sessionGain();
        if (!gain) { ses.open = false; P.renderGoals(); return true; }
        const rows = sessionRows(gain);
        const counted = rows.filter(r => r.npc && r.kills > 0);
        const leftHp = leftOver(gain, counted).hitpoints || 0;
        const g = ses.reduce && goalOf(ses.reduce);
        const per = g ? Math.max(1, hpOf(g.npc, g.style)) : 1;
        const already = g ? rows.find(r => r.key === g.id)?.kills || 0 : 0;
        const by = g && leftHp > 0 ? Math.max(0, Math.min(g.value - (g.done || 0) - already, Math.floor(leftHp / per))) : 0;
        countSession(rows, by ? { goal: g, by } : null);
        P.renderGoals();
        return true;
      }
      case 'ses-undo': if (ses.note?.undo) { restore(ses.note.undo); ses.note = { html: 'Undone: those kills aren\'t counted, and the XP is waiting to be counted again.' }; P.renderGoals(); } return true;
      case 'ses-note-close': ses.note = null; P.renderGoals(); return true;
      case 'ses-loot': { const g = goalOf(act.dataset.goalId); if (g) { goTo(g.id); pickLoot(g.id, 'loot'); } return true; }
    }
    return false;
  }
  function onChange(e) {
    const t = e.target;
    if (t.dataset.npcStyle) { N.style = t.value; saveNpcUi(); renderNpcs(); return true; }
    if (t.dataset.npcOpt) { N[t.dataset.npcOpt] = t.checked; saveNpcUi(); renderNpcs(); return true; }
    if (t.dataset.npcHerbs) { N.herbs = t.value === 'grimy' ? 'grimy' : 'clean'; saveNpcUi(); renderNpcs(); return true; }
    if (t.dataset.planPick) { N.planStyle[t.dataset.planPick] = t.value; renderNpcs(); return true; }
    // (the box that counts kills from XP)
    if (t.dataset.ses) {
      const n = P.parseAmount(t.value);
      if (n == null || n > MAX_KILLS) { t.classList.add('bad'); return true; }
      ses.kills[t.dataset.ses] = Math.floor(n);
      // (typed into the one that takes the rest: it's yours now, and none does)
      const gain = sessionGain();
      if (gain && sessionRows(gain).find(r => r.rest)?.key === t.dataset.ses) ses.rest = '-';
      P.entered(P.renderGoals);
      return true;
    }
    if (t.dataset.sesNpc) { const o = ses.others.find(x => x.key === t.dataset.sesNpc); if (o) { o.text = t.value; o.style = null; } P.entered(P.renderGoals); return true; }
    if (t.dataset.sesReduce != null) { ses.reduce = t.value; P.renderGoals(); return true; }
    if (t.dataset.sesFrom) { ses.from = t.value === 'prev' ? 'prev' : t.value; ses.kills = {}; ses.rest = null; ses.reduce = ''; P.renderGoals(); return true; }
    const card = t.closest('[data-goal]');
    const goal = card && goalOf(card.dataset.goal);
    if (!goal || !isSlayerGoal(goal)) return false;
    if (t.dataset.sopt) {
      P.updateGoal(goal.id, g => {
        const k = t.dataset.sopt;
        if (k === 'style') g.style = t.value;
        else if (k === 'herbs') g.herbs = t.value === 'grimy' ? 'grimy' : 'clean';
        else if (k === 'runes') { if (t.checked) delete g.runesKept; else g.runesKept = true; }
        else if (t.checked) g[k] = true; else delete g[k];
      });
      P.renderGoals();
      return true;
    }
    if (t.dataset.take) {
      P.updateGoal(goal.id, g => {
        const leave = new Set(g.leave || []);
        if (t.checked) leave.delete(t.dataset.take); else leave.add(t.dataset.take);
        if (leave.size) g.leave = [...leave]; else delete g.leave;
      });
      P.renderGoals();
      return true;
    }
    if (t.dataset.alch) {
      P.updateGoal(goal.id, g => {
        const alch = new Set(g.alch || []);
        if (t.checked) alch.add(t.dataset.alch); else alch.delete(t.dataset.alch);
        if (alch.size) g.alch = [...alch]; else delete g.alch;
      });
      P.renderGoals();
      return true;
    }
    if (t.dataset.got) {
      const n = P.parseAmount(t.value);
      if (n == null) { t.classList.add('bad'); return true; }
      t.classList.remove('bad');
      P.updateGoal(goal.id, g => {
        const got = { ...(g.got || {}) };
        if (n > 0) got[t.dataset.got] = n; else delete got[t.dataset.got];
        g.got = got;
      });
      P.entered(P.renderGoals);
      return true;
    }
    if (t.dataset.done) {
      const n = P.parseAmount(t.value);
      if (n == null || n > MAX_KILLS) { t.classList.add('bad'); return true; }
      t.classList.remove('bad');
      P.updateGoal(goal.id, g => { if (n > 0) g.done = Math.floor(n); else delete g.done; });
      P.entered(P.renderGoals);
      return true;
    }
    if (t.dataset.dryItem) { dryPick.set(goal.id, { item: t.value }); P.renderGoals(); return true; }
    if (t.dataset.dryKills) {
      const n = P.parseAmount(t.value);
      if (n == null) { t.classList.add('bad'); return true; }
      dryPick.set(goal.id, { ...(dryPick.get(goal.id) || {}), kills: Math.min(MAX_KILLS, n) });
      P.entered(P.renderGoals);
      return true;
    }
    // (a deposit being made: an amount, or one left out for now; less than nothing takes it back out)
    const dep = deposits.get(goal.id);
    if (dep && t.dataset.dep) {
      const neg = /^\s*[-−]/.test(t.value);
      const n = P.parseAmount(t.value.replace(/^\s*[-−]\s*/, ''));
      if (n == null) { t.classList.add('bad'); return true; }
      dep.amounts[t.dataset.dep] = neg ? -n : n;
      P.entered(P.renderGoals);
      return true;
    }
    if (dep && t.dataset.depOn) { if (t.checked) dep.off.delete(t.dataset.depOn); else dep.off.add(t.dataset.depOn); return true; }
    const br = brings.get(goal.id);
    if (br && t.dataset.bring) {
      const n = P.parseAmount(t.value);
      if (n == null) { t.classList.add('bad'); return true; }
      br.items[t.dataset.bring] = n;
      P.entered(P.renderGoals);
      return true;
    }
    if (br && t.dataset.bringAdd) { if (t.value) br.items[t.value] = br.items[t.value] || 0; P.renderGoals(); return true; }
    const sh = shots.get(goal.id);
    if (sh?.rows) {
      if (t.dataset.lootOne || t.dataset.lootAgain || t.dataset.lootEarly) {
        if (t.dataset.lootOne) sh.one = t.checked; else if (t.dataset.lootAgain) sh.again = t.checked; else sh.early = t.checked;
        Object.assign(sh, lootReview(goal, sh.B, sh.reads, { one: sh.one, again: sh.again, early: sh.early }));
        sh.edited = new Set();
        startAlch(goal, sh);
        P.renderGoals();
        return true;
      }
      // (what was alched on the way: the kills it's guessed from, a count, another item)
      if (t.dataset.alchKills) {
        const n = P.parseAmount(t.value);
        if (n == null || n > MAX_KILLS) { t.classList.add('bad'); return true; }
        sh.alchKills = Math.floor(n);
        startAlch(goal, sh);
        P.entered(P.renderGoals);
        return true;
      }
      if (t.dataset.alchN) {
        const n = P.parseAmount(t.value);
        if (n == null) { t.classList.add('bad'); return true; }
        // (a line typed down to 0 stays, to be seen)
        sh.alch = { ...sh.alch, [t.dataset.alchN]: Math.floor(n) };
        sh.alchEdited = true;
        syncAlch(goal, sh);
        P.entered(P.renderGoals);
        return true;
      }
      if (t.dataset.alchAdd) { if (t.value && ITEMS[t.value]) { sh.alch = { ...sh.alch, [t.value]: sh.alch[t.value] || 0 }; sh.alchOpen = true; } P.renderGoals(); return true; }
      if (t.dataset.lootShot) {
        if (t.checked) sh.off.delete(t.dataset.lootShot); else sh.off.add(t.dataset.lootShot);
        // (the Coins line: what was alched goes with it, and the runes the casts took)
        if (t.dataset.lootShot === sh.coinsKey) { syncAlch(goal, sh); P.renderGoals(); }
        return true;
      }
      if (t.dataset.lootAs) { const r = sh.rows.find(x => x.key === t.dataset.lootAs); if (r && r.choices?.includes(t.value)) r.slug = t.value; P.renderGoals(); return true; }
      if (t.dataset.lootN) {
        const n = P.parseAmount(t.value);
        if (n == null) { t.classList.add('bad'); return true; }
        sh.amounts[t.dataset.lootN] = n;
        sh.edited.add(t.dataset.lootN);
        P.entered(P.renderGoals);
        return true;
      }
    }
    return false;
  }
  function onInput(e) {
    const t = e.target;
    if (t.dataset.npcSearch) { N.q = t.value; applyNpcSearch(); return true; }
    if (t.dataset.npcKills) { N.kills[t.dataset.npcKills] = t.value; return true; }
    if (S.editing && t.closest('[data-form="edit-goal"]') && t.name === 'npc') { S.editing.npc = t.value; return true; }
    // (what's typed into a new Slayer goal survives a redraw)
    if (S.newGoal.skill === SLAYER.key && t.closest('[data-form="goal"]') && (t.name === 'npc' || t.name === 'value')) { (S.newSlayer ||= { npc: '', kills: '' })[t.name === 'npc' ? 'npc' : 'kills'] = t.value; return false; }
    if (t.dataset.sesNpc) { const o = ses.others.find(x => x.key === t.dataset.sesNpc); if (o) o.text = t.value; return true; }
    return false;
  }
  function onSubmit(form) {
    if (form.dataset.form !== 'npc-plan') return false;
    const page = form.closest('[data-npc-page]');
    const npc = page?.dataset.npcPage;
    const n = P.parseAmount(form.kills.value);
    if (!npc) return true;
    if (!(n > 0) || n > MAX_KILLS) { P.showMsg('npcs-msg', `How many kills? Type a number from 1 to ${fmt(MAX_KILLS)}, like 500 or 1.5k.`, 'error'); return true; }
    const goal = addSlayerGoal({ npc, value: Math.floor(n), style: form.style.value, ring: N.ring, legends: N.legends });
    delete N.kills[npc];
    delete N.planStyle[npc];
    P.showMsg('npcs-msg', '');
    goTo(goal.id);
    return true;
  }

  // ── Moving around ───────────────────────────────────────────────────────
  // (id: a monster, or none for the list)
  function showNpc(id, plan = false) {
    N.open = id && MONSTER_BY_ID.has(id) ? id : null;
    if (S.tab === 'npcs' && !$('view-npcs')?.hidden) { renderNpcs(); P.routeChanged(); window.scrollTo({ top: 0 }); }
    if (plan && N.open) document.querySelector('#npcs-body [data-npc-kills]')?.focus();
  }
  // A goal on the Goals tab, its plan open, in view (shown whatever the filter): planner-ui.js's goToGoal.
  const goTo = id => P.goToGoal(id);

  // Screenshots for a goal: its loot, or (v3.1) what you bring. The same picker as the Bank tab's.
  let lootFor = null;
  async function pickLoot(goalId, what = 'loot') {
    lootFor = { goalId, what };
    const files = await P.pickFiles();
    if (files === 'input') return;                 // the plain file button: its change event reads them
    if (files?.length) readPicked(files);
  }
  function readPicked(files) {
    if (!lootFor || !files?.length) return;
    if (lootFor.what === 'bring') readBring(lootFor.goalId, files); else readLoot(lootFor.goalId, files);
  }
  // What you bring, from a screenshot of your inventory: what the monster drops in it.
  async function readBring(goalId, files) {
    const goal = goalOf(goalId);
    if (!goal) return;
    try {
      const got = await readInventories(files);
      if (got.error) { say(goalId, esc(got.error)); P.renderGoals(); return; }
      const ok = got.reads.filter(r => r.ok);
      const drops = dropsOf(goal.npc, goalOpts(goal));
      const rows = got.B.reviewRows(ok.length ? got.B.sumReads(ok.slice(0, 1)) : { items: [] }, { likelier: P.LIKELIER_TWIN });
      const items = {};
      for (const r of rows) {
        const slug = r.choices?.find(c => drops.has(c)) || r.slug;
        if (drops.has(slug)) items[slug] = (items[slug] || 0) + r.count;
      }
      brings.set(goalId, { items });
      if (!ok.length) say(goalId, 'No inventory in that screenshot.');
    } catch (e) {
      say(goalId, esc(e?.message || String(e)));
    }
    P.renderGoals();
  }
  function onLootFiles(files) { readPicked(files); }

  return {
    renderNpcs, goalCard, newGoalHtml, addFromForm, editHtml, saveEdit, planLootButton,
    onClick, onChange, onInput, onSubmit, onLootFiles, readLoot,
    reached, showNpc, sessionHtml,
    get open() { return N.open; },
    // (prices a goal's card wants)
    sellableOf: goal => sellable(dropsOf(goal.npc, goalOpts(goal))),
  };
}
