// Planner+ views: Goals, NPCs, Bank and Prices.
//
// Goals and the bank belong to one account (the "planning for" name), stored
// per account so alts can have their own. The maths lives in planner.js (and
// loot.js for monsters); this file only turns it into LostKit-style panels.
// The NPCs tab and Slayer goals are npc-ui.js's.

import { SKILLS, SKILL_BY_KEY, SKILL_IDS, SLAYER, COMBAT_KEYS, MIN_RANKED_LEVEL, MAX_LEVEL, boundUnrankedLevels, combatFromProfile, combatLevel, combatBreakdown, cheapestLevels } from './skills.js';
import { ITEMS, METHODS, BANK_GROUPS, SALE_GROUPS, PLACES, CHOICES, ICONS_PER_ROW, ICON_SIZE, ICON_SHEET, ICON_SHEET_MORE, UNID_HERBS, ITEM_KINDS, RANGED_GEAR } from './gamedata.js';
import { NPC_INFO } from './npcdata.js';
import { AMMO_KINDS, gearOf, bestGear, bestArrowsFor, killAt, shotsFor, ammoLost, BREAKS } from './ranged.js';
import { indexMethods, planGoal, goalTargetXp10, rankForTop, xp10ForLevel, levelForXp10, bankValue, minorLast, castsIn, xpEach, chanceUnits, sureLevel, averaged, WHOLE, MAX_XP10 } from './planner.js';
import { store, players } from './store.js';
import { toSafeName, toDisplayName, checkName } from './api.js';
import { topPercent, formatPercent } from './totals.js';
import { sortable } from './sortable.js';
import { LIVE_MARKET, highAlch } from './prices.js';
import { createNpcUi, isSlayerGoal } from './npc-ui.js';
import { sortTh, sortFrom, savedSort, sortedBy, tableScrolls, restoreTableScrolls } from './tablesort.js';

// One method index per skill that has calculator data.
const INDEX = {};
for (const key of new Set(METHODS.map(m => m.skill))) INDEX[key] = indexMethods(METHODS.filter(m => m.skill === key));
export const hasCalculator = key => !!INDEX[key];
// Where a skill has a choice of place (which tanner), the index for the one
// picked: the first is the default, and what INDEX holds.
const placeOf = goal => {
  const options = PLACES[goal.skill]?.options || [];
  return options.find(o => o.id === goal.place) || options[0] || null;
};
// The choices a skill's goals have (Smithing: where your bars come from, a ring
// of forging, goldsmith gauntlets), and the ones a goal has in use, in the order
// they apply: the tick boxes, then what was picked from a list. A choice another
// one makes pointless is left out (a ring of forging, when you superheat).
export function choicesInUse(goal) {
  const all = CHOICES[goal.skill] || [];
  const set = goal.opts || {};
  const lists = all.filter(c => c.options).map(c => (c.options.slice(1).some(o => o.id === set[c.id]) ? set[c.id] : null)).filter(Boolean);
  const ticks = all.filter(c => !c.options && set[c.id] && !(c.unless && lists.includes(c.unless))).map(c => c.id);
  return [...ticks, ...lists];
}
const PLACED = {};
// set: what this goal's plan makes of some methods (the XP an Agility Arena
// ticket counts at: planner.js, averaged). It changes with the goal, so only
// the last few of those are kept.
const AVERAGED = new Map();
// A row that takes a level in another skill is left out while the account is
// below it. Magic: craft, the Crafting level of the jewellery and orbs a bank
// plan makes on the way. GATE: per skill, the highest level any row asks for
// (from there on nothing changes).
const GATE = {};
for (const m of METHODS) if (m.craft) GATE[m.skill] = Math.max(GATE[m.skill] || 0, m.craft);
// craft: the account's Crafting level, where the skill has such rows.
function indexFor(goal, set = null, craft = null) {
  const place = placeOf(goal);
  const at = place && place !== PLACES[goal.skill].options[0] ? place.id : null;
  const opts = choicesInUse(goal);
  const gate = GATE[goal.skill] ? Math.min(craft ?? 1, GATE[goal.skill]) : null;
  if (!at && !opts.length && !set && gate == null) return INDEX[goal.skill];
  const rows = () => METHODS.filter(m => m.skill === goal.skill && !(gate != null && m.craft > gate));
  const key = `${goal.skill}|${at || ''}|${opts.join('+')}${gate != null ? `|c${gate}` : ''}`;
  if (!set) return (PLACED[key] ||= indexMethods(rows(), { at, opts }));
  const mine = `${key}|${JSON.stringify(set)}`;
  if (!AVERAGED.has(mine)) {
    AVERAGED.set(mine, indexMethods(rows(), { at, opts, set }));
    if (AVERAGED.size > 24) AVERAGED.delete(AVERAGED.keys().next().value);
  }
  return AVERAGED.get(mine);
}
// Skills whose plans start from the bank (Woodcutting only needs an axe).
const usesBank = key => !!BANK_GROUPS[key];
// Skills with something to price: Agility takes nothing and makes nothing, so
// its plans have no money columns and the Prices tab leaves it out.
const PRICED = Object.fromEntries([...new Set(METHODS.map(m => m.skill))].map(key =>
  [key, METHODS.some(m => m.skill === key && (Object.keys(m.in).length || Object.keys(m.out).length))]));
// The skill buttons on the Bank and Prices tabs (after All, which each of them
// starts with), in the hiscores' order like the skill buttons everywhere else
// (a skill's id is its place on the hiscores).
// (Slayer, the home of monster plans, isn't one of the hiscores' skills yet: its place is 19, after Thieving)
const skillOf = key => (key === SLAYER.key ? SLAYER : SKILL_BY_KEY.get(key));
const inHiscoresOrder = keys => [...keys].sort((a, b) => skillOf(a).id - skillOf(b).id);
const BANK_TABS = inHiscoresOrder(Object.keys(BANK_GROUPS));
// (Slayer's: everything a monster drops)
const PRICE_TABS = inHiscoresOrder([...Object.keys(PRICED).filter(k => PRICED[k]), ...(BANK_GROUPS[SLAYER.key] ? [SLAYER.key] : [])]);
// (v3.1) Every item can be read from a screenshot and valued now, not only the
// planner's. Other, the last tab on the Bank and Prices tabs: what you have
// that no skill's tab lists (a dragon med helm, a quest item).
const OTHER = 'other';
// (v3.3) Gear and Rares, right after All. Each button picks out what it lists, like a skill's, so an
// item can be under more than one (a rune platebody is Gear's and Smithing's, a dragonhide body Gear's
// and Crafting's); All counts each item once. Gear: every weapon and piece of armour (ITEM_KINDS'
// Weapons and Armour) but the rares. Rares: the holiday items and the rest no one can get any more.
// Other: what none of the others list.
const GEAR = 'gear', RARES = 'rares';
const RARE_ITEMS = ['christmas_cracker', 'red_partyhat', 'yellow_partyhat', 'blue_partyhat', 'green_partyhat', 'purple_partyhat', 'white_partyhat',
  'santa_hat', 'halloweenmask_green', 'halloweenmask_blue', 'halloweenmask_red', 'pumpkin', 'easter_egg', 'half_full_wine_jug', 'discofreturning',
  'bunnyears', 'scythe'].filter(s => ITEMS[s]);
const IS_RARE = new Set(RARE_ITEMS);
const GEAR_KINDS = new Set(['Weapons', 'Armour'].map(k => ITEM_KINDS.indexOf(k)).filter(i => i >= 0));
const isGear = slug => !IS_RARE.has(slug) && GEAR_KINDS.has(ITEMS[slug]?.k);
const BANK_VIEWS = [GEAR, RARES, ...BANK_TABS, OTHER];
const PRICE_VIEWS = [GEAR, RARES, ...PRICE_TABS, OTHER];
// Every item a skill's bank tab lists (what Other leaves out, with Gear's and Rares')
const IN_A_TAB = new Set(Object.values(BANK_GROUPS).flatMap(gs => gs.flatMap(g => g.items)));
const inOther = slug => !IN_A_TAB.has(slug) && !isGear(slug) && !IS_RARE.has(slug);
// A view's name: Gear, Rares, Other or the skill's
const viewName = k => (k === GEAR ? 'Gear' : k === RARES ? 'Rares' : k === OTHER ? 'Other' : k === 'all' ? 'All' : skillOf(k).name);
// Whether a view (a button on the Bank tab) lists an item
const viewHas = (k, slug) => (k === 'all' ? true : k === GEAR ? isGear(slug) : k === RARES ? IS_RARE.has(slug) : k === OTHER ? inOther(slug)
  : (BANK_GROUPS[k] || []).some(g => g.items.includes(slug)));
// (v3.3) The columns a plan's table sorts by (tableHtml), and the ones that sort the biggest first the first time.
const PLAN_SORTS = ['level', 'name', 'hp', 'xp', 'shots', 'netitem', 'cheap', 'togoal', 'still', 'have', 'xpbank', 'gross', 'xpeven', 'neteven', 'xptotal', 'netcollect', 'net'];
const PLAN_SORTS_DESC = ['hp', 'xp', 'netitem', 'have', 'xpbank', 'gross', 'xpeven', 'neteven', 'xptotal', 'netcollect', 'net'];
// (and the Prices tab's lists: till one's clicked, each list's own order)
const PRICE_SORTS = ['name', 'market', 'alch', 'mine', 'qty', 'cost'];
// An Agility Arena ticket's rows: what they're exchanged for is counted by a plan as a whole.
const TICKETS = new Set(METHODS.filter(m => m.exchange).map(m => m.id));

// Wording that depends on the skill.
const SKILL_TEXT = {
  herblore: { what: 'Potion', each: 'potion', bankHint: 'herbs, unfinished potions and secondaries' },
  runecraft: { what: 'Rune', each: 'essence', bankHint: 'rune essence' },
  woodcutting: { what: 'Logs', each: 'log', noBank: 'Woodcutting only needs an axe (in this version any axe works at any level), so this plan doesn\'t use your bank.' },
  firemaking: { what: 'Logs', each: 'log', bankHint: 'logs' },
  fletching: { what: 'Item', each: 'action', bankHint: 'logs, bow strings, feathers and arrowtips' },
  crafting: { what: 'Item', each: 'item', bankHint: 'leather, gems, bars, glass or whatever else you craft with' },
  // (made: what the Prices tab calls the things a skill with no bank makes, when it isn't `what`)
  mining: { what: 'Rock or bar', each: 'ore', made: 'Ores and gems', noBank: 'Mining only needs a pickaxe you have the level for (bronze and iron from level 1, steel 6, mithril 21, adamant 31, rune 41), so this plan doesn\'t use your bank.' },
  // (onTheWay and own: what a row's XP and counts take in besides its own, where a step before it is planned through)
  smithing: { what: 'Item', each: 'item', bankHint: 'ore, coal or bars', onTheWay: 'the bars you make on the way', own: 'your own bars' },
  // (takes: what the Prices tab calls what a skill with no bank uses up; net: what Net/item is, when it isn't just what one sells for)
  fishing: { what: 'Fish', each: 'fish', made: 'Fish', takes: 'Bait', net: 'what one fish sells for, less the bait or feather it takes',
    noBank: 'Fishing only needs the gear for the spot, and a bait or a feather for every catch with a rod. Those are listed to buy (what\'s in your bank isn\'t counted), so this plan doesn\'t use your bank.' },
  cooking: { what: 'Food', each: 'item', bankHint: 'raw fish, raw meat, or what a pie, a pizza or a cake is made of', onTheWay: 'the pizza or cake you bake on the way', own: 'baking it' },
  // (worth: what a plan calls the value of what a skill brings in, when it isn't made)
  thieving: { what: 'Target', each: 'theft', made: 'Loot', worth: 'Your loot is worth', net: 'what one theft brings in on average: its coins, and its loot at the price it sells for',
    noBank: 'Thieving takes nothing but a lockpick for some locks, so this plan doesn\'t use your bank. Counts are thefts that work: one that fails gives no XP.' },
  agility: { what: 'Course or obstacle', each: 'lap', noBank: 'Agility takes nothing and makes nothing to sell, so this plan doesn\'t use your bank or any prices.' },
  prayer: { what: 'Bones', each: 'bone', bankHint: 'bones' },
  // (idle: what an empty bank plan says besides, where some rows wait to be asked: a spell that only takes runes)
  magic: { what: 'Spell', each: 'cast', bankHint: 'runes, and what you enchant, superheat or charge (or what those are made of)',
    idle: 'Your bank\'s runes go to the best teleport and combat spell they allow by themselves. A curse, alchemy and the like wait to be asked: click a spell in the table below to train with it, and your bank\'s runes go to it first.' },
  // (kills: a skill trained on monsters. Its rows are counted in kills, can be searched by name, and say what else a kill gives)
  attack: killsText('Food, gear and drops'),
  strength: killsText('Food, gear and drops'),
  defence: killsText('Food, gear, ammunition and drops'),
  hitpoints: killsText('Food, gear, ammunition, runes and drops'),
  // (v3.4: and the ammo the kills take, under Ammo)
  ranged: { ...killsText('Food, gear and drops'),
    noBank: "A kill counts as the monster's hitpoints in damage, however many hits that takes. Food, gear and drops aren't counted, and this plan doesn't use your bank. The ammo its kills take is under Ammo, at your prices." },
};
function killsText(left) {
  return { what: 'Monster', each: 'kill', kills: true,
    noBank: `A kill counts as the monster's hitpoints in damage, however many hits that takes. ${left} aren't counted, so this plan doesn't use your bank or any prices.` };
}
const textFor = key => SKILL_TEXT[key] || { what: 'Make', each: 'action', bankHint: 'the items it uses' };
// The button that opens a goal's plan: its steps and the calculator table under
// them. Named for both, so it's plain where the calculator is.
const PLAN_LABEL = 'Plan (Calculator)';
// A goal's skill when it's the combat level: picked like a skill, with the first of the new goal's buttons.
const COMBAT_PICK = 'combat';
const isCombatGoal = goal => goal.skill === COMBAT_PICK;
const MAX_COMBAT = 126;
// (v3.1) The total level, a goal too: the very first of the buttons, before the
// combat level. Its plan says what your skill goals add, and the least XP that
// gets the rest (a level at a time, always the closest).
const TOTAL_PICK = 'total';
const TOTAL = { name: 'Total level', icon: 'stats' };
const isTotalGoal = goal => goal.skill === TOTAL_PICK;
const TOTAL_SKILLS = SKILLS.filter(s => s.id !== 0);
const MAX_TOTAL = TOTAL_SKILLS.length * MAX_LEVEL;
// Goals with a Plan (Calculator) button: a skill's with calculator data, the combat level's, the total level's, and a Slayer goal's (its kills).
const hasPlan = goal => isCombatGoal(goal) || isTotalGoal(goal) || isSlayerGoal(goal) || hasCalculator(goal.skill);
// A goal's skill can be one of the hiscores', the total level (TOTAL_PICK), the combat level (COMBAT_PICK) or Slayer.
const pickable = key => SKILL_BY_KEY.has(key) || key === TOTAL_PICK || key === COMBAT_PICK || key === SLAYER.key;
// (v3.1) The tick box every plan table starts with: Use where the plan starts
// from your bank, else a word for what the skill does with a row (untick a
// course you won't run, a monster you won't fight).
const TICK = {
  woodcutting: ['Chop', 'trees'], mining: ['Mine', 'rocks'], fishing: ['Catch', 'fish'], thieving: ['Steal', 'targets'], agility: ['Run', 'courses'],
  attack: ['Fight', 'monsters'], strength: ['Fight', 'monsters'], defence: ['Fight', 'monsters'], hitpoints: ['Fight', 'monsters'], ranged: ['Fight', 'monsters'],
};
const tickOf = key => (BANK_GROUPS[key] ? ['Use', 'items'] : TICK[key] || ['Train', 'options']);

// Cheap supplies that shouldn't hold a plan back (still shown as needed).
const DEFAULT_ASSUME = { herblore: ['vial_water'], crafting: ['thread'] };
const ASSUME_LABEL = { herblore: 'vials of water', crafting: 'thread' };
// "Vials of water are", "thread is"
const ASSUME_ONE = { crafting: true };
// Runes the spells on the way take (enchanting jewellery, charging orbs, and
// Superheat Item when that's how you make your bars: a choice, so it's in opt).
const SPELL_RUNES = {};
for (const m of METHODS) {
  for (const v of [m, ...Object.values(m.opt || {})]) {
    if (!v.magic) continue;
    for (const k of Object.keys({ ...(v.in || m.in), ...(v.add || {}) })) if (/rune$/.test(k)) (SPELL_RUNES[m.skill] ||= new Set()).add(k);
  }
}
// In Magic every rune is one of those: runes never hold back what you have to
// enchant, superheat or charge. (A spell that only takes runes is held to them
// all the same: planner.js, heldTo.)
for (const m of METHODS) if (m.skill === 'magic') for (const k of Object.keys(m.in)) if (/rune$/.test(k)) (SPELL_RUNES.magic ||= new Set()).add(k);
// What an item is finished with, rather than made of: the wool an amulet is
// strung with. And what's worn while you work: a ring of forging.
const FINISHING = { crafting: ['ball_of_wool'], smithing: ['ring_of_forging'], magic: ['ball_of_wool'] };
// Round up my supplies never lets these hold it back, and never rounds up to
// them: the supplies above (bought as you go or not), those runes and the
// finishing. Herbs with no vials left are still made into potions, emeralds
// with no runes into rings of dueling, dragonstones with no wool into amulets
// of glory; what's short of them is collected with the rest. And 60 spare balls
// of wool don't call for 60 more dragonstones.
export const minorOf = key => new Set([...(DEFAULT_ASSUME[key] || []), ...(SPELL_RUNES[key] || []), ...(FINISHING[key] || [])]);
// "Vials of water never hold it back", for the tooltip
const MINOR_TEXT = { herblore: 'Vials of water never hold', crafting: 'Thread, runes and balls of wool never hold', smithing: 'Rings of forging and runes never hold', magic: 'Runes and balls of wool never hold' };
// (Up to v3.0 tools and thread were read from a screenshot but not added to
// your bank. From v3.1 every item is: a plan names tools, it never counts them.)
// Two items with the very same icon: which one a screenshot's stack is read as
// until you say otherwise. Soda ash is banked for glass far more often than
// ashes are kept. (Up to v2.5.0 it was filed under Ashes without asking.)
// Every raw meat has one icon, and cooked meat looks like ugthanki meat and
// rabbit: beef and plain cooked meat are the ones banks hold.
const LIKELIER_TWIN = { ashes: 'soda_ash', raw_ugthanki_meat: 'raw_beef', cooked_ugthanki_meat: 'cooked_meat' };
// With no method picked and nothing in the bank to go on, plans finish with the
// classic way to train: bows, cut and strung, for Fletching.
// For Mining it's a rock: a bar's row is several ores at once, so its XP says
// nothing about how fast it is.
// For Cooking a fish: a curry is the most XP there is, and nobody trains on it.
// For Thieving a pocket to pick: a chest is the most XP, and empty for minutes
// after. For Agility a course: an Agility Arena ticket's XP says nothing about
// how long it takes.
// For Magic a combat spell: a curse is more XP a cast, and can't be cast twice
// on the same target.
const DEFAULT_FILL_GROUP = { fletching: 'Bows', mining: 'Rocks', cooking: 'Fish', thieving: 'NPCs', agility: 'Courses', magic: 'Combat' };
// What burying a bone gives (Prayer's rows), for the bones a plan's kills leave.
const BURY_XP = Object.fromEntries(METHODS.filter(m => m.skill === 'prayer').map(m => [Object.keys(m.in)[0], m.xp]));
// The monster search: words of a name, and a number for a combat level ("giant", "skeleton 22").
export const searchTerms = text => String(text || '').toLowerCase().split(/\s+/).filter(Boolean);
export const searchHit = (name, cb, terms) => terms.every(t => (/^\d+$/.test(t) ? String(cb) === t : name.includes(t)));
// Every bank item, skill by skill and group by group as the data lists them
// (the All view's order for a bank typed in by hand: it stays as it was when
// the skill buttons went into the hiscores' order).
const SKILL_ORDER = new Map([...new Set(Object.values(BANK_GROUPS).flatMap(gs => gs.flatMap(g => g.items)))].map((s, i) => [s, i]));
// (v3) The skill an item first belongs to, for the All view by skill: the first
// of the skills that list it, in the order the data has them. Slayer comes last,
// so its own are what only monsters drop.
const ORIGIN = new Map();
for (const [key, groups] of Object.entries(BANK_GROUPS)) for (const g of groups) for (const slug of g.items) if (!ORIGIN.has(slug)) ORIGIN.set(slug, key);
// (v3.3) And with Gear and Rares, which come first as their buttons do: a rune platebody is under Gear
// there, not Smithing (each item once); null is Other.
const homeOf = slug => (IS_RARE.has(slug) ? RARES : isGear(slug) ? GEAR : ORIGIN.get(slug) ?? null);
const TARGET_TTL = 30 * 60e3;          // re-check who holds a rank after this long
const PROFILE_TTL = 5 * 60e3;

// Every unidentified herb is one "Unid herb" entry (they're all a plain "Herb"
// in-game). Banks saved by v2.0.0 kept each kind apart: fold those in. (Not an
// item of its own, v3.1: a quest's "Unidentified herb (ardrigal)" or chemical powder.)
export function mergeUnids(items) {
  const out = { ...items };
  let changed = false;
  for (const k of Object.keys(out)) {
    if (!k.startsWith('unidentified_') || k === UNID_HERBS.item || ITEMS[k]) continue;
    out[UNID_HERBS.item] = (out[UNID_HERBS.item] || 0) + (Number(out[k]) || 0);
    delete out[k];
    changed = true;
  }
  return { changed, items: out };
}

// "1,500", "1.5k", "2m" -> number; '' -> 0; nonsense -> null
export function parseAmount(text) {
  const s = String(text ?? '').trim().toLowerCase().replace(/[\s,_]/g, '');
  if (!s) return 0;
  const m = s.match(/^(\d+(?:\.\d+)?)([kmb])?$/);
  if (!m) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1;
  return Math.min(2_147_483_647, Math.floor(parseFloat(m[1]) * mult));
}

// 3405 -> "3,405", 15_120_000 -> "15.1M", 250_000 -> "250K"
export function gpShort(n) {
  if (n == null || !Number.isFinite(n)) return '?';
  const a = Math.abs(n), sign = n < 0 ? '−' : '';
  if (a >= 1e9) return sign + trim(a / 1e9, 2) + 'B';
  if (a >= 1e7) return sign + trim(a / 1e6, 1) + 'M';
  if (a >= 1e6) return sign + trim(a / 1e6, 2) + 'M';
  if (a >= 1e5) return sign + Math.round(a / 1e3) + 'K';
  if (a < 10 && a % 1) return sign + trim(a, 2);
  return sign + Math.round(a).toLocaleString();
}
const trim = (v, d) => v.toLocaleString(undefined, { maximumFractionDigits: d });
// What to collect is whole items: thread goes 0.2 at a time (a reel lasts five
// items), and 13.2 reels to collect is 14.
const whole = n => (Number.isInteger(n) ? n : Math.ceil(n - 1e-9));

// An amount one item takes, for a tooltip: 5, 0.2 (thread), or a share of
// something that lasts many (a ring of forging: 1/140 a bar, 1/28 a platebody).
export function amountText(n) {
  if (Number.isInteger(n) || Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-9) return String(n);
  const d = 1 / n;
  if (n < 1 && Math.abs(d - Math.round(d)) < 1e-6) return `1/${Math.round(d)}`;
  return String(Math.round(n * 1000) / 1000);
}

// XP in tenths, shown the way the game does (a decimal only when there is one).
export const xpText = x10 => (x10 % 10
  ? (x10 / 10).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  : (x10 / 10).toLocaleString());

// A tiny key/value store in IndexedDB, for what localStorage can't hold (the
// file the screenshot picker last opened). Any failure just means "not saved".
const idb = (() => {
  let db = null;
  const open = () => db || (db = new Promise((resolve, reject) => {
    const req = indexedDB.open('skills-plus', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
  const run = (mode, fn) => open().then(d => new Promise((resolve, reject) => {
    const tx = d.transaction('kv', mode);
    const req = fn(tx.objectStore('kv'));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  }));
  return {
    get: key => run('readonly', st => st.get(key)).catch(() => null),
    set: (key, value) => run('readwrite', st => st.put(value, key)).catch(() => null),
  };
})();

export function createPlanner(ctx) {
  const { api, totals, prices, esc, fmt, ago, iconImg, showMsg, errorText, combatCard } = ctx;
  const $ = id => document.getElementById(id);
  // Item icons come from the sheet the data names, stamp and all: where an icon
  // sits is in ITEMS, so the two must be from the same release. (A browser that
  // still held the last release's items.png showed every icon wrong after
  // v2.6.0.) The stylesheet's plain items.png is only what's there before this.
  // (v3.1: every other item's icon is on a sheet of its own, items-more.png)
  const sheet = document.createElement('style');
  sheet.textContent = `.item { background-image: url('${ICON_SHEET}'); } .item.more { background-image: url('${ICON_SHEET_MORE}'); }`;
  document.head.appendChild(sheet);
  const ui = store.get('planUi', {});
  const S = {
    account: store.get('plan.account', null) || ctx.defaultAccount?.() || null,
    profile: null,
    loading: false,
    error: null,
    // (skill: one of the skills, or COMBAT_PICK for the combat level, which is a goal too)
    newGoal: { skill: pickable(ui.newSkill) ? ui.newSkill : 'herblore', type: ['level', 'xp', 'rank', 'top'].includes(ui.newType) ? ui.newType : 'level' },
    open: new Set(Array.isArray(ui.open) ? ui.open : []),
    // (v3.3: { key, desc }, a column's name clicked; up to v3.2 a Sort button's name)
    sort: savedSort(ui.sort, PLAN_SORTS, PLAN_SORTS_DESC),
    show: ['all', 'active', 'done'].includes(ui.show) ? ui.show : 'all',     // goal filter: status
    // goal filter (v3.3): the skills picked, any number of them (none: every goal); was one skill
    only: new Set((Array.isArray(ui.only) ? ui.only : ui.only ? [ui.only] : []).filter(pickable)),
    onlyOne: !!ui.onlyOne,                                                   // (v3.3.1) the skills' buttons one at a time
    visible: [],                                                              // goal ids shown, in order
    bankView: ui.bankView === 'all' || BANK_VIEWS.includes(ui.bankView) ? ui.bankView : 'all',   // Bank tab: everything, one skill's items, or Other
    allSort: ['value', 'skill'].includes(ui.allSort) ? ui.allSort : 'yours',   // Bank tab, All: your order, most valuable first, or by skill (v3)
    // Prices tab: every item, or one skill's. (Kept under a name of its own since
    // v2.10.1, when All came in: it opens on All the first time, then on what you
    // last looked at.)
    priceView: PRICE_VIEWS.includes(ui.priceView) ? ui.priceView : 'all',
    priceSort: ui.priceSort && PRICE_SORTS.includes(ui.priceSort.key) ? { key: ui.priceSort.key, desc: !!ui.priceSort.desc } : null,   // (v3.3)
    priceQ: '',                               // (v3.1) the Prices tab's search: any item at all
    priceHl: null,                            // (v3.2) the item an item's link came to see: its line stands out
    pq: (() => { const q = store.get('priceQty', {}); return q && typeof q === 'object' ? q : {}; })(),   // (v3.2) how many of each, for planning
    pqOnly: false,                            // (v3.2) the Prices tab shows just what has a quantity
    addQ: '',                                 // (v3.1) the Bank tab's Other: an item being added by name
    tgroup: ui.tgroup && typeof ui.tgroup === 'object' ? ui.tgroup : {},     // plan table: which group, per skill
    rankLoading: new Set(),
    goalErr: {},
    tab: null,
    more: new Set(),                          // goals showing what else their bank could make
    editing: null,                            // the goal being changed: { id, type, draft, problem }
    search: {},                               // goal id -> what's typed in its monster search
    hideOff: !!ui.hideOff,                    // plan tables leave out the rows unticked under Use
    tableOff: new Set(ui.tableOff || []),     // goals whose plan has its table of every option hidden
  };
  // The All view's items can be dragged into your own order (not by their
  // amount box, which is for typing). Set up in wire().
  let bankDrag = null;
  // So can the lines under From your bank: the top one gets your bank first.
  let stepDrag = null;
  // (v3.3) And the goals themselves, by their heads.
  let goalDrag = null;
  const saveUi = () => store.set('planUi', { newSkill: S.newGoal.skill, newType: S.newGoal.type, open: [...S.open], sort: S.sort, show: S.show, only: [...S.only], onlyOne: S.onlyOne, priceView: S.priceView, priceSort: S.priceSort, bankView: S.bankView, allSort: S.allSort, tgroup: S.tgroup, hideOff: S.hideOff, tableOff: [...S.tableOff] });
  // The items of one skill's bank tab, or of the whole bank ('all'), that you have.
  // (v3.3: or Gear's, Rares' or Other's: Other is what no other button lists)
  function bankSubset(items, view) {
    const list = view === 'all' ? Object.keys(items) : view === OTHER ? Object.keys(items).filter(inOther)
      : view === GEAR ? Object.keys(items).filter(isGear) : view === RARES ? RARE_ITEMS
      : [...new Set((BANK_GROUPS[view] || []).flatMap(g => g.items))];
    const out = {};
    for (const slug of list) if (items[slug] > 0 && ITEMS[slug]) out[slug] = items[slug];
    return out;
  }

  // The All view's order: yours (items dragged around), else the order they
  // have in your bank in-game (slots, from screenshots), else skill by skill
  // (SKILL_ORDER). Items an order doesn't know yet go after the ones it does.
  function allOrder(b, slugs) {
    const slot = b.slots || {};
    const at = s => slot[s] ?? Infinity;
    const tab = s => SKILL_ORDER.get(s) ?? Infinity;
    const base = [...slugs].sort((x, y) => (at(x) - at(y)) || (tab(x) - tab(y)) || x.localeCompare(y));
    if (!Array.isArray(b.order)) return base;
    const have = new Set(slugs);
    const mine = b.order.filter(s => have.has(s));
    const placed = new Set(mine);
    return [...mine, ...base.filter(s => !placed.has(s))];
  }

  // ── The NPCs tab and Slayer goals (npc-ui.js) ───────────────────────────
  // Made the first time they're asked for, once everything here is set up.
  let npcUi = null;
  const npc = () => npcUi || (npcUi = createNpcUi({
    esc, fmt, gpShort, xpText, iconImg, itemIcon, itemName, marketLink, priceTip, prices, S, $,
    parseAmount, searchTerms, searchHit, entered, LIKELIER_TWIN, PLAN_LABEL,
    buryXp: item => BURY_XP[item] || 0,
    goals, saveGoals, updateGoal, bank, saveBank, currentOf, saveUi, safe,
    account: () => S.account,
    profile: () => S.profile,
    renderAccount, renderGoals, showMsg,
    goTab: tab => ctx.goTab(tab),
    routeChanged: () => ctx.routeChanged?.(),
    getReader, pixelsOf,
    pickFiles: () => pickFiles('loot-file'),
    hideOffBox: (...a) => hideOffBox(...a),
    priceLink: slug => priceLink(slug), pricedLine: slug => pricedLine(slug), moveButtons: (...a) => moveButtons(...a),
    goToGoal: id => goToGoal(id), showNewGoal: id => showNewGoal(id),
  }));

  // ── Storage per account ─────────────────────────────────────────────────
  const safe = () => (S.account ? toSafeName(S.account) : '');
  const goals = () => (safe() ? store.get('goals.' + safe(), []) : []);
  const saveGoals = list => { store.set('goals.' + safe(), list); ctx.onChange?.(); };
  function bank() {
    if (!safe()) return { items: {}, updated: 0 };
    const b = store.get('bank.' + safe(), { items: {}, updated: 0 });
    const merged = mergeUnids(b.items || {});
    // (Up to v3.0 the tools a screenshot read were taken out again here. From
    // v3.1 every item is kept: a plan names tools, it never counts them.)
    if (merged.changed) { b.items = merged.items; store.set('bank.' + safe(), b); }
    return b;
  }
  const saveBank = b => { b.updated = Date.now(); store.set('bank.' + safe(), b); };
  // Moving items around isn't a change to what you have: 'updated' stays.
  const saveLayout = b => store.set('bank.' + safe(), b);
  function updateGoal(id, fn) {
    const list = goals();
    const g = list.find(x => x.id === id);
    if (!g) return;
    fn(g);
    saveGoals(list);
  }

  function setAccount(name) {
    const problem = checkName(name);
    if (problem) { showMsg('goals-msg', esc(problem), 'error'); return false; }
    S.account = toDisplayName(name);
    store.set('plan.account', S.account);
    S.profile = null;
    showMsg('goals-msg', '');
    loadProfile();
    return true;
  }

  // ── The account's XP ────────────────────────────────────────────────────
  async function loadProfile({ force = false } = {}) {
    if (!S.account || S.loading) return;
    const mine = p => p && p.safe === safe();
    const lookup = ctx.lookupProfile?.();
    if (!force && mine(lookup) && (!S.profile || lookup.fetchedAt > S.profile.fetchedAt)) S.profile = lookup;
    if (!force && mine(S.profile) && Date.now() - S.profile.fetchedAt < PROFILE_TTL) { rerender(); return; }
    S.loading = true; S.error = null; rerender();
    try {
      const p = await api.player(S.account, { force });
      if (!p) S.error = `No hiscores entry for <b>${esc(S.account)}</b>. Check the spelling; new players appear after logging out once.`;
      else if (p.safe === safe()) { S.profile = p; ctx.onProfile?.(p); }
    } catch (e) {
      S.error = errorText(e);
    } finally {
      S.loading = false;
      rerender();
    }
  }

  // Current XP in a skill. Below level 15 a skill isn't on the hiscores, so the
  // lowest level it can be is used (worked out from the total level).
  function currentOf(skillKey) {
    const p = S.profile;
    const skill = SKILL_BY_KEY.get(skillKey);
    if (!p || !skill) return null;
    const st = p.stats[skill.id];
    if (st) return { xp10: st.xp10 ?? st.xp * 10, level: st.level, rank: st.rank, ranked: true };
    const levels = {};
    for (const s of SKILLS) if (s.id && p.stats[s.id]) levels[s.key] = p.stats[s.id].level;
    const b = boundUnrankedLevels(levels, p.stats[0]?.level)[skillKey];
    const level = b ? b.min : 1;
    return { xp10: xp10ForLevel(level), level, rank: null, ranked: false, range: b };
  }

  // ── Combat level ────────────────────────────────────────────────────────
  // Combat level is a goal like a skill's: it's picked with the first of the
  // buttons a new goal's skill is picked with, before Attack, and given a level
  // to reach (86 → 90). Its card sits among the goals with its progress, and is
  // moved, changed and removed like any of them; nothing about the combat level
  // shows up by itself. Its Plan (Calculator) is the full calculator (the card
  // Lookup has under its Combat filter): it starts from your levels with your
  // goals in Attack, Strength, Defence, Hitpoints, Ranged, Prayer and Magic
  // reached, and a level you type into it is a what-if that changes no goal: it's
  // kept with the goal (goal.what) until you reset it. Above the calculator, the
  // plan says what each kind of level takes to get to the goal from your levels
  // now, whatever the what-if. (Each combat skill's own plan says what its goal
  // adds: combatTip.)
  //
  // While the goals are narrowed to one combat skill, a Combat level goal stays
  // listed with that skill's goals: that's where it's wanted.
  //
  // The account's combat level as the hiscores have it: a range while a combat
  // skill is below 15 (low has the lowest levels those can be).
  function combatReal() {
    const p = S.profile;
    if (!p) return null;
    const levels = {};
    for (const s of SKILLS) if (s.id && p.stats[s.id]) levels[s.key] = p.stats[s.id].level;
    return combatFromProfile(levels, p.stats[0]?.level);
  }
  // What the kills of a goal's plan give besides its own skill: { skill: XP in
  // tenths }. Every point of damage is Hitpoints XP too, and Controlled and
  // Longrange share theirs with other skills. (Bones aren't in it: burying
  // them is up to you.)
  function killsGive(goal) {
    if (!textFor(goal.skill).kills) return null;
    const { plan, ix } = planFor(goal);
    if (!plan) return null;
    const out = {};
    const add = (id, n) => {
      for (const [k, x] of Object.entries(ix.byId.get(id)?.gives || {})) if (x > 0 && n > 0) out[k] = (out[k] || 0) + x * n;
    };
    for (const st of plan.fromMix?.steps || []) add(st.id, st.runs);
    for (const sg of plan.fill?.segments || []) add(sg.id, sg.runs);
    return Object.keys(out).length ? out : null;
  }
  // The level a skill is at with some XP added to what it has now.
  const levelWith = (key, xp10) => levelForXp10(Math.min(MAX_XP10, (currentOf(key)?.xp10 || 0) + xp10));
  // real: the combat level now (combatReal). goal: the levels with every goal
  // in a combat skill reached, and with what those goals' kills give the other
  // skills on the way (a Ranged goal's kills are Hitpoints XP too, which can be
  // a Hitpoints level, and so a combat level). to: the level each of those
  // goals reaches in its own skill (once its target is known). also: what each
  // goal's kills give besides (killsGive). side: the skills those kills take to
  // a level no goal of their own reaches, with the level.
  // (Worked out once a redraw: see renderGoals.)
  let combatCache = null;
  function combatNow() {
    if (combatCache) return combatCache;
    const real = combatReal();
    if (!real) return null;
    const goal = { ...real.low };
    const to = new Map(), also = new Map(), given = {};
    for (const g of goals()) {
      if (!COMBAT_KEYS.includes(g.skill)) continue;
      // (a rank or top % goal: the XP of whoever holds that rank, once it's been looked up)
      const xp10 = g.type === 'level' || g.type === 'xp' ? goalTargetXp10(g) : g.target?.xp10;
      if (xp10 != null) {
        to.set(g.id, levelForXp10(xp10));
        goal[g.skill] = Math.max(goal[g.skill], to.get(g.id));
      }
      const gives = killsGive(g);
      if (!gives) continue;
      also.set(g.id, gives);
      for (const [k, x] of Object.entries(gives)) given[k] = (given[k] || 0) + x;
    }
    const side = {};
    for (const [k, x] of Object.entries(given)) {
      if (!COMBAT_KEYS.includes(k)) continue;
      const level = levelWith(k, x);
      if (level > goal[k]) goal[k] = side[k] = level;
    }
    return (combatCache = { real, goal, to, also, side });
  }
  // The levels in a Combat level goal's calculator: your goals', with what you've typed into it.
  function combatLevels(goal) {
    const c = combatNow();
    return c ? { ...c.goal, ...(goal?.what || {}) } : null;
  }
  // (the skills a goal takes to a new level, with the level: "Attack 60, Strength 70")
  // (one the kills take there, with no goal of its own that does: "Hitpoints 87 from their kills")
  const combatPlanned = c => COMBAT_KEYS.filter(k => c.goal[k] !== c.real.low[k]).map(k => `${SKILL_BY_KEY.get(k).name} ${c.goal[k]}${c.side[k] ? ' from their kills' : ''}`);
  // The combat level as a number that moves with every level (86.25), for a goal's progress.
  const combatExact = levels => combatBreakdown(levels).exact;
  // The line above the open calculator: the level its boxes come to.
  function combatHead(c, L) {
    const { real, goal } = c;
    const name = esc(S.profile.name);
    const now = combatCard.text(real), level = combatLevel(L);
    const from = n => `${n - real.min >= 0 ? '+' : ''}${n - real.min} from ${name}'s ${now}`;
    if (COMBAT_KEYS.some(k => L[k] !== goal[k])) return `What-if combat level <span class="big">${level}</span> <span class="cc-style">${from(level)}</span>`;
    if (COMBAT_KEYS.some(k => goal[k] !== real.low[k])) return `Combat level once your goals are reached <span class="big">${level}</span> <span class="cc-style">${from(level)}</span>`;
    return `Combat level <span class="big">${now}</span>`;
  }
  // A Combat level goal's card: a goal's, with the calculator as its plan.
  function combatGoalCard(goal, first = true, last = true) {
    const c = combatNow();
    const open = S.open.has(goal.id);
    const editing = S.editing?.id === goal.id;
    let sub = '', bar = '', title = `Level ? → <b>${goal.value}</b>`, plan = '';
    if (!c) sub = S.loading ? '<span class="pending">Loading your XP…</span>' : 'Your XP is not loaded.';
    else {
      const { real } = c;
      const now = combatCard.text(real), after = combatLevel(c.goal);
      const planned = combatPlanned(c);
      const reached = real.min >= goal.value;
      const toGo = goal.value - real.min;
      title = `Level ${now} → <b>${goal.value}</b>`;
      // (what your goals in the combat skills come to, against this one)
      const list = `<span class="c-faint">(${esc(planned.join(', '))})</span>`;
      const fromGoals = !planned.length ? 'none of your skill goals takes a combat skill to a new level yet'
        : after >= goal.value ? `your skill goals reach <b>${after}</b> ${list}: that's this goal${after > goal.value ? ' and more' : ''}`
        : after > real.min ? `your skill goals reach <b>${after}</b> ${list}: <b>${goal.value - after}</b> more to find`
        : `your skill goals don't add a whole level yet ${list}`;
      sub = reached ? `<span class="c-win">Reached</span> · level ${now}`
        : `Level ${now} now · <b>${toGo}</b> level${toGo === 1 ? '' : 's'} to go · ${fromGoals}`;
      if (real.min !== real.max) sub += ` <span class="c-faint">(some combat skills are below ${MIN_RANKED_LEVEL}, so their lowest possible levels are used)</span>`;
      const exact = combatExact(real.low);
      const start = goal.startCb ?? exact;
      const p = reached ? 100 : pct(exact - start, goal.value - start);
      bar = `<div class="pbar goal-bar${reached ? ' maxed' : ''}" title="${p.toFixed(1)}% of the way since you set this goal"><div style="width:${p.toFixed(1)}%"></div></div>`;
      if (open) {
        const L = combatLevels(goal);
        const typed = Object.keys(goal.what || {}).length > 0;
        plan = `<div class="plan combat-plan">
          <div class="gc-needs">${combatNeedsHtml(c, goal)}</div>
          <div class="gc-live">${combatLiveHtml(c, L, goal.value)}</div>
          <div class="calc">
            <div class="c-faint small-note">Combat calculator: it starts from ${esc(S.profile.name)}'s levels${planned.length ? `, with your goals reached${Object.keys(c.side).length ? ' and what their kills give besides' : ''}` : ''}. Type a level to try it: that changes none of your goals, and it stays (with this goal) until you reset it.</div>
            ${combatCard.grid(L, 'gcalc', true)}
            <div class="bar"><button type="button" class="btn small" data-act="combat-reset"${typed ? '' : ' disabled'}>${planned.length ? 'Reset to your goals' : `Reset to ${esc(S.profile.name)}`}</button></div>
          </div>
        </div>`;
      }
    }
    return `<div class="card goal combat-goal" data-goal="${goal.id}">
      <div class="goal-head">${iconImg(combatCard.icon)} <span class="goal-name">Combat level</span>
        <span class="goal-title">${title}</span>
        <button type="button" class="linkish small-note" data-act="edit-goal" aria-expanded="${editing}" title="Change this goal's target: move the goalpost">Edit</button>
        <span class="grow"></span>
        <button type="button" class="btn small" data-act="toggle-plan" aria-expanded="${open}">${open ? `Hide ${PLAN_LABEL}` : PLAN_LABEL}</button>
        ${moveButtons('Combat level', first, last)}
        <button type="button" class="x" data-act="remove-goal" title="Remove this goal" aria-label="Remove goal">✕</button>
      </div>
      ${editing ? goalEditHtml(goal, null, null) : ''}
      <div class="goal-sub">${sub}</div>
      ${bar}
      ${plan}
    </div>`;
  }
  // (the part that follows the levels: redrawn alone as you type one. target: the goal's level)
  function combatLiveHtml(c, L, target) {
    const unknown = c.real.min !== c.real.max
      ? `<div class="cc-line">Some combat skills are below 15, so they're not on the hiscores. Their lowest possible levels are used below, and you can change them in the calculator.</div>` : '';
    return combatCard.live(L, combatHead(c, L), unknown, target);
  }
  function renderCombatLive(card) {
    const el = card?.querySelector('.gc-live');
    const c = el && combatNow();
    const goal = c && goals().find(g => g.id === card.dataset.goal);
    if (!goal) return;
    const L = combatLevels(goal);
    el.innerHTML = combatLiveHtml(c, L, goal.value);
    const reset = card.querySelector('[data-act="combat-reset"]');
    if (reset) reset.disabled = !Object.keys(goal.what || {}).length;
  }
  // What a Combat level goal takes, at the top of its plan: from your levels now,
  // strictly this goal (not after your other goals), kind by kind (app.js
  // combatNeedsHtml, which Lookup's combat card has at its top too). A what-if
  // typed into the calculator under it changes none of it.
  function combatNeedsHtml(c, goal) {
    const from = c.real.low;
    const level = combatLevel(from);
    if (level >= goal.value) return `<div class="cc-goal"><div class="cc-goal-head">Your levels now already reach <b>${goal.value}</b>${level > goal.value ? ` (${level})` : ''}.</div></div>`;
    return combatCard.needs(from, goal.value, 'your levels now', c.real.min !== c.real.max);
  }
  // What one goal in a combat skill adds to your combat level on its own, as a
  // one-line tip in that goal's plan: "this goal adds +0.75 (87 → 88)". The combat
  // level counts quarters and thirds of a level, so it's a part of one (to two
  // places), with the whole levels when it crosses one. What its
  // plan's kills give the other skills counts too (a Ranged goal's kills are
  // Hitpoints XP), and the tooltip says so, and why a goal adds nothing. A Combat
  // level goal combines them all.
  function combatTip(goal) {
    if (!COMBAT_KEYS.includes(goal.skill)) return '';
    const c = combatNow();
    const to = c?.to.get(goal.id);
    if (to == null) return '';
    const now = c.real.low;
    // own: with the goal's own level alone. alone: and the levels its kills give
    // the other skills (Hitpoints, and more on Controlled or Longrange)
    const own = { ...now, [goal.skill]: Math.max(now[goal.skill], to) }, alone = { ...own };
    const kills = [];
    for (const [k, x] of Object.entries(c.also.get(goal.id) || {})) {
      if (!COMBAT_KEYS.includes(k)) continue;
      const level = levelWith(k, x);
      if (level > alone[k]) { kills.push(`${SKILL_BY_KEY.get(k).name} ${alone[k]} → ${level}`); alone[k] = level; }
    }
    const a = combatBreakdown(now), o = combatBreakdown(own), b = combatBreakdown(alone);
    const add = b.exact - a.exact, addOwn = o.exact - a.exact;
    // (to two places: 0.25, 1.25, 3.68)
    const about = n => (Math.round((n + 1e-9) * 100) / 100).toLocaleString('en-US');
    const atLeast = c.real.min !== c.real.max ? 'at least ' : '';
    const list = parts => (parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]);
    // (the only ways a new level adds nothing: another style counts for more, or Prayer's odd level)
    const STYLE = { melee: 'melee (Attack and Strength)', ranged: 'Ranged', magic: 'Magic' };
    const why = goal.skill === 'prayer' ? 'Prayer counts every second level' : `only the best of melee, Ranged and Magic counts, and your ${STYLE[o.style]} is ahead`;
    const raised = own[goal.skill] > now[goal.skill];
    // Said simply: how much this goal adds to your combat level, from your levels now
    // (what its kills give the other skills included); the how and why are in its tooltip.
    const text = add > 1e-9 ? `this goal adds <b>+${about(add)}</b>${b.level > a.level ? ` <span class="c-faint">(${atLeast}${a.level} → ${b.level})</span>` : ''}.`
      : 'this goal adds nothing.';
    const how = [`Counted from your levels now: ${SKILL_BY_KEY.get(goal.skill).name} ${now[goal.skill]} → ${own[goal.skill]}${kills.length ? `, and what its kills give besides: ${list(kills)}` : ''}.`];
    if (add <= 1e-9) how.push(raised ? `It adds nothing because ${why}.` : `It doesn't take your ${SKILL_BY_KEY.get(goal.skill).name} to a new level.`);
    else if (addOwn <= 1e-9 && raised) how.push(`All of it comes from what its kills give: ${SKILL_BY_KEY.get(goal.skill).name} itself adds nothing, since ${why}.`);
    const title = [...how,
      'Your combat level is a quarter of Defence + Hitpoints + half your Prayer, plus 0.325 of the best of Attack + Strength, one and a half times Ranged, or one and a half times Magic, rounded down, so one goal adds a part of a level. Bones aren\'t counted.',
      'A Combat level goal (the second of the buttons a goal is picked with, after the total level) combines all your goals, and its calculator lets you try other levels.'].join(' ');
    return `<div class="tip combat" title="${esc(title)}">${iconImg(combatCard.icon)}<span>Combat level: ${text}</span></div>`;
  }

  // ── Total level (v3.1) ──────────────────────────────────────────────────
  // A goal like the combat level's: a total level to reach (1,234 → 1,300),
  // picked with the very first of the buttons. Its plan says what your skill
  // goals add to it, then the least XP that gets the rest: a level at a time,
  // always the one that takes the least (low levels are cheap: twenty Agility
  // levels from 1 cost less than one Herblore level in the 80s). Untick a skill
  // you won't train, and the rest is found without it (goal.skip).
  //
  // The account's total level as the hiscores have it (null: not loaded).
  function totalReal() {
    const p = S.profile;
    if (!p) return null;
    if (p.stats[0]?.level) return p.stats[0].level;
    return TOTAL_SKILLS.reduce((a, s) => a + (currentOf(s.key)?.level || 1), 0);
  }
  // Each skill: { key, skill, level and xp10 (now), goal (the level your goals
  // take it to) and goalXp10 (the XP they reach), unranked }. Your goals: a
  // level or XP goal's target, a rank or top % goal's once it's been looked up,
  // and the levels the kills of your combat goals give on the way (combatNow's).
  function totalSkills() {
    const c = combatNow();
    const list = goals();
    return TOTAL_SKILLS.map(s => {
      const cur = currentOf(s.key);
      const level = cur?.level || 1, xp10 = cur?.xp10 || 0;
      let goalXp10 = xp10, pending = null;
      const mine = list.filter(g => g.skill === s.key);
      for (const g of mine) {
        // (v3.2: a rank or top % goal counts at the XP of whoever holds that rank now, looked up if it hasn't been)
        let t = null;
        if (g.type === 'level' || g.type === 'xp') t = goalTargetXp10(g);
        else if (cur) {
          const tg = targetOf(g, cur);
          if (tg.pending) pending = g; else if (!tg.reached) t = tg.xp10;
        }
        if (t != null) goalXp10 = Math.max(goalXp10, t);
      }
      const side = c?.side?.[s.key];
      const fromKills = !!(side && side > levelForXp10(goalXp10));
      if (fromKills) goalXp10 = xp10ForLevel(side);
      return { key: s.key, skill: s, level, xp10, goal: Math.max(level, levelForXp10(goalXp10)), goalXp10, unranked: !!cur && !cur.ranked, goals: mine, pending, fromKills };
    });
  }
  // A goal's kind in a few words: "level 80", "5M XP", "rank 500", "top 10%"
  const goalKind = g => (g.type === 'xp' ? `${gpShort(g.value)} XP` : g.type === 'rank' ? `rank ${fmt(g.value)}` : g.type === 'top' ? `top ${formatPercent(g.value)}%` : `level ${fmt(g.value)}`);

  // ── Total level: XP, Rank and Top % too (v3.2) ──────────────────────────
  // The account's Overall row: { level, xp10, rank }, or null before your XP is loaded.
  function overallNow() {
    const p = S.profile;
    if (!p) return null;
    const o = p.stats[0];
    const xp10 = o ? (o.xp10 ?? o.xp * 10) : TOTAL_SKILLS.reduce((a, s) => a + (currentOf(s.key)?.xp10 || 0), 0);
    return { level: totalReal(), xp10, rank: o?.rank || null };
  }
  // What a Total level goal is after. A rank or top % goal: whoever holds that rank
  // in Overall now, their total level and XP (Overall ranks by total level, then XP):
  // { rank, level, xp10, who, at } | { rank, reached } | { pending, note }.
  function totalTargetOf(goal) {
    if (goal.type === 'xp') return { xp10: goal.value * 10 };
    if (goal.type !== 'rank' && goal.type !== 'top') return { level: goal.value };
    let rank;
    if (goal.type === 'rank') rank = Math.max(1, Math.floor(goal.value));
    else {
      const t = totals.get(0);
      if (!t) return { pending: true, note: 'Counting players…' };
      rank = rankForTop(goal.value, t.total);
    }
    const o = overallNow();
    if (o?.rank && o.rank <= rank) return { rank, reached: true };
    const c = goal.target;
    const fresh = c && c.rank === rank && c.level != null && Date.now() - c.at < TARGET_TTL;
    if (!fresh && !S.goalErr[goal.id]) fetchOverallTarget(goal, rank);
    if (c && c.rank === rank && c.level != null) return { rank, level: c.level, xp10: c.xp10, who: c.who, at: c.at };
    return { pending: true, rank, note: S.goalErr[goal.id] || `Looking up who holds rank ${fmt(rank)}…` };
  }
  async function fetchOverallTarget(goal, rank) {
    const key = goal.id + ':' + rank;
    if (S.rankLoading.has(key)) return;
    S.rankLoading.add(key);
    delete S.goalErr[goal.id];
    try {
      const rows = await api.category(0, rank, { priority: 'fg' });
      const row = rows.find(r => r.rank === rank);
      // (nobody at that rank yet: every account is ranked in Overall, so any is past it)
      updateGoal(goal.id, g => { g.target = { rank, level: row ? row.level : 0, xp10: row ? row.xp10 : 0, at: Date.now(), who: row?.name || null }; });
    } catch (e) {
      S.goalErr[goal.id] = errorText(e);
    } finally {
      S.rankLoading.delete(key);
      rerender();
    }
  }
  // The total level a goal's plan works toward: its level; for a rank or top %, a level
  // more than the holder's (that passes them, whatever their XP); null for an XP goal,
  // one that's reached, or while the holder is looked up.
  function totalLevelGoal(goal) {
    if (goal.type === 'xp') return null;
    if (goal.type !== 'rank' && goal.type !== 'top') return goal.value;
    const t = totalTargetOf(goal);
    return t.level != null ? Math.min(MAX_TOTAL, t.level + 1) : null;
  }
  function totalReached(goal) {
    const o = overallNow();
    if (!o || o.level == null) return false;
    if (goal.type === 'xp') return o.xp10 >= goal.value * 10;
    if (goal.type === 'rank' || goal.type === 'top') return !!totalTargetOf(goal).reached;
    return o.level >= goal.value;
  }
  // { now, rows (totalSkills), add (the levels your goals add), after, need
  // (what's left to find), cheap (cheapestLevels: the skills ticked, from where
  // your goals take them), skip } or null before your XP is loaded.
  function totalPlan(goal) {
    const now = totalReal();
    if (now == null) return null;
    const rows = totalSkills();
    const add = rows.reduce((a, r) => a + (r.goal - r.level), 0);
    const after = now + add;
    // (v3.2: the level it works toward; an XP goal counts XP instead)
    const target = totalLevelGoal(goal);
    const need = target == null ? 0 : Math.max(0, target - after);
    const skip = new Set(goal.skip || []);
    const from = Object.fromEntries(rows.filter(r => !skip.has(r.key)).map(r => [r.key, r.goalXp10]));
    const cheap = need ? cheapestLevels(from, need) : { bySkill: [], xp10: 0, levels: 0 };
    const o = overallNow();
    const addXp10 = rows.reduce((a, r) => a + (r.goalXp10 - r.xp10), 0);
    return { now, rows, add, after, need, cheap, skip, target, xpNow: o?.xp10 ?? 0, addXp10, rank: o?.rank ?? null, aim: totalTargetOf(goal) };
  }
  function totalGoalCard(goal, first = true, last = true) {
    const open = S.open.has(goal.id);
    const editing = S.editing?.id === goal.id;
    const t = totalPlan(goal);
    let sub = '', bar = '', title = `Level ? → <b>${fmt(goal.value)}</b>`, plan = '';
    if (goal.type === 'xp') title = `? → <b>${fmt(goal.value)}</b> XP`;
    else if (goal.type === 'rank') title = `Rank ? → <b>${fmt(goal.value)}</b>`;
    else if (goal.type === 'top') title = `Top ? → <b>${formatPercent(goal.value)}%</b>`;
    if (!t) sub = S.loading ? '<span class="pending">Loading your XP…</span>' : 'Your XP is not loaded.';
    else {
      const reached = totalReached(goal);
      const aim = t.aim;
      const ov = totals.get(0);
      const topNow = t.rank && ov ? topPercent(t.rank, ov.total) : null;
      if (goal.type === 'xp') title = `${xpText(t.xpNow)} → <b>${fmt(goal.value)}</b> XP`;
      else if (goal.type === 'rank') title = `Rank ${t.rank ? fmt(t.rank) : 'none'} → <b>${fmt(goal.value)}</b>`;
      else if (goal.type === 'top') title = `Top ${topNow != null ? `${formatPercent(topNow)}%` : '?'} → <b>${formatPercent(goal.value)}%</b>${aim.rank ? ` <span class="c-faint">(rank ${fmt(aim.rank)})</span>` : ''}`;
      else title = `Level ${fmt(t.now)} → <b>${fmt(goal.value)}</b>`;
      const fromGoals = target => !t.add ? 'none of your skill goals adds a level yet'
        : t.after >= target ? `your skill goals add <b>${fmt(t.add)}</b>: that's this goal${t.after > target ? ' and more' : ''}`
        : `your skill goals add <b>${fmt(t.add)}</b>: <b>${fmt(t.need)}</b> more to find`;
      let p = 0;
      if (goal.type === 'xp') {
        const left = Math.max(0, goal.value * 10 - t.xpNow);
        sub = reached ? `<span class="c-win">Reached</span> · ${xpText(t.xpNow)} XP`
          : `${xpText(t.xpNow)} XP now · <b>${xpText(left)}</b> XP to go · ${t.addXp10 ? `your skill goals add <b>${xpText(t.addXp10)}</b>${t.addXp10 >= left ? ': that\'s this goal' : ''}` : 'none of your skill goals adds XP yet'}`;
        const start = goal.startXp10 ?? t.xpNow;
        p = reached ? 100 : pct(t.xpNow - start, goal.value * 10 - start);
      } else if (goal.type === 'rank' || goal.type === 'top') {
        if (reached) sub = `<span class="c-win">Reached</span> · rank ${fmt(t.rank)}`;
        else if (aim.pending) sub = `<span class="pending">${esc(aim.note)}</span>`;
        else {
          const toGo = Math.max(0, t.target - t.now);
          sub = `To pass ${aim.who ? esc(aim.who) : 'them'} (rank ${fmt(aim.rank)}: total level ${fmt(aim.level)}, ${xpText(aim.xp10)} XP): total level <b>${fmt(t.target)}</b> · <b>${fmt(toGo)}</b> level${toGo === 1 ? '' : 's'} to go · ${fromGoals(t.target)}`;
          const start = goal.startTotal ?? t.now;
          p = pct(t.now - start, t.target - start);
        }
        if (reached) p = 100;
      } else {
        const toGo = goal.value - t.now;
        sub = reached ? `<span class="c-win">Reached</span> · total level ${fmt(t.now)}`
          : `Total level ${fmt(t.now)} now · <b>${fmt(toGo)}</b> level${toGo === 1 ? '' : 's'} to go · ${fromGoals(goal.value)}`;
        const start = goal.startTotal ?? t.now;
        p = reached ? 100 : pct(t.now - start, goal.value - start);
      }
      const barOn = reached || goal.type === 'xp' || goal.type === 'level' || !goal.type || !aim.pending;
      bar = barOn ? `<div class="pbar goal-bar${reached ? ' maxed' : ''}" title="${p.toFixed(1)}% of the way since you set this goal"><div style="width:${p.toFixed(1)}%"></div></div>` : '';
      if (open) plan = totalPlanHtml(goal, t);
    }
    return `<div class="card goal total-goal" data-goal="${goal.id}">
      <div class="goal-head">${iconImg(TOTAL)} <span class="goal-name">Total level</span>
        <span class="goal-title">${title}</span>
        <button type="button" class="linkish small-note" data-act="edit-goal" aria-expanded="${editing}" title="Change this goal's target: move the goalpost">Edit</button>
        <span class="grow"></span>
        <button type="button" class="btn small" data-act="toggle-plan" aria-expanded="${open}">${open ? `Hide ${PLAN_LABEL}` : PLAN_LABEL}</button>
        ${moveButtons('Total level', first, last)}
        <button type="button" class="x" data-act="remove-goal" title="Remove this goal" aria-label="Remove goal">✕</button>
      </div>
      ${editing ? goalEditHtml(goal, null, null) : ''}
      <div class="goal-sub">${sub}</div>
      ${bar}
      ${plan}
    </div>`;
  }
  // The plan: what your skill goals add, the least XP for the rest, and every
  // skill (a tick box each: untick one you won't train). (v3.2) A rank or top %
  // goal works toward a level more than whoever holds that rank; an XP goal
  // counts what your skill goals add in XP, and any skill's XP after that.
  function totalPlanHtml(goal, t) {
    const list = goals();
    // (a skill's goals as they count here: "top 10%", "rank 500")
    const kinds = r => r.goals.filter(g => g.type === 'rank' || g.type === 'top').map(goalKind);
    if (goal.type === 'xp') {
      const mineXp = t.rows.filter(r => r.goalXp10 > r.xp10);
      const left = Math.max(0, goal.value * 10 - t.xpNow - t.addXp10);
      const lines = mineXp.map(r => `<div class="step">${iconImg(r.skill)}<div class="step-main"><div>${esc(r.skill.name)} <b class="c-xp">+${xpText(r.goalXp10 - r.xp10)}</b> XP <span class="c-faint">(level ${r.level} → ${r.goal}${kinds(r).length ? `, ${esc(kinds(r).join(', '))}` : ''}${r.fromKills ? ', with the kills of your combat goals' : ''})</span></div></div></div>`).join('');
      return `<div class="plan total-plan">
        <div class="plan-sec"><h4>Your skill goals add <span class="c-xp">+${xpText(t.addXp10)} XP</span> <span class="c-faint">→ ${xpText(t.xpNow + t.addXp10)} in all</span>${left ? '' : ' <span class="c-win">That reaches your goal.</span>'}</h4>
          ${lines ? `<div class="steps">${lines}</div>` : '<div class="c-faint small-note">None of your skill goals adds XP yet. Set one with the skill buttons above.</div>'}
          ${pendingNote(t)}</div>
        ${left ? `<div class="plan-sec"><h4>Then, <span class="c-xp">${xpText(left)} XP</span> more</h4><div class="c-faint small-note">From any skill: every skill's XP counts toward your total.</div></div>` : ''}
      </div>`;
    }
    const target = t.target;
    const passing = (goal.type === 'rank' || goal.type === 'top') && t.aim.level != null
      ? `<div class="tip total-aim"><span>Rank ${fmt(t.aim.rank)} is ${t.aim.who ? esc(t.aim.who) : 'whoever holds it'}: total level ${fmt(t.aim.level)}, ${xpText(t.aim.xp10)} XP. Overall ranks by total level, then XP: total level <b>${fmt(target)}</b> passes them, and so does ${fmt(t.aim.level)} with more XP than theirs.</span></div>` : '';
    if ((goal.type === 'rank' || goal.type === 'top') && target == null) {
      return `<div class="plan total-plan"><div class="plan-sec">${t.aim.reached ? `<span class="c-win">You're past rank ${fmt(t.aim.rank)}.</span>` : `<span class="pending">${esc(t.aim.note || '')}</span>`}</div></div>`;
    }
    const mine = t.rows.filter(r => r.goal > r.level);
    const goalLines = mine.map(r => `<div class="step">${iconImg(r.skill)}<div class="step-main"><div>${esc(r.skill.name)} ${r.level} → <b>${r.goal}</b> <span class="c-level">+${r.goal - r.level}</span>${kinds(r).length ? ` <span class="c-faint small-note">${esc(kinds(r).join(', '))}</span>` : ''}${r.fromKills || !list.some(g => g.skill === r.key) ? ' <span class="c-faint small-note">from the kills of your combat goals</span>' : ''}</div></div></div>`).join('');
    const goalsSec = `<div class="plan-sec"><h4>Your skill goals add <span class="c-level">+${fmt(t.add)} level${t.add === 1 ? '' : 's'}</span> <span class="c-faint">→ total ${fmt(t.after)}</span>${t.after >= target ? ' <span class="c-win">That reaches your goal.</span>' : ''}</h4>
      ${mine.length ? `<div class="steps">${goalLines}</div>` : '<div class="c-faint small-note">None of your skill goals takes a skill to a new level yet. Set one with the skill buttons above, or from a line below.</div>'}
      ${pendingNote(t)}</div>`;
    let restSec = '';
    if (t.need > 0) {
      // (a line's button: a level goal for it, or your goal in that skill made that level: a rank,
      // top % or XP goal too, v3.2)
      const setBtn = x => {
        const own = list.filter(g => g.skill === x.skill);
        const one = own.length === 1 ? own[0] : null;
        const name = SKILL_BY_KEY.get(x.skill).name;
        const tip = !one ? `Add a goal: ${name} level ${x.to}` : one.type === 'level' ? `Make your ${name} goal level ${x.to}` : `Your ${name} goal is ${goalKind(one)}: this makes it level ${x.to}`;
        return `<button type="button" class="linkish small-note" data-act="total-set" data-skill="${x.skill}" data-level="${x.to}" title="${esc(tip)}">${one ? `make your goal ${x.to}` : 'set a goal'}</button>`;
      };
      const lines = t.cheap.bySkill.map(x => {
        const sk = SKILL_BY_KEY.get(x.skill);
        return `<div class="step">${iconImg(sk)}<div class="step-main"><div>${esc(sk.name)} ${x.from} → <b>${x.to}</b> <span class="c-level">+${x.to - x.from}</span> <span class="c-faint">·</span> <span class="c-xp">${xpText(x.xp10)} XP</span> ${setBtn(x)}</div></div></div>`;
      }).join('');
      const short = t.need - t.cheap.levels;
      restSec = `<div class="plan-sec"><h4>Then, the least XP for the other ${fmt(t.need)}: <span class="c-xp">${xpText(t.cheap.xp10)} XP</span></h4>
        <div class="c-faint small-note">A level at a time, always the one that takes the least XP: a skill's levels only get dearer, so that's the least there is. Untick a skill below that you won't train.</div>
        ${lines ? `<div class="steps">${lines}</div>` : ''}
        ${short > 0 ? `<div class="c-lose small-note">That's every level the skills you've ticked have left: ${fmt(short)} short. Tick more skills below.</div>` : ''}</div>`;
    }
    const by = new Map(t.cheap.bySkill.map(x => [x.skill, x]));
    const skipped = t.rows.filter(r => t.skip.has(r.key)).length;
    const shownRows = S.hideOff ? t.rows.filter(r => !t.skip.has(r.key)) : t.rows;
    const rows = shownRows.map(r => {
      const x = by.get(r.key), off = t.skip.has(r.key);
      const now = r.unranked ? `<span title="Below level ${MIN_RANKED_LEVEL}, so not on the hiscores: its lowest possible level">${r.level}*</span>` : r.level;
      return `<tr${off ? ' class="off"' : ''}>
        <td class="c"><input type="checkbox" data-total-skip="${r.key}"${off ? '' : ' checked'} title="Train it: untick a skill you won't train, and the least XP is found without it" aria-label="Train ${esc(r.skill.name)}"></td>
        <td class="l"><span class="sk-cell">${iconImg(r.skill)} ${esc(r.skill.name)}</span></td>
        <td>${now}</td>
        <td>${r.goal > r.level ? `<span class="c-level">${r.goal}</span>` : '<span class="c-faint">–</span>'}</td>
        <td>${x ? `<b>${x.to}</b> <span class="c-level">+${x.to - x.from}</span>` : '<span class="c-faint">–</span>'}</td>
        <td>${x ? `<span class="c-xp">${xpText(x.xp10)}</span>` : '<span class="c-faint">–</span>'}</td>
      </tr>`;
    }).join('') || '<tr><td class="l c-faint" colspan="6">Every skill is unticked under Train, and hidden. Untick Hide unticked skills to see them.</td></tr>';
    const table = `<div class="plan-sec"><h4>Every skill</h4>
      <div class="bar wrap">${hideOffBox('Train', 'skills', S.hideOff ? skipped : 0)}</div>
      <div class="table-wrap fit"><table class="grid total-t">
        <thead><tr><th title="Train it: untick a skill you won't train">Train</th><th class="l">Skill</th><th>Now</th><th class="wrap" title="The level your goals in it take it to">With your<br>goals</th><th class="wrap" title="Where the least XP for the rest takes it">Least XP<br>takes it to</th><th class="wrap" title="The XP those levels take">XP for<br>those</th></tr></thead>
        <tbody>${rows}</tbody></table></div></div>`;
    return `<div class="plan total-plan">${passing}${goalsSec}${restSec}${table}</div>`;
  }
  const listText = list => (list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0] || '');
  // (rank and top % skill goals whose rank holder is being looked up: counted once they're in)
  function pendingNote(t) {
    const waiting = t.rows.filter(r => r.pending);
    return waiting.length ? `<div class="c-faint small-note pending">Looking up whoever holds the rank of your ${esc(listText(waiting.map(r => `${r.skill.name} goal (${goalKind(r.pending)})`)))}: it counts once that's in.</div>` : '';
  }

  // ── Goal targets ────────────────────────────────────────────────────────
  // { xp10, rank?, who?, at?, reached?, pending?, note? }
  function targetOf(goal, cur) {
    if (goal.type === 'level' || goal.type === 'xp') return { xp10: goalTargetXp10(goal) };
    const skill = SKILL_BY_KEY.get(goal.skill);
    let rank;
    if (goal.type === 'rank') rank = Math.max(1, Math.floor(goal.value));
    else {
      const t = totals.get(skill.id);
      if (!t) return { pending: true, note: 'Counting players…' };
      rank = rankForTop(goal.value, t.total);
    }
    if (cur?.rank && cur.rank <= rank) return { xp10: cur.xp10, rank, reached: true };
    const c = goal.target;
    const fresh = c && c.rank === rank && Date.now() - c.at < TARGET_TTL;
    if (!fresh && !S.goalErr[goal.id]) fetchRankTarget(goal, skill, rank);    // after an error, wait for Refresh
    if (c && c.rank === rank) return { xp10: c.xp10, rank, who: c.who, at: c.at };
    return { pending: true, rank, note: `Looking up who holds rank ${fmt(rank)}…` };
  }

  async function fetchRankTarget(goal, skill, rank) {
    const key = goal.id + ':' + rank;
    if (S.rankLoading.has(key)) return;
    S.rankLoading.add(key);
    delete S.goalErr[goal.id];
    try {
      const rows = await api.category(skill.id, rank, { priority: 'fg' });
      const row = rows.find(r => r.rank === rank);
      // Nobody at that rank yet: being ranked at all (level 15) is enough.
      const xp10 = row ? row.xp10 + 1 : xp10ForLevel(MIN_RANKED_LEVEL);
      updateGoal(goal.id, g => { g.target = { rank, xp10, at: Date.now(), who: row?.name || null }; });
    } catch (e) {
      S.goalErr[goal.id] = errorText(e);
    } finally {
      S.rankLoading.delete(key);
      rerender();
    }
  }

  // With no monster picked, a plan trains on the one that gives the most XP a
  // kill among those no more than half your combat level: what you can fight
  // without much trouble. Never one that's set aside (a quest's foe, a boss,
  // anything with a catch).
  // (v3.1: nor one you've unticked under Fight)
  function usualMonster(ix, excluded = new Set()) {
    const cb = combatReal()?.min;
    if (cb == null) return null;
    let best = null;
    for (const m of ix.train) if (!m.aside && !excluded.has(m.id) && m.cb <= cb / 2 && (!best || m.xp > best.xp)) best = m;
    return best || ix.train.find(m => !m.aside && !excluded.has(m.id)) || null;
  }

  // A goal's plan. It's worked out once a redraw: the goal's own card shows it,
  // and the combat level counts what its kills give (see renderGoals).
  let planCache = new Map();
  function planFor(goal) {
    if (!planCache.has(goal.id)) planCache.set(goal.id, planOf(goal));
    return planCache.get(goal.id);
  }
  function planOf(goal) {
    const cur = currentOf(goal.skill);
    const target = cur ? targetOf(goal, cur) : null;
    // (what's made on the way: only what the account's Crafting level allows)
    const craft = GATE[goal.skill] ? currentOf('crafting')?.level ?? 1 : null;
    const base = INDEX[goal.skill] && indexFor(goal, null, craft);
    if (!cur || !target || target.pending || !base) return { cur, target, ix: base };
    const targetXp10 = target.reached ? cur.xp10 : target.xp10;
    // Tickets handed in later (the Agility Arena's): this plan's are handed in
    // together, and each counts at their average. pool says what that came to.
    const av = base.exchanges ? averaged(base, { currentXp10: cur.xp10, targetXp10, mix: goal.mix || null, fillId: goal.fillId }) : null;
    const ix = av ? indexFor(goal, av.set, craft) : base;
    const excluded = new Set(goal.excluded || []);
    const plan = planGoal(ix, {
      bank: bank().items,
      currentXp10: cur.xp10,
      targetXp10,
      excluded,
      unlimited: new Set(goal.assume ?? DEFAULT_ASSUME[goal.skill] ?? []),
      useBank: goal.useBank !== false && usesBank(goal.skill),
      // (a monster: yours, or with none picked (or one that's no longer in the data, or unticked) the usual one for your combat level)
      fillId: textFor(goal.skill).kills && (!ix.byId.has(goal.fillId) || excluded.has(goal.fillId)) ? usualMonster(ix, excluded)?.id : goal.fillId,
      fillGroup: DEFAULT_FILL_GROUP[goal.skill] || null,
      priceOf: prices.priceOf,
      mix: goal.mix || null,
      roundUp: !!goal.roundUp && goal.useBank !== false && usesBank(goal.skill) && hasEven(ix),
      minor: minorOf(goal.skill),
      order: Array.isArray(goal.order) && goal.order.length ? goal.order : null,
      least: av?.least || null,
    });
    return { cur, target, ix, plan, pool: av?.pool || null };
  }

  // Items a skill's plan can price (inputs down to buyable, and outputs).
  function skillItems(key) {
    if (key === 'all') return [...new Set(PRICE_TABS.flatMap(skillItems))];
    const out = new Set();
    for (const g of BANK_GROUPS[key] || []) for (const i of g.items) out.add(i);
    for (const m of METHODS) if (m.skill === key) for (const i of [...Object.keys(m.in), ...Object.keys(m.out)]) out.add(i);
    return [...out];
  }
  // What the Prices tab lists for a skill: its bank groups and what the market
  // sells as one item (a set of dragonhide armour), or for a skill with no bank
  // (Woodcutting) what it makes. All: every item a skill's tab lists, once each,
  // A to Z (skills share so many that their own lists would repeat each other).
  // (v3) All: every item once, in a table for the skill it first belongs to,
  // A to Z: the skills with a bank in the order the data has them (Herblore's
  // vials stay Herblore's), then the others; Slayer's table is what only
  // monsters drop. (Up to v2.10 All was one table of every item, A to Z.)
  let everyPriced = null;
  function priceGroups(key) {
    if (key === 'all') {
      if (!everyPriced) {
        const first = [...Object.keys(BANK_GROUPS).filter(k => k !== SLAYER.key && PRICE_TABS.includes(k)), ...PRICE_TABS.filter(k => !BANK_GROUPS[k]), ...(PRICE_TABS.includes(SLAYER.key) ? [SLAYER.key] : [])];
        const home = new Map();
        for (const k of first) for (const g of priceGroups(k)) for (const slug of priceItems(g.items)) if (!home.has(slug)) home.set(slug, k);
        const name = slug => ITEMS[slug].name;
        const az = list => list.sort((a, b) => name(a).localeCompare(name(b), 'en', { numeric: true, sensitivity: 'base' }) || (a < b ? -1 : 1));
        everyPriced = PRICE_TABS.map(k => ({ name: skillOf(k).name, key: k, items: az([...home].filter(([, h]) => h === k).map(([slug]) => slug)) })).filter(g => g.items.length);
      }
      return everyPriced;
    }
    // (v3.3) Gear: every weapon and piece of armour that can be traded (and any you have that can't), A to Z
    // in two lists, whichever skill lists it too. Rares: every rare.
    if (key === GEAR) {
      const b = bank().items;
      const list = Object.keys(ITEMS).filter(s => isGear(s) && !ITEMS[s].set && !ITEMS[s].charge && !ITEMS[s].clue && (!ITEMS[s].untradeable || b[s] > 0)).sort(byName);
      return kindGroups(list).map(g => ({ ...g, any: true }));
    }
    if (key === RARES) return [{ name: 'Rares', items: RARE_ITEMS, any: true }];
    if (BANK_GROUPS[key]) return [...BANK_GROUPS[key], ...(SALE_GROUPS[key] || [])];
    // (not coins, which are worth what they are: Thieving's loot)
    const made = [...new Set(METHODS.filter(m => m.skill === key).flatMap(m => Object.keys(m.out)))].filter(k => ITEMS[k]?.gp == null);
    // (and what it uses up: Fishing's bait and feathers)
    const used = [...new Set(METHODS.filter(m => m.skill === key).flatMap(m => Object.keys(m.in)))].filter(k => !made.includes(k));
    return [{ name: textFor(key).made || textFor(key).what, items: made }, ...(used.length ? [{ name: textFor(key).takes || 'Supplies', items: used }] : [])];
  }
  function wantPrices(keys, opts) {
    const items = new Set();
    for (const k of keys) for (const i of skillItems(k)) items.add(i);
    prices.want([...items], opts);
  }

  // ── Small HTML helpers ──────────────────────────────────────────────────
  function itemIcon(slug, small = false) {
    const it = ITEMS[slug];
    if (!it) return '';
    const size = small ? ICON_SIZE / 2 : ICON_SIZE;
    const x = (it.icon % ICONS_PER_ROW) * size, y = Math.floor(it.icon / ICONS_PER_ROW) * size;
    const bg = small ? `background-size:${ICONS_PER_ROW * size}px auto;` : '';
    return `<span class="item${it.more ? ' more' : ''}${small ? ' sm' : ''}" style="${bg}background-position:-${x}px -${y}px" role="img" aria-label="${esc(it.name)}" title="${esc(it.name)}"></span>`;
  }
  const itemName = slug => esc(ITEMS[slug]?.name || slug);
  // An item's page on the market. LostKit opens it right in this tab (its ◀
  // button comes back here); a browser opens a new tab.
  const marketLink = slug => `href="${esc(`${LIVE_MARKET}/items/${encodeURIComponent(slug)}`)}"${ctx.inLostKit ? '' : ' target="_blank" rel="noopener"'}`;
  // (v3.2) Everywhere else an item's name goes to its line on the Prices tab (that one links to the market).
  // Not for coins and the like: worth what they are, they have no line there.
  const pricedLine = slug => !!ITEMS[slug] && ITEMS[slug].gp == null;
  const priceLink = slug => `href="#prices" data-price-go="${esc(slug)}"`;
  function goPrice(slug) {
    if (!pricedLine(slug)) return;
    S.priceQ = ITEMS[slug].name; S.priceHl = slug; S.priceHlScroll = true; S.pqOnly = false;
    ctx.goTab('prices');
    prices.want([slug], { all: true });
  }
  // The item that stands for a method: what it makes (a gem rock says which of
  // its gems), or for burning logs, the logs.
  const methodItem = m => m.icon || Object.keys(m.out)[0] || Object.keys(m.in)[0];
  // A picture on the icon sheet that isn't an item's: a spell's own icon, 20 by 20
  // in the middle of its cell. Full size it sits in an item's box; small, it's
  // shown as it is, since at half size nothing of it would be left.
  const SPRITE = 20, SPRITE_PAD = (ICON_SIZE - SPRITE) / 2;
  function spriteIcon(cell, name, small = false) {
    const x = (cell % ICONS_PER_ROW) * ICON_SIZE + (small ? SPRITE_PAD : 0), y = Math.floor(cell / ICONS_PER_ROW) * ICON_SIZE + (small ? SPRITE_PAD : 0);
    return `<span class="item sprite${small ? ' sm' : ''}" style="background-position:-${x}px -${y}px" role="img" aria-label="${esc(name)}" title="${esc(name)}"></span>`;
  }
  // Its icon: its own picture (a spell), else what it makes or takes; where
  // there's no item to show (an Agility course), the skill's own in its place.
  const methodIcon = (m, small = false) => (m.sprite != null ? spriteIcon(m.sprite, m.name, small)
    : ITEMS[methodItem(m)] ? itemIcon(methodItem(m), small)
    : `<span class="item blank${small ? ' sm' : ''}">${iconImg(SKILL_BY_KEY.get(m.skill))}</span>`);
  const plural = (name, n) => (n === 1 || /s$/i.test(name) ? name : name + 's');
  function priceTip(slug) {
    const i = prices.info(slug);
    if (!i) return 'No price yet';
    return `${gpShort(i.gp)} gp each · ${sourceText(i)}`;
  }
  function sourceText(i) {
    if (!i) return '';
    if (i.src === 'you') return 'your price';
    if (i.src === 'sales') return `median of ${i.n} sale${i.n === 1 ? '' : 's'}${i.last ? `, last ${ago(i.last)}` : ''}`;
    if (i.src === 'offers') return `median of ${i.n} open offer${i.n === 1 ? '' : 's'}`;
    if (i.src === 'dose') return '¾ of the 4-dose price';
    if (i.src === 'alch') return i.untradeable ? 'can\'t be traded: high alch' : i.untraded ? 'no trades: high alch' : 'high alch';
    return '';
  }
  // "3,948 Ranarr weed" chips; with prices when known.
  function itemList(items, { priced = true, small = false, named = !small } = {}) {
    const entries = Object.entries(items).filter(([, n]) => n > 1e-9).map(([slug, n]) => [slug, whole(n)]);
    if (!entries.length) return '<span class="c-faint">nothing</span>';
    return entries.map(([slug, n]) => {
      if (ITEMS[slug]?.gp != null) return `<span class="it-chip" title="${esc(ITEMS[slug].name)}: a fee paid on the way">${itemIcon(slug, small)}<b>${fmt(n)}</b>${named ? ' ' + itemName(slug) : ''}</span>`;
      const p = priced ? prices.gp(slug) : null;
      return `<a class="it-chip mk" ${priceLink(slug)} title="${esc(ITEMS[slug]?.name || slug)}${priced ? '\n' + esc(priceTip(slug)) : ''}\nClick to see its price on the Prices tab">${itemIcon(slug, small)}<b>${fmt(n)}</b>${named ? ' ' + itemName(slug) : ''}${p != null && named ? ` <span class="c-faint">(${gpShort(p * n)})</span>` : ''}</a>`;
    }).join('');
  }
  const pct = (a, b) => (b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : 100);
  // "700 × Prayer potion", or for a method counted in what it uses:
  // "5,000 essence → 25,000 Air runes", "100 logs → 1,500 Bronze arrows"
  // or for one counted in what its output is for: "Ore for 400 steel bars: 400 Iron ore + 800 Coal"
  // or in its own unit, said in full: "450 laps of the Gnome Stronghold course"
  function actionText(m, runs, made) {
    if (m.as) {
      const out = Object.entries(made || {}).filter(([, n]) => n > 0).map(([item, n]) => `<b>${fmt(n)}</b> ${itemName(item)}`).join(' + ');
      return `${m.lead ? `${esc(m.lead)} ` : ''}<b>${fmt(runs)}</b> ${esc(m.as[runs === 1 ? 0 : 1])}${m.lead && out ? `: ${out}` : ''}`;
    }
    if (!m.unit) return `<b>${fmt(runs)}</b> × ${esc(m.name)}`;
    const [item, n] = Object.entries(made || {})[0] || [methodItem(m), runs];
    const unit = runs === 1 ? m.unit : m.units || m.unit + 's';
    return `<b>${fmt(runs)}</b> ${esc(unit)} → <b>${fmt(n)}</b> ${esc(plural(ITEMS[item]?.name || m.name, n))}`;
  }
  // "cut 75 + string 75", for a whole job made of steps
  const partsText = m => (m.parts ? m.parts.map(([what, x]) => `${what} ${xpText(x)}`).join(' + ') : '');
  // "×3", for runes that come more than one per essence at this level
  function multipleBadge(m, level) {
    if (!m.multiple) return '';
    const k = Math.floor(level / m.multiple) + 1;
    const next = (k) * m.multiple;
    const tip = `${k} per ${m.unit || 'action'} at level ${level}${next <= MAX_LEVEL ? `, ${k + 1} from level ${next}` : ''}`;
    return k > 1 || next <= MAX_LEVEL ? ` <span class="mult" title="${esc(tip)}">×${k}</span>` : '';
  }
  // Methods by group, the main way to train (kind xp) first: [[group, methods], ...]
  function groupsOf(methods) {
    const map = new Map();
    for (const m of [...methods].sort((a, b) => (a.kind === 'xp' ? 0 : 1) - (b.kind === 'xp' ? 0 : 1))) {
      if (!map.has(m.group)) map.set(m.group, []);
      map.get(m.group).push(m);
    }
    return [...map];
  }

  // ── Goals view ──────────────────────────────────────────────────────────
  // Moves a goal past its neighbour among the goals on screen, so it works the
  // same with a filter on.
  // (v3.3) A goal card's ▲ ▼ and, either side, ⤒ to the top and ⤓ to the bottom of the list.
  // (v3.3.1: their classes are to-top and to-bottom: "top" is the header bar's, whose look a button took on)
  function moveButtons(name, first, last) {
    const b = (act, sym, title, off, cls = '') => `<button type="button" class="mv${cls}" data-act="${act}" title="${title}" aria-label="${esc(`${title}: ${name} goal`)}"${off ? ' disabled' : ''}>${sym}</button>`;
    return `<span class="mv-group">${b('goal-top', '▲', 'Move to the top', first, ' mv-end to-top')}${b('goal-up', '▲', 'Move up', first)}${b('goal-down', '▼', 'Move down', last)}${b('goal-bottom', '▼', 'Move to the bottom', last, ' mv-end to-bottom')}</span>`;
  }
  function moveGoal(id, dir) {
    const vi = S.visible.indexOf(id);
    const other = S.visible[vi + dir];
    if (vi < 0 || !other) return;
    const list = goals();
    const i = list.findIndex(g => g.id === id);
    if (i < 0) return;
    const [g] = list.splice(i, 1);
    const j = list.findIndex(x => x.id === other);
    list.splice(dir < 0 ? j : j + 1, 0, g);
    saveGoals(list);
  }

  function moveGoalTo(id, end) {
    const list = goals();
    const i = list.findIndex(g => g.id === id);
    if (i < 0) return;
    const [g] = list.splice(i, 1);
    if (end === 'top') list.unshift(g); else list.push(g);
    saveGoals(list);
  }
  function placeShown(ids) {
    const list = goals();
    const set = new Set(ids);
    const byId = new Map(list.map(g => [g.id, g]));
    let k = 0;
    saveGoals(list.map(g => (set.has(g.id) ? byId.get(ids[k++]) : g)));
  }
  const arm = btn => { btn.dataset.armed = '1'; btn.textContent = 'Remove?'; btn.classList.add('armed'); };
  // (v3.3.2) six dots at the start of a goal's head: what can be dragged
  const GRIP = '<span class="grip" title="Drag to move this goal" aria-hidden="true"></span>';
  function renderGoals() {
    if (stepDrag?.hold() || goalDrag?.hold()) return;          // don't pull a plan's lines, or a goal, out from under a drag
    planCache = new Map(); combatCache = null;      // (worked out afresh, once for this redraw)
    renderAccount('plan-account', 'goals');
    renderNewGoal();
    const list = goals();
    const box = $('goals-list');
    if (!S.account) { box.innerHTML = ''; return; }
    // (the goals you've set, under a title of their own: the buttons above are for setting one)
    const title = (hint = '') => `<h4 class="row-title goals-title">Your goals${hint}</h4>`;
    if (!list.length) {
      box.innerHTML = `${title()}<div class="empty">No goals yet. Pick a skill above and set a level, XP, rank or top % to reach. The first two buttons are your total level and your combat level.</div>`;
      return;
    }
    // A goal set before your XP had loaded starts counting from the first XP seen
    // (a Combat level goal: from the combat level as it was then).
    const real = combatReal();
    const total = totalReal();
    const unset = g => (isCombatGoal(g) ? g.startCb == null && !!real : isTotalGoal(g) ? (g.startTotal == null || (g.type === 'xp' && g.startXp10 == null)) && total != null
      : !isSlayerGoal(g) && g.startXp10 == null && !!currentOf(g.skill));
    if (S.profile && list.some(unset)) {
      for (const g of list) {
        if (!unset(g)) continue;
        if (isCombatGoal(g)) g.startCb = combatExact(real.low);
        else if (isTotalGoal(g)) { g.startTotal ??= total; if (g.type === 'xp') g.startXp10 ??= overallNow().xp10; }
        else g.startXp10 = currentOf(g.skill).xp10;
      }
      saveGoals(list);
    }
    // Filter: by status and/or one skill. The order is yours (move goals up and down).
    const done = g => {
      if (isCombatGoal(g)) return !!real && real.min >= g.value;
      if (isTotalGoal(g)) return totalReached(g);
      if (isSlayerGoal(g)) return npc().reached(g);              // (its kills done)
      const cur = currentOf(g.skill);
      const t = cur && targetOf(g, cur);
      return !!(t && !t.pending && (t.reached || t.xp10 <= cur.xp10));
    };
    const status = new Map(list.map(g => [g.id, done(g)]));
    const inStatus = g => S.show === 'all' || (S.show === 'done') === status.get(g.id);
    // (a button for each skill with a goal among those shown: In progress leaves out the skills whose goals are all reached)
    const skills = [...new Set(list.filter(inStatus).map(g => g.skill))];
    for (const k of [...S.only]) if (!skills.includes(k)) S.only.delete(k);
    // (v3.3: the skills picked, as many as you like, each its own goals: Total level, Combat level and
    // Slayer goals have buttons of their own, and come with no other)
    const only = g => !S.only.size || S.only.has(g.skill);
    const shown = list.filter(g => inStatus(g) && only(g));
    S.visible = shown.map(g => g.id);
    const count = k => list.filter(g => k === 'all' || (k === 'done') === status.get(g.id)).length;
    const sBtn = (k, label) => `<button type="button" class="${S.show === k ? 'on' : ''}" data-gshow="${k}">${label} <span class="c-faint">${count(k)}</span></button>`;
    const anyOpen = shown.some(g => S.open.has(g.id) && hasPlan(g));
    // (the tables of the plans that are open: all hidden or shown at once)
    const tablesOpen = shown.filter(g => S.open.has(g.id) && (hasCalculator(g.skill) || isSlayerGoal(g)));
    const tablesOn = tablesOpen.some(g => !S.tableOff.has(g.id));
    // (Hide all plans and Hide all tables: on a line of their own under the filter, side by side)
    const links = [
      shown.some(hasPlan) ? `<button type="button" class="linkish" data-act="${anyOpen ? 'close-all' : 'open-all'}">${anyOpen ? 'Hide all plans' : 'Show all plans'}</button>` : '',
      tablesOpen.length ? `<button type="button" class="linkish" data-act="${tablesOn ? 'tables-off' : 'tables-on'}" title="${tablesOn ? "Hide the table of every option in each open plan. The plans' own lines stay." : 'Show the table of every option in each open plan.'}">${tablesOn ? 'Hide all tables' : 'Show all tables'}</button>` : '',
    ].filter(Boolean).join('');
    const bar = list.length > 1 ? `<div class="goal-filter">
        <span class="c-muted small-note">Show</span>
        <div class="seg" role="group" aria-label="Show goals">${sBtn('all', 'All')}${sBtn('active', 'In progress')}${sBtn('done', 'Reached')}</div>
        ${skills.length > 1 ? `<div class="skill-picker mini" role="group" aria-label="The skills whose goals are shown">${skills.map(k => {
          const sk = k === COMBAT_PICK ? combatCard.icon : k === TOTAL_PICK ? TOTAL : skillOf(k);
          const on = S.only.has(k);
          const name = esc(sk.name);
          // (v3.3.1: one at a time, a button shows its goals alone, or every goal again)
          const title = S.onlyOne ? (on ? 'Show every goal' : `Only ${name}`)
            : on ? (S.only.size === 1 ? 'Show every goal' : `Leave out ${name}`) : S.only.size ? `${name} too` : `Only ${name}`;
          return `<button type="button" class="skill-btn${on ? ' on' : ''}" data-gonly="${k}" title="${title}" aria-pressed="${on}">${iconImg(sk)}</button>`;
        }).join('')}</div>
        <span class="gonly-end"><label class="check small-note gonly-one" title="Ticked, a skill's button shows its goals alone, and another click shows every goal again. Unticked, each button turns its goals on or off, as many as you like."><input type="checkbox" data-gonly-one="1"${S.onlyOne ? ' checked' : ''}> One at a time</label>${S.only.size ? '<button type="button" class="linkish small-note" data-act="gonly-clear">Every skill</button>' : ''}</span>` : ''}
      </div>${links ? `<div class="goal-links">${links}</div>` : ''}` : '';
    // (a "Remove?" waiting for its second click stays that way through a redraw)
    const armed = box.querySelector('[data-act="remove-goal"][data-armed]')?.closest('[data-goal]')?.dataset.goal;
    // (v3.1) Above the goals: new combat XP to count as Slayer goals' kills (npc-ui.js)
    // (v3.3.1: each plan's tables kept where they were scrolled to)
    const scrolls = tableScrolls(box);
    // (v3.3.2) That goals can be dragged: a word by the title, and a grip at the start of each one's head
    const drag = shown.length > 1;
    box.innerHTML = title(drag ? ' <span class="small-note c-faint drag-hint">Drag a goal by its name to move it.</span>' : '') + bar + npc().sessionHtml() + (shown.length
      ? shown.map((g, i) => (isCombatGoal(g) ? combatGoalCard : isTotalGoal(g) ? totalGoalCard : isSlayerGoal(g) ? npc().goalCard : goalCard)(g, i === 0, i === shown.length - 1)).join('')
      : `<div class="empty">No goals match. <button type="button" class="linkish" data-act="show-all-goals">Show all goals</button></div>`);
    restoreTableScrolls(box, scrolls);
    if (drag) for (const head of box.querySelectorAll(':scope > .goal > .goal-head')) head.insertAdjacentHTML('afterbegin', GRIP);
    const again = armed && [...box.querySelectorAll('[data-goal]')].find(c => c.dataset.goal === armed)?.querySelector('[data-act="remove-goal"]');
    if (again) arm(again);
    for (const card of box.querySelectorAll('[data-goal]')) applySearch(card);
    // (v3.3: a goal gone to stays lit through a redraw, where its light had got to)
    const lit = S.lit && Date.now() - S.lit.at < LIT_MS && box.querySelector(`:scope > .goal[data-goal="${CSS.escape(S.lit.id)}"]`);
    if (lit) { lit.style.animationDelay = `-${Date.now() - S.lit.at}ms`; lit.classList.add('lit'); }
    // (and scrolled to once the plans are drawn: the account's XP in, or not to be had. Till then the goals
    // above it may be shorter than they're about to be, or the page too short to scroll at all)
    if (S.scrollGoal && Date.now() - S.scrollGoal.at > 10e3) S.scrollGoal = null;
    if (S.scrollGoal && !S.loading && (S.profile || S.error)) {
      const sel = `#goals-list > .goal[data-goal="${CSS.escape(S.scrollGoal.id)}"]`;
      S.scrollGoal = null;
      // (looked for when it's time: the goals may be drawn again before then)
      requestAnimationFrame(() => document.querySelector(sel)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    }
    const keys = [...new Set(list.map(g => g.skill).filter(hasCalculator))];
    if (keys.length && S.profile) wantPrices(keys);
    // (v3.4) and a Ranged goal's ammo
    const ammo = shown.filter(g => g.skill === 'ranged' && S.open.has(g.id)).map(g => ammoOf(g).gear.ammo);
    if (ammo.length && S.profile) prices.want(ammo);
  }

  function renderAccount(id, where) {
    const el = $(id);
    const saved = players.saved(), recent = players.recent();
    const names = [...new Set([...saved, ...recent])];
    const p = S.profile;
    const status = !S.account ? ''
      : S.loading ? '<span class="pending">Fetching XP…</span>'
      : S.error ? `<span class="c-lose">${S.error}</span>`
      : p ? `XP from the hiscores ${ago(p.fetchedAt)}` : '';
    el.innerHTML = `<div class="card plan-account">
      <form class="inline" data-form="account" autocomplete="off">
        <span class="c-muted">Planning for</span>
        <input class="input small" name="account" maxlength="12" list="plan-names" value="${esc(S.account || '')}" placeholder="Your username" spellcheck="false" aria-label="Planning for">
        <datalist id="plan-names">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        <button class="btn small" type="submit">${S.account ? 'Switch' : 'Start'}</button>
      </form>
      ${S.account ? `<span class="acct-status">${status}</span>
      <button type="button" class="linkish" data-act="refresh-xp">Refresh XP</button>` : ''}
      ${where === 'bank' && S.account ? `<span class="c-faint">Each account has its own bank and goals.</span>` : ''}
    </div>`;
    if (!S.account) {
      el.innerHTML += `<div class="empty">Enter your username to plan goals. Your XP comes from the hiscores; goals and your bank stay in this browser.</div>`;
    }
  }

  function renderNewGoal() {
    const el = $('goal-new');
    if (!S.account) { el.innerHTML = ''; return; }
    const g = S.newGoal;
    const pick = (key, name, icon) => `<button type="button" class="skill-btn${key === g.skill ? ' on' : ''}" data-nskill="${key}" title="${esc(name)}" aria-label="${esc(name)}" aria-pressed="${key === g.skill}">${icon}</button>`;
    // Total level first (v3.1), then combat level, before Attack, then the skills in the hiscores' order.
    // (under a title: these buttons set a goal; the ones under "Your goals" are for the goals you've set)
    // (Slayer in its hiscores place, after Thieving: the home of monster plans until the skill comes)
    const picker = `<h4 class="row-title">Set a goal <span class="c-faint small-note">Pick your total level, your combat level or a skill, then what to reach. Each goal gets its own Plan (Calculator).</span></h4>
      <div class="skill-picker">${pick(TOTAL_PICK, 'Total level', iconImg(TOTAL))}${pick(COMBAT_PICK, 'Combat level', iconImg(combatCard.icon))}${[...SKILL_IDS, SLAYER.id].sort((a, b) => a - b).map(id => {
      const s = id === SLAYER.id ? SLAYER : SKILLS.find(x => x.id === id);
      return pick(s.key, id === SLAYER.id ? 'Slayer: a plan of kills, their XP and loot' : s.name, iconImg(s));
    }).join('')}</div>`;
    if (g.skill === SLAYER.key) { el.innerHTML = npc().newGoalHtml(picker); return; }
    // (Total level: a level to reach, or (v3.2) total XP, an Overall rank or a top %)
    if (g.skill === TOTAL_PICK) {
      const now = totalReal();
      const o = overallNow();
      const rows = now != null ? totalSkills() : null;
      const after = rows ? now + rows.reduce((a, r) => a + (r.goal - r.level), 0) : null;
      const type = ['level', 'xp', 'rank', 'top'].includes(g.type) ? g.type : 'level';
      const hint = type === 'level' ? TARGET_HINT.total : TARGET_HINT[type];
      const ov = totals.get(0);
      const topNow = o?.rank && ov ? topPercent(o.rank, ov.total) : null;
      const suggest = now == null ? '' : type === 'level' ? Math.min(MAX_TOTAL, Math.max(after, now) + 25)
        : type === 'xp' ? Math.ceil((o.xp10 / 10 + 1) / 1e6) * 1e6
        : type === 'rank' ? (o.rank ? Math.max(1, Math.floor(o.rank * 0.8)) : '')
        : topNow != null ? Math.max(0.01, Math.floor(topNow * 0.8 * 100) / 100) : 10;
      const tBtn = (k, label) => `<button type="button" class="${type === k ? 'on' : ''}" data-ntype="${k}" aria-pressed="${type === k}">${label}</button>`;
      el.innerHTML = `<div class="card goal-new">
        ${picker}
        <form class="bar wrap" data-form="goal" autocomplete="off">
          <span class="goal-skill">${iconImg(TOTAL)} Total level</span>
          <div class="seg" role="group" aria-label="Goal type">${tBtn('level', 'Level')}${tBtn('xp', 'XP')}${tBtn('rank', 'Rank')}${tBtn('top', 'Top %')}</div>
          <input class="input small num" name="value" inputmode="${type === 'top' ? 'decimal' : 'numeric'}" placeholder="${hint}" value="${suggest}" aria-label="${hint}">
          <button class="btn small" type="submit">Add goal</button>
          <span class="c-faint small-note">${now != null ? `Now: total level ${fmt(now)} · ${xpText(o.xp10)} XP${o.rank ? ` · rank ${fmt(o.rank)}` : ''}${topNow != null ? ` · top ${formatPercent(topNow)}%` : ''}${type === 'level' && after > now ? ` · your skill goals reach ${fmt(after)}` : ''}` : S.profile ? '' : 'Your XP loads from the hiscores.'}</span>
        </form>
      </div>`;
      return;
    }
    // (Combat level: a level to reach, the only kind of goal it has)
    if (g.skill === COMBAT_PICK) {
      const c = combatNow();
      const after = c ? combatLevel(c.goal) : null;
      const hint = TARGET_HINT.combat;
      el.innerHTML = `<div class="card goal-new">
        ${picker}
        <form class="bar wrap" data-form="goal" autocomplete="off">
          <span class="goal-skill">${iconImg(combatCard.icon)} Combat level</span>
          <div class="seg" role="group" aria-label="Goal type"><button type="button" class="on" aria-pressed="true">Level</button></div>
          <input class="input small num" name="value" inputmode="numeric" placeholder="${hint}" value="${c ? Math.min(MAX_COMBAT, c.real.min + 1) : ''}" aria-label="${hint}">
          <button class="btn small" type="submit">Add goal</button>
          <span class="c-faint small-note">${c ? `Now: level ${combatCard.text(c.real)}${after > c.real.min ? ` · your skill goals reach ${after}` : ''}` : S.profile ? '' : 'Your XP loads from the hiscores.'}</span>
        </form>
      </div>`;
      return;
    }
    const cur = currentOf(g.skill);
    const skill = SKILL_BY_KEY.get(g.skill);
    const tBtn = (t, label) => `<button type="button" class="${g.type === t ? 'on' : ''}" data-ntype="${t}">${label}</button>`;
    const placeholder = TARGET_HINT[g.type];
    const suggestion = suggestValue(g.type, cur, skill);
    el.innerHTML = `<div class="card goal-new">
      ${picker}
      <form class="bar wrap" data-form="goal" autocomplete="off">
        <span class="goal-skill">${iconImg(skill)} ${esc(skill.name)}</span>
        <div class="seg" role="group" aria-label="Goal type">${tBtn('level', 'Level')}${tBtn('xp', 'XP')}${tBtn('rank', 'Rank')}${tBtn('top', 'Top %')}</div>
        <input class="input small num" name="value" inputmode="decimal" placeholder="${placeholder}" value="${suggestion ?? ''}" aria-label="${placeholder}">
        <button class="btn small" type="submit">Add goal</button>
        <span class="c-faint small-note">${cur ? currentLine(cur, skill) : S.profile ? '' : 'Your XP loads from the hiscores.'}</span>
      </form>
    </div>`;
  }

  function currentLine(cur, skill) {
    if (!cur.ranked) return `Now: level ${cur.range && cur.range.min !== cur.range.max ? `${cur.range.min}–${cur.range.max}` : cur.level} (below ${MIN_RANKED_LEVEL}, not on the hiscores)`;
    const t = totals.get(skill.id);
    const top = t ? topPercent(cur.rank, t.total) : null;
    return `Now: level ${cur.level} · ${xpText(cur.xp10)} XP · rank ${fmt(cur.rank)}${top != null ? ` · top ${formatPercent(top)}%` : ''}`;
  }

  function suggestValue(type, cur, skill) {
    if (!cur) return type === 'level' ? 99 : '';
    if (type === 'level') return Math.min(MAX_LEVEL, cur.level + 1);
    if (type === 'xp') return Math.round(xp10ForLevel(Math.min(MAX_LEVEL, cur.level + 1)) / 10);
    if (type === 'rank') return cur.rank ? Math.max(1, Math.floor(cur.rank * 0.8)) : '';
    const t = totals.get(skill.id);
    const top = cur.rank && t ? topPercent(cur.rank, t.total) : null;
    return top != null ? Math.max(0.1, Math.floor(top * 0.8 * 10) / 10) : 10;
  }

  // A goal's target as typed, checked: { value }, or { problem } (HTML) when it
  // isn't a number, is out of range or is somewhere you already are.
  function readTarget(skillKey, type, text) {
    const v = type === 'top' ? parseFloat(String(text).replace(',', '.')) : parseAmount(text);
    const bad = problem => ({ problem });
    if (v == null || !Number.isFinite(v) || v <= 0) return bad('Enter a number for the goal.');
    if (skillKey === TOTAL_PICK) {
      const o = overallNow();
      if (type === 'xp') {
        if (v > TOTAL_SKILLS.length * MAX_XP10 / 10) return bad(`Total XP stops at ${fmt(TOTAL_SKILLS.length * MAX_XP10 / 10)}: 200M in every skill.`);
        if (o && v * 10 <= o.xp10) return bad(`${esc(S.account)} already has ${xpText(o.xp10)} XP in all.`);
        return { value: Math.floor(v) };
      }
      if (type === 'rank') {
        if (o?.rank && o.rank <= v) return bad(`${esc(S.account)} is already rank ${fmt(o.rank)} in Overall.`);
        return { value: Math.floor(v) };
      }
      if (type === 'top') {
        if (v > 100) return bad('Top % is at most 100.');
        const ov = totals.get(0);
        const top = o?.rank && ov ? topPercent(o.rank, ov.total) : null;
        if (top != null && top <= v) return bad(`${esc(S.account)} is already in the top ${formatPercent(top)}% in Overall.`);
        return { value: Math.round(v * 100) / 100 };
      }
      const level = Math.floor(v);
      if (level > MAX_TOTAL) return bad(`Total level goals go up to ${fmt(MAX_TOTAL)}: every skill 99.`);
      const now = totalReal();
      if (now != null && level <= now) return bad(`${esc(S.account)} is already total level ${fmt(now)}.`);
      return { value: level };
    }
    if (skillKey === COMBAT_PICK) {
      const level = Math.floor(v);
      if (level < 4 || level > MAX_COMBAT) return bad(`Combat level goals go from 4 to ${MAX_COMBAT}.`);
      const real = combatReal();
      if (real && level <= real.min) return bad(`${esc(S.account)} is already combat level ${combatCard.text(real)}.`);
      return { value: level };
    }
    if (type === 'level' && (v < 2 || v > MAX_LEVEL)) return bad('Levels go from 2 to 99.');
    if (type === 'xp' && v > MAX_XP10 / 10) return bad('XP stops at 200,000,000.');
    if (type === 'top' && v > 100) return bad('Top % is at most 100.');
    const cur = currentOf(skillKey);
    const name = SKILL_BY_KEY.get(skillKey).name;
    if (cur && type === 'level' && cur.ranked && v <= cur.level) return bad(`${esc(S.account)} is already level ${cur.level} in ${esc(name)}.`);
    if (cur && type === 'xp' && cur.ranked && v * 10 <= cur.xp10) return bad(`${esc(S.account)} already has ${xpText(cur.xp10)} ${esc(name)} XP.`);
    if (cur && type === 'rank' && cur.rank && cur.rank <= v) return bad(`${esc(S.account)} is already rank ${fmt(cur.rank)} in ${esc(name)}.`);
    if (cur && type === 'top' && cur.rank) {
      const t = totals.get(SKILL_BY_KEY.get(skillKey).id);
      const top = t ? topPercent(cur.rank, t.total) : null;
      if (top != null && top <= v) return bad(`${esc(S.account)} is already in the top ${formatPercent(top)}% in ${esc(name)}.`);
    }
    return { value: type === 'top' ? Math.round(v * 100) / 100 : Math.floor(v) };
  }

  function addGoal(value) {
    const g = S.newGoal;
    const combat = g.skill === COMBAT_PICK, total = g.skill === TOTAL_PICK;
    const totalType = ['level', 'xp', 'rank', 'top'].includes(g.type) ? g.type : 'level';
    const read = readTarget(g.skill, combat ? 'level' : total ? totalType : g.type, value);
    if (read.problem) { showMsg('goals-msg', read.problem, 'error'); return false; }
    const cur = currentOf(g.skill);
    const id = newId();
    // (a Combat level goal's bar starts from the combat level as it is, parts of a level and all)
    const real = combat ? combatReal() : null;
    const goal = combat ? { id, skill: COMBAT_PICK, type: 'level', value: read.value, created: Date.now(), startCb: real ? combatExact(real.low) : null }
      : total ? { id, skill: TOTAL_PICK, type: totalType, value: read.value, created: Date.now(), startTotal: totalReal(), ...(totalType === 'xp' && overallNow() ? { startXp10: overallNow().xp10 } : {}) }
      : { id, skill: g.skill, type: g.type, value: read.value, created: Date.now(), startXp10: cur ? cur.xp10 : null };
    const list = goals();
    list.push(goal);
    saveGoals(list);
    if (hasPlan(goal)) S.open.add(goal.id);
    showMsg('goals-msg', '');
    showNewGoal(goal.id);
    return true;
  }

  // Moving the goalpost: a goal's type and target changed in place. Everything
  // else about it stays: its plan, what's ticked, your order, and where its
  // progress bar started.
  function saveGoalEdit(id, text) {
    const goal = goals().find(g => g.id === id);
    const e = S.editing;
    if (!goal || !e || e.id !== id) return;
    const read = readTarget(goal.skill, e.type, text);
    if (read.problem) { e.problem = read.problem; e.draft = text; renderGoals(); return; }
    updateGoal(id, g => {
      if (g.type !== e.type || g.value !== read.value) delete g.target;      // (whoever held the rank it was after)
      if (isTotalGoal(g) && e.type === 'xp' && g.type !== 'xp') g.startXp10 = overallNow()?.xp10 ?? null;
      g.type = e.type; g.value = read.value;
    });
    delete S.goalErr[id];
    S.editing = null;
    renderGoals();
  }
  const TARGET_HINT = { level: 'Level (2–99)', xp: 'XP', rank: 'Rank', top: 'Top % (e.g. 10)', combat: `Level (up to ${MAX_COMBAT})`, total: `Level (up to ${MAX_TOTAL.toLocaleString('en-US')})` };
  const newId = () => 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  function goalEditHtml(goal, cur, skill) {
    const e = S.editing;
    const combat = isCombatGoal(goal);       // (a level is the only kind of goal it has; a Total level goal has all four, v3.2)
    const tBtn = (t, label) => `<button type="button" class="${e.type === t ? 'on' : ''}" data-etype="${t}" aria-pressed="${e.type === t}">${label}</button>`;
    const value = e.draft ?? (e.type === goal.type ? goal.value : isTotalGoal(goal) ? '' : suggestValue(e.type, cur, skill) ?? '');
    const hint = isTotalGoal(goal) && e.type === 'level' ? TARGET_HINT.total : combat ? TARGET_HINT.combat : TARGET_HINT[e.type];
    return `<form class="bar wrap goal-edit" data-form="edit-goal" autocomplete="off">
      <span class="c-muted small-note">Change this goal to</span>
      <div class="seg" role="group" aria-label="Goal type">${combat ? '<button type="button" class="on" aria-pressed="true">Level</button>' : `${tBtn('level', 'Level')}${tBtn('xp', 'XP')}${tBtn('rank', 'Rank')}${tBtn('top', 'Top %')}`}</div>
      <input class="input small num" name="value" inputmode="${combat ? 'numeric' : 'decimal'}" placeholder="${hint}" value="${esc(String(value))}" aria-label="${hint}">
      <button class="btn small" type="submit">Save</button>
      <button type="button" class="linkish" data-act="edit-cancel">Cancel</button>
      ${e.problem ? `<span class="c-lose small-note">${e.problem}</span>` : `<span class="c-faint small-note">${isTotalGoal(goal) ? 'Its progress stays as it is, and so do its ticks.' : combat ? 'Its progress stays as it is, and so does what you typed into its calculator.' : 'Its plan, ticks and progress stay as they are.'}</span>`}
    </form>`;
  }

  function goalTitle(goal, cur, target) {
    const t = totals.get(SKILL_BY_KEY.get(goal.skill).id);
    const topNow = cur?.rank && t ? topPercent(cur.rank, t.total) : null;
    if (goal.type === 'level') return `Level ${cur ? cur.level : '?'} → <b>${goal.value}</b>`;
    if (goal.type === 'xp') return `${cur ? xpText(cur.xp10) : '?'} → <b>${fmt(goal.value)}</b> XP`;
    if (goal.type === 'rank') return `Rank ${cur?.rank ? fmt(cur.rank) : 'none'} → <b>${fmt(goal.value)}</b>`;
    return `Top ${topNow != null ? formatPercent(topNow) + '%' : '?'} → <b>${formatPercent(goal.value)}%</b>${target?.rank ? ` <span class="c-faint">(rank ${fmt(target.rank)})</span>` : ''}`;
  }

  function goalCard(goal, first = true, last = true) {
    const skill = SKILL_BY_KEY.get(goal.skill);
    const { cur, target, ix, plan, pool } = planFor(goal);
    const open = S.open.has(goal.id);
    let sub = '', bar = '', reached = false;
    if (!cur) sub = S.loading ? '<span class="pending">Loading your XP…</span>' : 'Your XP is not loaded.';
    else if (!target || target.pending) sub = `<span class="pending">${esc(target?.note || 'Working it out…')}</span>`;
    else {
      const toGo = Math.max(0, target.xp10 - cur.xp10);
      reached = target.reached || toGo === 0;
      const lvTo = levelForXp10(target.xp10);
      const levels = lvTo - cur.level;
      const who = target.who ? ` · beat ${esc(target.who)} (rank ${fmt(target.rank)}, checked ${ago(target.at)})` : '';
      sub = reached
        ? `<span class="c-win">Reached</span> · ${xpText(cur.xp10)} XP`
        : `${xpText(cur.xp10)} / ${xpText(target.xp10)} XP · <b>${xpText(toGo)}</b> XP to go${levels > 0 ? ` · ${levels} level${levels === 1 ? '' : 's'} (to ${lvTo})` : ''}${who}`;
      const start = goal.startXp10 ?? cur.xp10;
      const p = reached ? 100 : pct(cur.xp10 - start, target.xp10 - start);
      bar = `<div class="pbar goal-bar${reached ? ' maxed' : ''}" title="${p.toFixed(1)}% of the way since you set this goal"><div style="width:${p.toFixed(1)}%"></div></div>`;
      if (!cur.ranked) sub += ` <span class="c-faint">(${esc(skill.name)} is below ${MIN_RANKED_LEVEL}, so its lowest possible level is used)</span>`;
    }
    const err = S.goalErr[goal.id] ? `<div class="msg error">${S.goalErr[goal.id]}</div>` : '';
    const toggle = ix
      ? `<button type="button" class="btn small" data-act="toggle-plan" aria-expanded="${open}">${open ? `Hide ${PLAN_LABEL}` : PLAN_LABEL}</button>`
      : '';
    const editing = S.editing?.id === goal.id;
    return `<div class="card goal" data-goal="${goal.id}">
      <div class="goal-head">${iconImg(skill)} <span class="goal-name">${esc(skill.name)}</span>
        <span class="goal-title">${goalTitle(goal, cur, target)}</span>
        <button type="button" class="linkish small-note" data-act="edit-goal" aria-expanded="${editing}" title="Change this goal's target: move the goalpost">Edit</button>
        <span class="grow"></span>
        ${toggle}
        ${moveButtons(skill.name, first, last)}
        <button type="button" class="x" data-act="remove-goal" title="Remove this goal" aria-label="Remove goal">✕</button>
      </div>
      ${editing ? goalEditHtml(goal, cur, skill) : ''}
      <div class="goal-sub">${sub}</div>
      ${bar}${err}
      ${ix && open && plan ? planHtml(goal, plan, ix, cur, pool) : ''}
    </div>`;
  }

  // ── The plan for one goal ───────────────────────────────────────────────
  function planHtml(goal, plan, ix, cur, pool = null) {
    if (!usesBank(goal.skill)) {
      return `<div class="plan"><div class="plan-opts"><span class="c-faint">${esc(textFor(goal.skill).noBank || '')}</span>${choicesHtml(goal)}</div>
        ${mixHtml(goal, plan, ix, pool)}${thenHtml(goal, plan, ix, pool)}${goal.skill === 'ranged' ? ammoHtml(goal, plan, ix, cur) : ''}${combatTip(goal)}${tableHtml(goal, plan, ix, cur)}</div>`;
    }
    const b = bank();
    const useBank = goal.useBank !== false;
    const assume = new Set(goal.assume ?? DEFAULT_ASSUME[goal.skill] ?? []);
    const bankCount = Object.values(b.items).filter(n => n > 0).length;
    const opts = `<div class="plan-opts">
      <label class="check"><input type="checkbox" data-gopt="useBank" ${useBank ? 'checked' : ''}> Use my bank</label>
      ${useBank && hasEven(ix) ? `<label class="check" title="${esc(roundUpTip(goal.skill))}"><input type="checkbox" data-gopt="roundUp" ${goal.roundUp ? 'checked' : ''}> Round up my supplies</label>` : ''}
      ${ASSUME_LABEL[goal.skill] ? `<label class="check" title="${ASSUME_ONE[goal.skill] ? "When on, it never holds a plan back, and it's left out of what to collect and of costs." : "When on, these never hold a plan back, and they're left out of what to collect and of costs."}"><input type="checkbox" data-gopt="assume" ${assume.size ? 'checked' : ''}> I'll buy ${ASSUME_LABEL[goal.skill]} as I go</label>` : ''}
      ${placeHtml(goal)}${choicesHtml(goal)}
      <span class="c-faint">${bankCount ? `${bankCount} kind${bankCount === 1 ? '' : 's'} of item in your bank, updated ${ago(b.updated)}` : 'Your bank is empty'} ·</span>
      <button type="button" class="linkish" data-act="to-bank" data-skill="${goal.skill}">Edit bank</button>
    </div>`;
    return `<div class="plan">${opts}${useBank ? bankHtml(goal, plan, ix) : mixHtml(goal, plan, ix)}${thenHtml(goal, plan, ix)}${combatTip(goal)}${tableHtml(goal, plan, ix, cur)}</div>`;
  }

  // Unid herbs can't be planned with (which herb they are is only known once
  // identified), so they get a note instead.
  function unidNote(goal) {
    const n = goal.skill === 'herblore' ? bank().items[UNID_HERBS.item] || 0 : 0;
    if (!n) return '';
    return `<div class="tip">${itemIcon(UNID_HERBS.item, true)} You also have <b>${fmt(n)}</b> unid herb${n === 1 ? '' : 's'}. Identify them first
      (${xpText(UNID_HERBS.xpMin)}–${xpText(UNID_HERBS.xpMax)} XP each, depending on the herb), then add the herbs to your bank.</div>`;
  }

  // " · 2.99M gp (4,271 each)": what a step makes is worth, item by item.
  function worthText(made) {
    const parts = Object.entries(made || {}).filter(([, n]) => n > 0).map(([item, n]) => {
      const p = prices.gp(item);
      const each = Object.keys(made).length > 1 ? ` ${itemName(item)}` : '';
      return p == null ? `<span class="c-faint">? gp${each}</span>`
        : `<b>${gpShort(p * n)}</b> gp${each} <span class="c-faint">(${gpShort(p)} each)</span>`;
    });
    return parts.length ? ` <span class="c-faint">·</span> <span class="step-gp" title="What these sell for">${parts.join(' + ')}</span>` : '';
  }

  // Which tanner: its fees are counted wherever hides are tanned on the way.
  function placeHtml(goal) {
    const choice = PLACES[goal.skill];
    if (!choice) return '';
    const mine = placeOf(goal);
    const tip = `Whose fee is counted where hides are tanned on the way. ${choice.options.map(o => `${o.name}: ${o.note}.`).join(' ')}`;
    return `<label class="check" title="${esc(tip)}">${esc(choice.label)} <select class="input small" data-gopt="place" aria-label="${esc(choice.label)}">${choice.options.map(o =>
      `<option value="${o.id}"${o === mine ? ' selected' : ''}>${esc(o.name)} (${esc(o.short)})</option>`).join('')}</select></label>`;
  }

  // The choices a skill's goals have: a list to pick from, or a tick box.
  function choicesHtml(goal) {
    const set = goal.opts || {};
    const inUse = choicesInUse(goal);
    return (CHOICES[goal.skill] || []).map(c => {
      if (c.options) {
        const mine = c.options.find(o => o.id === set[c.id]) || c.options[0];
        return `<label class="check" title="${esc(c.tip)}">${esc(c.label)} <select class="input small" data-gopt="opt" data-opt="${c.id}" aria-label="${esc(c.label)}">${c.options.map(o =>
          `<option value="${o.id}"${o === mine ? ' selected' : ''}>${esc(o.name)}</option>`).join('')}</select></label>`;
      }
      if (c.unless && inUse.includes(c.unless)) return '';
      return `<label class="check" title="${esc(c.tip)}"><input type="checkbox" data-gopt="opt" data-opt="${c.id}" ${set[c.id] ? 'checked' : ''}> ${esc(c.label)}</label>`;
    }).join('');
  }

  // "Round up my supplies": the plan with what your bank leaves over used up too.
  const ROUND_UP_TIP = "Off, the plan uses your bank as it is. On, your supplies are rounded up: what your bank would leave over is used up too, " +
    "with whatever is missing for that collected. First for what your bank already makes, then for anything else that's one ingredient short " +
    '(best XP first; untick a row to leave it out). If you picked what to train with, that one is rounded up first. ' +
    'You see the XP your bank holds then, and what to collect for it.';
  // "Vials of water never hold it back: ..."
  const roundUpTip = key => (MINOR_TEXT[key] ? `${ROUND_UP_TIP} ${MINOR_TEXT[key]} it back: what you're short of is collected too.` : ROUND_UP_TIP);

  // The Magic XP of the spells cast on the way (enchanting, charging orbs), as a
  // tip under a plan. counts: [[method id, how many]]. A spell above your Magic
  // level says so: that part of the plan waits for it.
  function magicTip(ix, counts) {
    const mg = castsIn(ix, counts);
    if (!mg) return '';
    // Your Magic level. Off the hiscores (under level 15) only the most it can be is known.
    const cur = currentOf('magic');
    const most = !cur ? null : cur.ranked ? cur.level : cur.range ? cur.range.max : null;
    const youAre = cur && !cur.ranked && cur.range && cur.range.min < cur.range.max ? `you're ${most} at most` : `you're ${most}`;
    // (one line a spell: Lvl-1 Enchant makes rings of recoil and games necklaces alike)
    const spells = new Map();
    for (const [id, n] of Object.entries(mg.by)) { const m = ix.byId.get(id); spells.set(m.spell, { n: (spells.get(m.spell)?.n || 0) + n, level: m.magicLevel }); }
    const casts = [...spells].map(([spell, c]) => `${fmt(c.n)} × ${esc(spell)} ${most != null && most < c.level
      ? `<span class="c-lose">(needs Magic ${c.level}: ${youAre})</span>`
      : `<span class="c-faint">(Magic ${c.level})</span>`}`);
    // What it does to your Magic level, when you can cast all of it.
    const after = cur?.ranked && cur.level >= mg.level ? levelForXp10(Math.min(MAX_XP10, cur.xp10 + mg.xp10)) : 0;
    const title = `Not part of the XP above: it's what the spells cast on the way give.${after > (cur?.level || 0) ? ` On its own it takes your Magic from ${cur.level} to ${after}.` : ''}`;
    // (one span: a tip lays its children out in a row, which would set the commas apart)
    return `<div class="tip magic" title="${title}"><span>Magic XP on the way: <b class="c-xp">+${xpText(mg.xp10)} XP</b> from ${casts.join(', ')}</span></div>`;
  }

  // The Crafting XP of what a Magic plan makes on the way (the rings it then
  // enchants, the orbs it charges), as a tip under it: said, never counted.
  // counts: [[method id, how many]].
  function craftTip(ix, counts) {
    const by = new Map();
    for (const [id, n] of counts) {
      const m = ix.byId.get(id);
      if (m?.gives?.crafting && m.hp == null && n > 0) by.set(m, (by.get(m) || 0) + n);
    }
    if (!by.size) return '';
    const xp10 = [...by].reduce((a, [m, n]) => a + m.gives.crafting * n, 0);
    const cur = currentOf('crafting');
    const after = cur?.ranked ? levelForXp10(Math.min(MAX_XP10, cur.xp10 + xp10)) : 0;
    const title = `Not part of the XP above: it's what making these on the way gives your Crafting.${after > (cur?.level || 0) ? ` On its own it takes your Crafting from ${cur.level} to ${after}.` : ''}`;
    // (one span: a tip lays its children out in a row, which would set the commas apart)
    return `<div class="tip crafting" title="${esc(title)}"><span>Crafting XP on the way: <b class="c-xp">+${xpText(xp10)} XP</b> from ${[...by].map(([m, n]) => `${fmt(n)} × ${esc(m.name)}`).join(', ')}</span></div>`;
  }

  // What else a plan's kills give, under it: the XP that goes to the other
  // skills of the style and to Hitpoints (every point of damage gives those
  // too), and the bones they leave. counts: [[method id, how many]]. (v3.2: a
  // row for each skill with its icon, as a Slayer plan shows its kills' XP.)
  function killsTip(ix, counts) {
    const also = {}, bones = {};
    for (const [id, n] of counts) {
      const m = ix.byId.get(id);
      if (!m || m.hp == null || !(n > 0)) continue;
      for (const [k, x] of Object.entries(m.gives || {})) also[k] = (also[k] || 0) + x * n;
      if (m.bones) bones[m.bones] = (bones[m.bones] || 0) + n;
    }
    const list = parts => (parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] || '');
    const row = (k, x10, how, more) => `<div class="xp-row">${iconImg(SKILL_BY_KEY.get(k))}<div class="step-main"><b class="c-xp">+${xpText(x10)}</b> ${esc(SKILL_BY_KEY.get(k).name)} XP${how ? ` ${how}` : ''}${more ? ` <span class="c-faint">${more}</span>` : ''}</div></div>`;
    const rows = Object.entries(also).filter(([, x]) => x > 0).map(([k, x]) => {
      const cur = currentOf(k);
      const to = cur?.ranked ? levelForXp10(Math.min(MAX_XP10, cur.xp10 + x)) : 0;
      return row(k, x, '', to > (cur?.level || 0) ? `(level ${cur.level} → ${to})` : '');
    });
    const kinds = Object.entries(bones);
    const buried = kinds.reduce((a, [item, n]) => a + n * (BURY_XP[item] || 0), 0);
    if (kinds.length) {
      const cur = currentOf('prayer');
      const to = cur?.ranked ? levelForXp10(Math.min(MAX_XP10, cur.xp10 + buried)) : 0;
      rows.push(row('prayer', buried, 'if you bury them', `(${list(kinds.map(([item, n]) => `${fmt(n)} ${itemName(item)}, ${xpText(BURY_XP[item] || 0)} each`))}${to > (cur?.level || 0) ? `; level ${cur.level} → ${to}` : ''})`));
    }
    if (!rows.length) return '';
    const title = 'Not part of the XP above. Every point of damage gives 1.33 Hitpoints XP as well, whatever your style; Controlled and Longrange share theirs between skills. '
      + 'The server rounds each hit\'s XP down to a tenth, so at 1.33 a point many small hits come to a little less.';
    return `<div class="also-xp kills" title="${esc(title)}"><div class="also-title">Also from these kills</div><div class="steps">${rows.join('')}</div></div>`;
  }

  // With your supplies rounded up, each thing is one line: what your bank makes
  // of it together with what rounding up adds.
  function roundedSteps(fb, minor) {
    const lines = [], first = new Map();
    for (const s of fb.steps) {
      const to = s.rounded ? first.get(s.id) : undefined;
      if (to === undefined) {
        if (!first.has(s.id)) first.set(s.id, lines.length);
        lines.push({ ...s, sub: { ...s.sub }, made: { ...s.made }, collect: { ...(s.collect || {}) } });
        continue;
      }
      const t = lines[to];
      t.runs += s.runs; t.xp10 += s.xp10;
      for (const [k, n] of Object.entries(s.sub)) t.sub[k] = (t.sub[k] || 0) + n;
      for (const [k, n] of Object.entries(s.made || {})) t.made[k] = (t.made[k] || 0) + n;
      for (const [k, n] of Object.entries(s.collect || {})) t.collect[k] = (t.collect[k] || 0) + n;
    }
    for (const l of lines) l.collect = minorLast(l.collect, minor);
    return lines;
  }

  // "500 × Runite bar +25,000 XP": what was made on the way to a step.
  // What can burn says how many tries it took: "2,000 Raw shark cooked, about 272 burnt".
  // step: the step they were made for ({ id, runs }).
  const subsOf = (ix, sub, step) => Object.entries(sub || {}).map(([id, n]) => {
    const sm = ix.byId.get(id);
    if (sm.roll) {
      const burnt = n - (sm.of === step?.id ? step.runs : sub[sm.of] || 0);
      return burnt > 0 ? `${fmt(n)} ${itemName(Object.keys(sm.in)[0])} cooked, <span class="c-lose">about ${fmt(burnt)} burnt</span>` : '';
    }
    return `${fmt(n)} × ${esc(sm.name)}${sm.xp > 0 ? ` <span class="c-level">+${xpText(n * sm.xp)} XP</span>` : ''}`;
  }).filter(Boolean);
  // How often a row's cook fails at a level, with the goal's choices: null when
  // it can't. { burn (a share, 0 to 1), from (the level it stops at, or null) }
  const burnOf = (ix, m, level) => {
    const roll = m.tries && ix.byId.get(m.tries)?.roll;
    return roll ? { burn: 1 - chanceUnits(roll, Math.max(level, m.level)) / WHOLE, from: sureLevel(roll, m.level) } : null;
  };
  const pctText = share => (share <= 0 ? '0' : share < 0.01 ? 'under 1' : String(Math.round(share * 100)));
  // "14% burn", beside a row's name, while it still burns at your level
  function burnBadge(ix, m, level) {
    const b = burnOf(ix, m, level);
    if (!b || b.burn <= 0) return '';
    const at = Math.max(level, m.level);
    return ` <span class="burn" title="${esc(`About ${pctText(b.burn)} in 100 burn at level ${at}${b.from ? `; none from level ${b.from}` : '; some always will'}. Plans count them.`)}">${pctText(b.burn)}% burn</span>`;
  }
  function bankHtml(goal, plan, ix) {
    const fb = plan.fromBank;
    const rounded = !!plan.bankNow;             // Round up my supplies is on
    if (!fb.steps.length) {
      // (spells your runes could cast, waiting to be asked for: say how. One you've
      // picked that's above your level waits too; what gets you there takes the runes.)
      const waiting = textFor(goal.skill).idle && plan.table.some(r => r.have > 0 && !r.locked && ix.byId.get(r.id).asked);
      const picked = goal.fillId && ix.byId.get(goal.fillId);
      if (waiting && picked?.asked && plan.fill?.locked) {
        return `<div class="plan-sec"><h4>From your bank${rounded ? ', supplies rounded up' : ''}</h4><div class="c-faint small-note">${esc(picked.name)} takes level ${picked.level}.
          Until then your bank's runes go to what gets you there: they're taken off what's listed to collect below.</div></div>`;
      }
      if (waiting && !picked) {
        return `<div class="plan-sec"><h4>From your bank${rounded ? ', supplies rounded up' : ''}</h4><div class="c-faint small-note">Nothing in your bank is used by itself yet.
          ${esc(textFor(goal.skill).idle)}</div></div>`;
      }
      return `<div class="plan-sec"><h4>From your bank${rounded ? ', supplies rounded up' : ''}</h4><div class="c-faint small-note">Nothing in your bank makes ${esc(SKILL_BY_KEY.get(goal.skill).name)} XP at your level yet.
        Add ${textFor(goal.skill).bankHint} in the <button type="button" class="linkish" data-act="to-bank" data-skill="${goal.skill}">Bank</button> tab.</div>${unidNote(goal)}</div>`;
    }
    const steps = rounded ? roundedSteps(fb, minorOf(goal.skill)) : fb.steps;
    // Where the goal is reached. Rounded up, the lines are counted in the order shown.
    let goalAt = rounded ? null : fb.goalReached;
    if (rounded && fb.goalReached) {
      let left = plan.toGo;
      steps.some((s, i) => {
        if (s.xp10 >= left) { goalAt = { index: i, runs: Math.max(1, Math.ceil(left / (s.xp10 / s.runs))) }; return true; }
        left -= s.xp10;
        return false;
      });
    }
    // The lines can be dragged into an order of your own (with two or more things to order).
    const lineIds = [...new Set(steps.map(s => s.id))];
    const movable = lineIds.length > 1;
    const rows = steps.map((s, i) => {
      const m = ix.byId.get(s.id);
      const subs = subsOf(ix, s.sub, s);
      const goalHere = goalAt && goalAt.index === i
        ? `<span class="goal-flag" title="Your goal is reached during this step">Goal after ${fmt(goalAt.runs)}</span>` : '';
      const collect = s.collect && Object.keys(s.collect).length
        ? `<div class="c-faint small-note round-note">collect ${itemList(s.collect, { small: true, named: true, priced: false })}</div>` : '';
      return `<div class="step" data-step="${s.id}">${movable ? '<span class="grip" aria-hidden="true"></span>' : ''}${methodIcon(m)}<div class="step-main">
          <div>${actionText(m, s.runs, s.made)} <span class="c-level">+${xpText(s.xp10)} XP</span>${worthText(s.made)} ${goalHere}</div>
          ${subs.length ? `<div class="c-faint small-note">incl. ${subs.join(', ')}</div>` : ''}
          ${collect}
        </div></div>`;
    }).join('');
    const toCollect = rounded && Object.keys(fb.collect || {}).length ? fb.collect : null;
    const roundCost = toCollect ? bankValue(toCollect, prices.priceOf) : null;
    const fee = fb.paid ? bankValue(fb.paid, prices.priceOf) : null;            // the tanner's
    const one = Object.keys(fb.assumed).length === 1;
    const assumed = Object.keys(fb.assumed).length
      ? `<div class="tip">Also uses ${itemList(fb.assumed, { small: true, named: true, priced: false })} that ${one ? "isn't" : "aren't"} in your bank: you'll buy ${one ? 'it' : 'them'} as you go.</div>` : '';
    // What it all makes is worth (each step shows its own part). Your banked
    // supplies are yours already, so that's the gross; what was collected to
    // round up, and fees paid on the way, come off for the net.
    const made = {};
    for (const s of fb.steps) for (const [item, n] of Object.entries(s.made || {})) made[item] = (made[item] || 0) + n;
    const worth = bankValue(made, prices.priceOf);
    const known = !worth.missing.length && !(roundCost && roundCost.missing.length);
    const net = worth.total - (roundCost ? roundCost.total : 0) - (fee ? fee.total : 0);
    const place = placeOf(goal);
    const money = !Object.keys(made).length ? '' : `<div class="money">
      <span>Gross: <b class="c-win">${worth.missing.length ? '?' : `+${gpShort(worth.total)}`}</b> gp</span>
      ${toCollect ? `<span>Rounding up your supplies: <b>${roundCost.missing.length ? '?' : gpShort(roundCost.total)}</b> gp</span>` : ''}
      ${fee ? `<span title="${esc(place ? `${place.name}: ${place.note}` : '')}">${esc(PLACES[goal.skill]?.label || 'Fees')}${place ? ` (${esc(place.name)})` : ''}: <b>${gpShort(fee.total)}</b> gp</span>` : ''}
      ${!toCollect && !fee ? '' : known ? `<span>Net: <b class="${net >= 0 ? 'c-win' : 'c-lose'}">${signed(net)}</b> gp</span>` : ''}
      <span class="c-faint">${known ? '(your banked supplies are already yours)' : '(some prices are still unknown)'}</span>
    </div>`;
    const reach = fb.goalReached ? `<span class="c-win">That reaches your goal.</span>` : '';
    const onTheWay = fb.steps.flatMap(s => [[s.id, s.runs], ...Object.entries(s.sub)]);
    const magic = magicTip(ix, onTheWay) + craftTip(ix, onTheWay);
    const collectLine = !rounded ? '' : toCollect
      ? `<div class="collect"><span class="c-muted">To round up your supplies, collect:</span> ${itemList(toCollect)}</div>`
      : `<div class="c-faint small-note">Nothing to collect: your bank leaves nothing over.</div>`;
    return `<div class="plan-sec"><h4>From your bank${rounded ? ', supplies rounded up' : ''} <span class="c-level">+${xpText(fb.xp10)} XP</span> <span class="c-faint">→ level ${fb.endLevel}</span> ${reach}</h4>
      <div class="steps${movable ? ' movable' : ''}">${rows}</div>${orderHtml(goal, plan, ix, lineIds)}${collectLine}${money}${magic}${assumed}${unidNote(goal)}</div>`;
  }

  // Under the bank plan's lines: that they can be dragged, your own order once
  // you have one (and the way back), and what else your bank could make: things
  // the lines above leave nothing for. Clicking one puts it first.
  function orderHtml(goal, plan, ix, lineIds) {
    const fb = plan.fromBank;
    const own = Array.isArray(goal.order) && goal.order.some(id => lineIds.includes(id));
    const excluded = new Set(goal.excluded || []);
    const others = plan.table.filter(r => r.have > 0 && r.level <= fb.endLevel && !lineIds.includes(r.id) && !excluded.has(r.id));
    if (lineIds.length < 2 && !own && !others.length) return '';
    const open = S.more.has(goal.id) && others.length > 0;
    const note = own ? `In your own order: your bank goes to the top line first, then down the list. <button type="button" class="linkish" data-act="order-reset">Back to the usual order</button>`
      : lineIds.length > 1 ? 'Drag a line up or down to change what your bank is used for first.' : '';
    const more = others.length ? `<button type="button" class="linkish" data-act="order-more" aria-expanded="${open}" title="Things your bank could make with the supplies the lines above use">${others.length} more your bank could make instead ${open ? '▾' : '▸'}</button>` : '';
    const chips = !open ? '' : `<div class="order-more"><span class="c-faint small-note">Click one to put it first:</span>${others.map(r => {
      const m = ix.byId.get(r.id);
      return `<button type="button" class="chip" data-first="${m.id}" title="${esc(`Your bank could make ${count(m, r.have)} on its own. Click to use your bank for it first.`)}">${methodIcon(m, true)} ${esc(m.name)} <span class="c-faint">${fmt(r.have)}</span></button>`;
    }).join('')}</div>`;
    return `<div class="c-faint small-note order-note">${[note, more].filter(Boolean).join(' <span class="c-faint">·</span> ')}</div>${chips}`;
  }

  // With your bank left out: a mix you plan yourself, typed into the table's
  // Plan to make column. Made lowest level first, everything bought.
  function mixHtml(goal, plan, ix, pool = null) {
    const mx = plan.fromMix;
    const priced = PRICED[goal.skill];
    if (!mx) {
      return `<div class="plan-sec"><h4>Your mix</h4><div class="c-faint small-note">${textFor(goal.skill).kills
        ? 'Plan a mix of monsters: type how many of each you\'ll kill in the table\'s <b>Plan to kill</b> column below.'
        : 'Plan a mix of ways to train: type how many of each you\'ll make in the table\'s <b>Plan to make</b> column below.'} Their XP counts toward your goal, and the rest is planned after them.</div></div>`;
    }
    const gp = g => (g.missing.length ? '<span class="c-faint">?</span>' : `<b class="${g.total >= 0 ? 'c-win' : 'c-lose'}">${signed(g.total)}</b>`);
    const rows = mx.steps.map(st => {
      const m = ix.byId.get(st.id);
      const lock = st.locked ? ` <span class="c-lose small-note" title="Made in level order, you'd only be level ${st.levelAt} when you get to these">needs level ${m.level}</span>` : '';
      const subs = subsOf(ix, st.sub, st);
      return `<div class="step">${methodIcon(m)}<div class="step-main">
          <div>${actionText(m, st.runs, st.made)} <span class="c-level">+${xpText(st.xp10)} XP</span>${priced ? ` <span class="c-faint">·</span> net ${gp(st.gain)} gp` : ''}${lock}${textFor(goal.skill).kills ? npc().planLootButton(goal, st.id, st.runs) : ''}</div>
          ${subs.length ? `<div class="c-faint small-note">incl. ${subs.join(', ')}</div>` : ''}
        </div></div>`;
    }).join('');
    const g = mx.gain;
    const buys = Object.values(mx.buy).some(n => n > 0);
    const money = !priced ? '' : `<div class="money">
      ${buys ? `<span>Buying it all: <b>${g.missing.length ? '?' : gpShort(g.cost)}</b> gp</span>` : ''}
      <span>${textFor(goal.skill).worth || 'What you make is worth'}: <b>${g.missing.length ? '?' : gpShort(g.value)}</b> gp</span>
      <span>Net: ${gp(g)} gp</span>
    </div>`;
    // (not when tickets in it count at the average of a batch the plan still has to fill: see thenHtml)
    const reach = mx.reached && !plan.fill ? `<span class="c-win">That reaches your goal.</span>` : '';
    return `<div class="plan-sec"><h4>Your mix <span class="c-level">+${xpText(mx.xp10)} XP</span> <span class="c-faint">→ level ${mx.endLevel}</span> ${reach}
        <button type="button" class="linkish small-note" data-act="mix-clear">Clear the mix</button></h4>
      <div class="steps">${rows}</div>
      ${buys ? `<div class="collect"><span class="c-muted">To collect or buy:</span> ${itemList(mx.buy)}</div>` : ''}
      ${money}${magicTip(ix, mx.steps.flatMap(st => Object.entries(st.casts || {})))}${killsTip(ix, mx.steps.map(st => [st.id, st.runs]))}${plan.fill && TICKETS.has(plan.fill.id) ? '' : ticketTip(goal, plan, pool)}</div>`;
  }

  function thenHtml(goal, plan, ix, pool = null) {
    if (!plan.fill) return '';
    const f = plan.fill;
    const bankShown = usesBank(goal.skill) && goal.useBank !== false;
    const choices = ix.train.filter(m => !(goal.excluded || []).includes(m.id));
    const kills = !!textFor(goal.skill).kills;
    // (a monster: its combat level, its hitpoints and the XP of a kill)
    const optText = m => (kills ? `${esc(m.short)} (level ${m.cb}, ${fmt(m.hp)} HP, ${xpText(xpEach(ix, m))} XP)`
      : `${esc(m.name)} (lvl ${m.level}, ${xpText(xpEach(ix, m))} XP${m.unit ? ` per ${esc(m.unit)}` : ''})`);
    const sel = `<select class="input small" data-gopt="fill" aria-label="Train with">${groupsOf(choices).map(([name, list]) =>
      `<optgroup label="${esc(name)}">${list.map(m => `<option value="${m.id}"${m.id === f.id ? ' selected' : ''}>${optText(m)}</option>`).join('')}</optgroup>`).join('')}</select>`;
    // (no monster picked yet: say how this one was come by)
    const cb = kills && (!ix.byId.has(goal.fillId) || (goal.excluded || []).includes(goal.fillId)) ? combatReal()?.min : null;
    const usual = cb == null ? '' : ` <span class="c-faint small-note">Not your pick yet: the most XP a kill among monsters no more than half your combat level (${cb}). Pick yours here, or find it in the table below.</span>`;
    // "First 1,234 × Willow logs to reach level 45", "Then …"
    const segs = f.segments.map((s, i) => {
      const m = ix.byId.get(s.id);
      const lead = f.segments.length > 1 ? (i === 0 ? 'First ' : 'Then ') : '';
      // (your own bars, made on the way: their XP is part of the stretch's)
      const subs = subsOf(ix, s.sub, s);
      return `<div class="step">${methodIcon(m)}<div class="step-main"><div>${lead}${actionText(m, s.runs, s.made)} <span class="c-level">+${xpText(s.xp10)} XP</span>${s.bridge && s.toLevel ? ` <span class="c-faint">to reach level ${s.toLevel}</span>` : ''}${kills ? npc().planLootButton(goal, s.id, s.runs) : ''}</div>
        ${subs.length ? `<div class="c-faint small-note">incl. ${subs.join(', ')}</div>` : ''}</div></div>`;
    }).join('');
    // Money: buying what's missing, and what the made items are worth.
    const made = {};
    for (const s of f.segments) for (const [item, n] of Object.entries(s.made)) made[item] = (made[item] || 0) + n;
    const worth = bankValue(made, prices.priceOf);
    const buys = Object.values(f.buy).some(n => n > 0), makes = Object.values(made).some(n => n > 0);
    const known = !f.costMissing.length && !worth.missing.length;
    // (nothing bought and nothing made, an Agility course: no money to speak of)
    const money = !buys && !makes ? '' : `<div class="money">
      ${buys ? `<span>Buying it all: <b>${f.costMissing.length ? '?' : gpShort(f.cost)}</b> gp</span>` : ''}
      ${makes ? `<span>${textFor(goal.skill).worth || 'What you make is worth'}: <b>${worth.missing.length ? '?' : gpShort(worth.total)}</b> gp</span>` : ''}
      ${buys && makes ? (known ? `<span>Net: <b class="${worth.total - f.cost >= 0 ? 'c-win' : 'c-lose'}">${worth.total - f.cost >= 0 ? '+' : ''}${gpShort(worth.total - f.cost)}</b> gp</span>` : `<span class="c-faint">(some prices are still unknown)</span>`) : ''}
      ${plan.fromMix && known && !plan.fromMix.gain.missing.length ? `<span>With your mix: <b class="${worth.total - f.cost + plan.fromMix.gain.total >= 0 ? 'c-win' : 'c-lose'}">${signed(worth.total - f.cost + plan.fromMix.gain.total)}</b> gp</span>` : ''}
    </div>`;
    // Tools the chosen method needs (never used up)
    const tools = [...new Set(f.segments.flatMap(s => ix.byId.get(s.id).tools || []))];
    const toolLine = tools.length ? `<div class="collect"><span class="c-muted">Also bring:</span> ${tools.map(t => `<a class="it-chip mk" ${priceLink(t)} title="See its price on the Prices tab">${itemIcon(t, true)} ${itemName(t)}</a>`).join('')}</div>` : '';
    // What else the chosen method takes (a Magic level to enchant with)
    const notes = [...new Set(f.segments.map(s => ix.byId.get(s.id).note).filter(Boolean))];
    const noteLine = notes.map(n => `<div class="c-faint small-note">${esc(n)}</div>`).join('');
    const row = plan.table.find(r => r.id === f.id);
    const fm = ix.byId.get(f.id);
    // A method counted in what it uses says what comes out: "6,000 Iron arrows instead of 3,000"
    const each = fm.unit ? Object.values(fm.out)[0] : 1;
    // (only while the plan makes of it what it would on its own: in an order of your
    // own something above it may take the snape grass first, and the tip would promise too much)
    // (nor for a spell that takes only runes, once the bank plan above has spent the runes it would go by)
    const spoken = !!row?.balance && Object.keys(fm.in).every(k => /rune$/.test(k))
      && Object.entries(fm.in).some(([k, q]) => plan.fromBank.leftover.have(k) + (row.balance.collect[k] || 0) < row.balance.runs * q);
    const balance = row?.balance && bankShown && !plan.bankNow && row.fromPlan >= row.have && !spoken
      ? `<div class="tip">Tip: collect ${itemList(row.balance.collect, { small: true, named: true })} and your bank makes <b>${fmt(row.balance.runs * each)}</b> ${esc(fm.unit ? plural(ITEMS[methodItem(fm)]?.name || fm.name, 2) : fm.name)} instead of ${fmt(row.have * each)}.</div>` : '';
    // (nothing left by the XP so far, and still some to add: the tickets before these count at the average of a batch these complete)
    const head = plan.remaining > 0 ? `${bankShown || plan.fromMix ? 'Then, to' : 'To'} reach your goal: <span class="c-xp">${xpText(plan.remaining)} XP</span>` : 'Then, to fill the batch';
    return `<div class="plan-sec"><h4>${head}</h4>
      <div class="bar wrap"><span class="c-muted">Train with</span> ${sel}${usual}</div>
      <div class="steps">${segs}</div>
      ${buys ? `<div class="collect"><span class="c-muted">To collect or buy:</span> ${itemList(f.buy)}</div>` : ''}
      ${toolLine}${noteLine}${money}${magicTip(ix, Object.entries(f.steps))}${craftTip(ix, Object.entries(f.steps))}${killsTip(ix, f.segments.map(sg => [sg.id, sg.runs]))}${TICKETS.has(f.id) ? ticketTip(goal, plan, pool) : ''}${balance}</div>`;
  }

  // ── Ranged ammo (v3.4) ──────────────────────────────────────────────────
  // A Ranged goal's ammo (ranged.js has the server's sums): what you shoot with (goal.ammo: kind, ammo, bow;
  // what isn't kept is the best your Ranged level can use now), Accurate or Rapid (fight; Longrange when the
  // goal's style is), whether you pick up what drops (pickUp), and your armour's Ranged attack bonus (bonus).
  function ammoOf(goal) {
    const a = goal.ammo || {};
    const level = currentOf('ranged')?.level || 1;
    const kind = AMMO_KINDS.includes(a.kind) ? a.kind : 'arrows';
    let gear;
    if (kind === 'arrows') {
      const bow = RANGED_GEAR.bows.some(b => b.id === a.bow) ? a.bow : bestGear('arrows', level).bow;
      gear = gearOf({ kind, bow, ammo: RANGED_GEAR.arrows.some(x => x.id === a.ammo) ? a.ammo : bestArrowsFor(bow) });
    } else {
      gear = gearOf({ kind, ammo: RANGED_GEAR[kind].some(x => x.id === a.ammo) ? a.ammo : bestGear(kind, level).ammo });
    }
    const style = goal.opts?.style === 'longrange' ? 'longrange' : a.fight === 'accurate' ? 'accurate' : 'rapid';
    return { gear, level, style, pickUp: a.pickUp !== false, bonus: Number.isFinite(a.bonus) ? a.bonus : 0 };
  }
  // A Ranged row's monster, with what its defence roll is made of (npcdata.js: its stats and bonuses).
  function rangedMon(m) {
    const id = m.id.replace(/^rg_/, ''), info = NPC_INFO[id];
    return info ? { id, hp: m.hp, defence: info.stats[2], rangeDefence: info.bonus?.rangedefence ?? 0, name: m.short } : null;
  }
  // "Rune arrows", "Rune knives"
  const ammoName = (slug, n = 2) => { const name = ITEMS[slug]?.name || slug; return n === 1 ? name : `${name.replace(/knife$/i, 'knive')}s`; };
  const shotsText = v => (v >= 100 ? fmt(Math.round(v)) : v.toFixed(1));
  const STYLE_NAME = { rapid: 'Rapid', accurate: 'Accurate', longrange: 'Longrange' };

  function ammoHtml(goal, plan, ix, cur) {
    const A = ammoOf(goal), { gear, style, pickUp, bonus, level } = A;
    // The plan's kills in the order they're done: your mix, then the rest; a monster's in a row as one line.
    const steps = [];
    for (const st of [...(plan.fromMix?.steps || []), ...(plan.fill?.segments || [])]) {
      const m = ix.byId.get(st.id), mon = m && st.runs > 0 ? rangedMon(m) : null;
      if (mon) steps.push({ m, mon, kills: st.runs, xp10: xpEach(ix, m) });
    }
    const r = steps.length ? shotsFor(steps, { startXp10: cur?.xp10 ?? 0, style, gear, bonus }) : { shots: 0, steps: [] };
    const lines = [];
    steps.forEach((s, i) => {
      const got = r.steps[i], prev = lines[lines.length - 1];
      if (prev && prev.m === s.m) Object.assign(prev, { kills: prev.kills + s.kills, shots: prev.shots + got.shots, last: got.last, to: got.to });
      else lines.push({ m: s.m, mon: s.mon, kills: s.kills, ...got });
    });
    const opt = (v, label, on) => `<option value="${esc(v)}"${on ? ' selected' : ''}>${esc(label)}</option>`;
    const kinds = [['arrows', 'Arrows'], ['knives', 'Knives'], ['darts', 'Darts']];
    const list = gear.kind === 'arrows' ? RANGED_GEAR.arrows : RANGED_GEAR[gear.kind];
    const ammoLabel = x => (gear.kind === 'arrows'
      ? `${ammoName(x.id)} (${x.strength} strength${x.bow > 1 ? `, a bow for Ranged ${x.bow}` : ''})`
      : `${ammoName(x.id)} (+${x.attack} attack, ${x.strength} strength${x.level > 1 ? `, Ranged ${x.level}` : ''})`);
    const picks = `<div class="bar wrap ammo-pick">
        <select class="input small" data-ammo="kind" aria-label="What you shoot">${kinds.map(([v, l]) => opt(v, l, v === gear.kind)).join('')}</select>
        <select class="input small" data-ammo="ammo" aria-label="Which">${list.map(x => opt(x.id, ammoLabel(x), x.id === gear.ammo)).join('')}</select>
        ${gear.kind === 'arrows' ? `<span class="c-muted">from a</span> <select class="input small" data-ammo="bow" aria-label="Your bow">${RANGED_GEAR.bows.map(b => opt(b.id, `${ITEMS[b.id]?.name || b.id} (+${b.attack} attack${b.level > 1 ? `, Ranged ${b.level}` : ''})`, b.id === gear.bow)).join('')}</select>` : ''}
        ${style === 'longrange' ? '<span class="c-faint small-note">on Longrange, the goal\'s style</span>'
          : `<select class="input small" data-ammo="fight" aria-label="Accurate or Rapid" title="Accurate adds 3 to your effective Ranged: you hit a little more often and a little harder. Rapid shoots a tick sooner. Both give the same XP.">${opt('rapid', 'Rapid', style === 'rapid')}${opt('accurate', 'Accurate', style === 'accurate')}</select>`}
        <label class="check" title="${esc(`A shot that doesn't break drops where the monster stands. Ticked, you pick those up and only the 1 in ${BREAKS} that break are used up; unticked, every shot's ammo is.`)}"><input type="checkbox" data-ammo="pickUp"${pickUp ? ' checked' : ''}> Pick up what drops</label>
        <label class="check" title="What the rest of what you wear adds to your Ranged attack: a green dragonhide body, chaps and vambraces +31, a coif +2. It makes you hit more often; nothing but your ammo adds to how hard."><span>Armour's Ranged attack</span>
          <input class="input small num ammo-bonus" data-ammo="bonus" inputmode="numeric" value="${bonus ? esc(String(bonus)) : ''}" placeholder="0" aria-label="Your armour's Ranged attack bonus"></label>
      </div>`;
    const warn = [];
    const wields = gear.kind === 'arrows' ? `${aWord(ITEMS[gear.bow]?.name || '')} ${(ITEMS[gear.bow]?.name || '').toLowerCase()}` : ammoName(gear.ammo).toLowerCase();
    if (gear.level > level) warn.push(`${cap(wields)} ${gear.kind === 'arrows' ? 'needs' : 'need'} Ranged ${gear.level} to wield: your Ranged is ${level}. It's counted as if you could.`);
    if (!gear.fits) warn.push(`${ammoName(gear.ammo)} are only fired from a bow for Ranged ${gear.needBow} or more (${orList(RANGED_GEAR.bows.filter(b => b.level >= gear.needBow && !b.long).map(b => (ITEMS[b.id]?.name || b.id).replace(/ shortbow$/i, '').toLowerCase()))} bows): ${aWord(ITEMS[gear.bow]?.name || '')} ${(ITEMS[gear.bow]?.name || '').toLowerCase()} can't fire them.`);
    const never = lines.filter(l => l.shots === Infinity);
    for (const l of never) warn.push(`Ranged does a ${esc(l.mon.name)} no damage${RANGED_GEAR.capped?.[l.mon.id] === 0 ? ' (the server caps what a hit does to it at 0)' : ''}: its kills can't be shot.`);
    if (!steps.length) {
      return `<div class="plan-sec ammo"><h4>Ammo</h4>${picks}<div class="c-faint small-note">No kills to shoot yet.</div></div>`;
    }
    const icon = itemIcon(gear.ammo, true);
    const rows = lines.map(l => {
      // (levels gained on the way: what a kill takes at the last of them, or the levels, when it takes as many)
      const per = l.shots === Infinity ? '' : `${shotsText(l.first)} a kill at Ranged ${l.from}${l.to > l.from ? (shotsText(l.last) !== shotsText(l.first) ? `, ${shotsText(l.last)} by ${l.to}` : ` to ${l.to}`) : ''}`;
      return `<div class="step">${icon}<div class="step-main"><div>${fmt(Math.ceil(l.kills))} × ${esc(l.m.short)}: ${l.shots === Infinity ? '<span class="c-lose">can\'t be shot</span>' : `<b>${fmt(Math.ceil(l.shots))}</b> shots <span class="c-faint">(${per})</span>`}</div></div></div>`;
    }).join('');
    const total = r.shots === Infinity ? null : Math.ceil(r.shots);
    const lost = total == null ? null : Math.ceil(ammoLost(r.shots, pickUp));
    const p = prices.gp(gear.ammo);
    const money = total == null ? '' : `<div class="money">
        <span>Fired: <a class="it-chip mk" ${priceLink(gear.ammo)} title="See its price on the Prices tab">${icon} <b>${fmt(total)}</b> ${ammoName(gear.ammo, total)}</a></span>
        <span>${pickUp ? `Lost: about <b>${fmt(lost)}</b> <span class="c-faint">(1 in ${BREAKS} breaks; you pick up the rest)</span>` : `Lost: all <b>${fmt(lost)}</b> <span class="c-faint">(not picked up)</span>`}</span>
        <span>They cost: <b>${p == null ? '?' : gpShort(lost * p)}</b> gp${p == null ? '' : ` <span class="c-faint">(${gpShort(p)} each)</span>`}</span>
      </div>`;
    // The server's numbers for the monster most of the shots go to, at your Ranged level now
    const main = lines.filter(l => l.shots !== Infinity).sort((x, y) => y.shots - x.shots)[0];
    let tip = '';
    if (main) {
      const k = killAt(main.mon, Math.min(main.from, 99), { style, gear, bonus });
      const with_ = gear.kind === 'arrows' ? `${ammoName(gear.ammo).toLowerCase()} from ${aWord(ITEMS[gear.bow]?.name || '')} ${(ITEMS[gear.bow]?.name || '').toLowerCase()}` : ammoName(gear.ammo).toLowerCase();
      tip = `<div class="tip"><span>${esc(main.m.short)} (Defence ${main.mon.defence}${main.mon.rangeDefence ? `, ranged defence ${main.mon.rangeDefence > 0 ? '+' : ''}${main.mon.rangeDefence}` : ''}), at Ranged ${main.from} on ${STYLE_NAME[style]} with ${with_}${bonus ? ` and ${bonus > 0 ? '+' : ''}${bonus} from your armour` : ''}: <b>${Math.round(k.hit * 1000) / 10}%</b> of shots hit (your roll of 0 to ${fmt(k.attack)} has to beat its 0 to ${fmt(k.defence)}), and a hit does 0 to <b>${k.max}</b>. Every shot uses its ammo, hit or miss.</span></div>`;
    }
    return `<div class="plan-sec ammo"><h4>Ammo <span class="c-faint small-note">(one a shot, hit or miss, as the server counts them)</span></h4>
      ${picks}${warn.map(w => `<div class="c-lose small-note ammo-warn">${w}</div>`).join('')}
      <div class="steps">${rows}</div>${money}${tip}</div>`;
  }
  const aWord = name => (/^[aeiou]/i.test(name) ? 'an' : 'a');
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  const orList = list => (list.length > 1 ? `${list.slice(0, -1).join(', ')} or ${list[list.length - 1]}` : list[0] || '');

  // (v3.4) The Shots column of a Ranged goal's table: [header, cell, sort]. A monster Ranged does no damage
  // to is a dash.
  function shotsColumn(goal) {
    const A = ammoOf(goal), seen = new Map();
    const shotsOf = m => {
      if (!seen.has(m.id)) { const mon = rangedMon(m); seen.set(m.id, mon ? killAt(mon, A.level, A).shots : null); }
      return seen.get(m.id);
    };
    const head = `<th title="${esc(`Shots a kill on average at your Ranged level now (${A.level}), with ${ammoName(A.gear.ammo).toLowerCase()} on ${STYLE_NAME[A.style]}, as the server rolls each shot. Each uses one piece of ammo, hit or miss.`)}">Shots</th>`;
    const cell = (r, m) => {
      const v = shotsOf(m);
      return `<td>${v == null ? '–' : v === Infinity ? '<span class="c-faint" title="Ranged does it no damage">–</span>' : shotsText(v)}</td>`;
    };
    return [head, cell, { key: 'shots', value: (r, m) => { const v = shotsOf(m); return v === Infinity ? null : v; } }];
  }

  // What a plan's Agility Arena tickets are exchanged for, under the part of the
  // plan that has them. In the biggest batches (pool): how they're exchanged and
  // what that comes to a ticket. Pinned to a batch: its rate, and what the plan
  // has that doesn't fill one.
  function ticketTip(goal, plan, pool) {
    const count = [...(plan.fromMix?.steps || []), ...(plan.fill?.segments || [])].filter(st => TICKETS.has(st.id)).reduce((a, st) => a + st.runs, 0);
    if (!count) return '';
    const icon = itemIcon(METHODS.find(m => TICKETS.has(m.id)).icon, true);
    const pin = (CHOICES[goal.skill] || []).flatMap(c => c.options || []).find(o => choicesInUse(goal).includes(o.id));
    if (pool) {
      if (!pool.counted) return '';
      const how = pool.batches.map(([size, n]) => (size === 1 ? `${fmt(n)} on ${n === 1 ? 'its' : 'their'} own` : `${fmt(n)} × ${fmt(size)}`));
      const text = how.length > 1 ? `${how.slice(0, -1).join(', ')} and ${how[how.length - 1]}` : how[0];
      // (a whole batch can be a good deal more than the goal asked for)
      const spare = pool.spare > 2 * pool.each ? ` That's <b>${xpText(pool.spare)} XP</b> more than your goal needs: the batch has to be whole.` : '';
      const said = pool.tickets === 1 ? `the one in this plan is exchanged on its own: <b>${xpText(pool.each)} XP</b>.`
        : `the <b>${fmt(pool.tickets)}</b> in this plan are exchanged together, as ${text}: <b>${xpText(pool.each)} XP</b> each${pool.batches.length > 1 ? ' on average' : ''}.`;
      // (one span: a tip lays its children out in a row, which would leave the icon on a line of its own)
      return `<div class="tip" title="${esc(CHOICES[goal.skill]?.[0]?.tip || '')}"><span>${icon} Arena tickets: ${said}${spare}</span></div>`;
    }
    if (!pin) return '';
    const size = Number(pin.id.slice(1)), over = count % size;
    const each = METHODS.find(m => TICKETS.has(m.id) && m.opt?.[pin.id]?.parts)?.opt[pin.id].parts[1][1];
    const short = !over ? '' : count < size ? ` This plan has <b>${fmt(count)}</b>: they give that once you've saved up ${fmt(size)}.`
      : ` This plan has <b>${fmt(count)}</b>: the last ${fmt(over)} give theirs with the next full ${fmt(size)}.`;
    return `<div class="tip" title="${esc(CHOICES[goal.skill]?.[0]?.tip || '')}"><span>${icon} Arena tickets: counted at <b>${xpText(each)} XP</b> each, as exchanged ${esc(pin.name.toLowerCase())}.${size > 1 ? short : ''}</span></div>`;
  }

  function unitNote(key, ix, mixed, { bankOn, even, assumed, mix, whatIf }) {
    const each = textFor(key).each;
    const units = [...new Set(ix.train.map(m => m.units || ''))];
    // (some rows counted in what they use: logs for arrows, bars for arrowtips; or in what they're for: the bar some ore makes)
    const [unit, many] = ix.train.filter(m => m.unit).map(m => [m.unit, m.units || m.unit + 's'])[0] || [];
    const counted = units.length === 1 && units[0] ? ` Counts are in ${units[0]}.` : mixed ? ` A row marked "per ${unit}" counts ${many}.` : '';
    if (textFor(key).kills) return `Lvl = combat level · HP = hitpoints: a kill is that much damage · XP = what a kill gives in the style you picked · To goal = kills of it alone · Plan to kill = your mix of monsters${mix ? ' · Still needed to goal = after your mix' : ''}.`;
    if (!usesBank(key)) return `To goal = how many on their own · Plan to make = your mix of ways to train${mix ? ' · Still needed to goal = after your mix' : ''}${PRICED[key] ? ` · Net/item is ${textFor(key).net || `what one ${each} sells for`}` : ''}.${mixed ? counted : ''}`;
    // (bars you make yourself: their XP is in the XP column and in every count)
    const own = (ix.through ? ` XP and counts include ${textFor(key).onTheWay || "what's made on the way"}.` : '')
      + (ix.byLevel ? ' Burnt food is counted: what a row takes allows for it at the level you are now. A plan counts it a level at a time, so it burns a little less than its row says.' : '');
    const left = (!assumed ? '' : ASSUME_ONE[key]
      ? ` ${assumed[0].toUpperCase() + assumed.slice(1)} is left out: you'll buy it as you go.`
      : ` ${assumed[0].toUpperCase() + assumed.slice(1)} are left out: you'll buy them as you go.`) + own;
    if (!bankOn) return `To goal = how many on their own, from your XP now · Plan to make = your mix of ways to train${mix ? ' · Still needed to goal = after your mix' : ''} · Net/item is per ${each}, bought from scratch.${counted}${left}`;
    // Round up my supplies is on
    if (whatIf) return `Round up my supplies is on: the plan above is your bank with its supplies rounded up · From bank, XP from bank and Gross from banked supplies = your bank as it is, before rounding up · Round up my supplies, XP and Net after rounding up my supplies = each on its own, rounded up · Still needed to goal and Supplies needed = after everything your bank makes, supplies rounded up · Total XP after supplies needed = all of that plus the ones still needed · Total net = what your bank plan makes of it rounded up, less what that takes to collect, + net after buying supplies · Net/item is per ${each}, bought from scratch.${counted}${left}`;
    return `From bank = what your bank makes of it now · XP from bank and Gross from banked supplies = what your bank plan makes of it, before rounding up${even ? ' · Round up my supplies = what to collect so nothing in your bank is left over · XP and Net after rounding up my supplies = what your bank makes of it then (the net: less what that takes to collect)' : ''} · Still needed to goal and Supplies needed = after everything your bank makes · Total XP after supplies needed = all your bank makes plus the ones still needed · Total net = gross from banked supplies + net after buying supplies · Net/item is per ${each}, bought from scratch.${counted}${left}`;
  }

  // A row's tooltip line about burning, with the goal's choices in use.
  function burnLine(ix, m, level) {
    const b = burnOf(ix, m, level);
    if (!b) return '';
    const at = Math.max(level, m.level);
    return b.burn > 0
      ? `\nAbout ${pctText(b.burn)} in 100 burn at level ${at}${b.from ? `; none from level ${b.from}` : '; some always will'}. What it needs allows for that.`
      : `\nNone burn at level ${at} (they stop at ${b.from}).`;
  }

  // A row's tooltip line about how often a try works (a pocket picked, a lock, a
  // shortcut you can slip on): every roll the server makes has to go your way.
  function oddsLine(m, level) {
    if (!m.odds) return '';
    const at = Math.max(level, m.level);
    const share = l => m.odds.reduce((a, roll) => a * (chanceUnits(roll, l) / WHOLE), 1);
    if (share(at) >= 1) return `\nNever fails at level ${at}.`;
    let sure = null;
    for (let l = at + 1; l <= MAX_LEVEL && sure == null; l++) if (share(l) >= 1) sure = l;
    return `\nWorks about ${pctText(share(at))} in 100 tries at level ${at}${sure ? `; every time from level ${sure}` : at < MAX_LEVEL ? `; ${pctText(share(MAX_LEVEL))} in 100 at level ${MAX_LEVEL}` : ''}.`;
  }

  // "Round up my supplies": what to collect so every ingredient in your bank gets used. Your
  // most plentiful one decides how many you could make (605 kwuarm and 518
  // limpwurt: collect 87 limpwurt, and the bank covers 605 instead of 518).
  const EVEN_TIP = 'Round up my supplies: what to collect so nothing in your bank is left over. Your most plentiful ingredient decides how many you could make.';
  // Only where something takes two or more things (not essence or logs on their own).
  const hasEven = ix => ix.train.some(m => Object.keys(m.in).length > 1);
  function evenTd(m, r) {
    const b = r.balance;
    if (!b) return '<td class="l even sep-l"><span class="c-faint">–</span></td>';
    const names = Object.entries(b.collect).filter(([, n]) => n > 0).map(([k, n]) => `${fmt(whole(n))} ${ITEMS[k]?.name || k}`);
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    const tip = `Collect ${list}, and your bank covers ${count(m, b.runs)} instead of ${fmt(r.have)}.`;
    return `<td class="l even sep-l" title="${esc(tip)}"><span class="even-in">${itemList(b.collect, { small: true })}</span> <span class="c-faint">→</span> <b class="c-level">${fmt(b.runs)}</b></td>`;
  }

  // A total in gp, or why there isn't one.
  function gainTd(g, tip, cls = '') {
    const td = cls ? `<td class="${cls}"` : '<td';
    if (!g) return `${td}><span class="c-faint">–</span></td>`;
    if (g.missing.length) return `${td} title="${esc(`No price yet for ${[...new Set(g.missing)].map(k => ITEMS[k]?.name || k).join(', ')}`)}"><span class="c-faint">?</span></td>`;
    return `${td} title="${esc(tip(g))}"><span class="${g.total >= 0 ? 'c-win' : 'c-lose'}">${g.total >= 0 ? '+' : ''}${gpShort(g.total)}</span></td>`;
  }
  const count = (m, n) => (m.unit ? `${fmt(n)} ${n === 1 ? m.unit : m.units || m.unit + 's'}` : `${fmt(n)} × ${m.name}`);
  const signed = n => `${n >= 0 ? '+' : ''}${gpShort(n)}`;

  // Columns: what each one gives (XP, net per item, gp per XP), then either
  // how many to the goal (your bank left out), or, with your bank in use, what
  // it makes of each, what rounds its supplies up, and what's still needed and to collect
  // after all of it, with the totals those come to.
  function tableHtml(goal, plan, ix, cur) {
    // The table can be hidden, plan by plan: it's long (a combat skill's has every monster).
    const tableName = textFor(goal.skill).kills ? 'Every monster' : 'Every option';
    if (S.tableOff.has(goal.id)) {
      return `<div class="plan-sec table-off"><h4>${tableName} <span class="c-faint">(the table is hidden)</span>
        <button type="button" class="linkish small-note" data-act="table-toggle" aria-expanded="false">Show table</button></h4></div>`;
    }
    const excluded = new Set(goal.excluded || []);
    const bankCols = usesBank(goal.skill);
    const bankOn = bankCols && goal.useBank !== false;
    const evenCol = bankOn && hasEven(ix);
    const whatIf = bankOn && !!plan.bankNow;          // Round up my supplies is on
    const assumed = goal.assume ?? DEFAULT_ASSUME[goal.skill] ?? [];
    let rows = plan.table.map(r => ({ r, m: ix.byId.get(r.id) }));
    // Hide unused items: the rows unticked under Use (or Chop, Fish, Fight…) are left out (one switch for every plan's table).
    const hidden = S.hideOff ? rows.filter(x => excluded.has(x.m.id)).length : 0;
    if (hidden) rows = rows.filter(x => !excluded.has(x.m.id));
    const priced = PRICED[goal.skill];
    // (a gp total, or nothing to sort by where it's a ? or a –)
    const gv = g => (!g || g.missing.length ? null : g.total);
    const mixed = new Set(ix.train.map(m => m.unit || '')).size > 1;
    const cur1 = cur?.level || 1;
    // (a skill trained on monsters: a row is one, with its combat level and hitpoints, and the table can be searched)
    const kills = !!textFor(goal.skill).kills;
    const skillName = SKILL_BY_KEY.get(goal.skill).name;
    // [header, cell] for each column, in order
    const columns = [
      // (v3.3: the third, how a click on the column's name sorts the table: PLAN_SORTS)
      kills ? ['<th title="Combat level">Lvl</th>', (r, m) => `<td>${m.cb}</td>`, { key: 'level', value: (r, m) => m.cb }]
        : ['<th>Lvl</th>', (r, m) => `<td>${m.level}</td>`, { key: 'level', value: (r, m) => m.level }],
      kills ? ['<th class="l">Monster</th>', (r, m) => `<td class="l"><span class="sk-cell">${esc(m.short)}${m.note ? ' <span class="catch" aria-hidden="true">*</span>' : ''}</span></td>`, { key: 'name', value: (r, m) => m.short }]
        : [`<th class="l">${textFor(goal.skill).what}</th>`, (r, m) => `<td class="l"><span class="sk-cell">${methodIcon(m, true)} ${esc(m.name)}${multipleBadge(m, Math.max(cur1, m.level))}${burnBadge(ix, m, cur1)}${mixed && m.unit ? ` <span class="per">per ${esc(m.unit)}</span>` : ''}</span></td>`, { key: 'name', value: (r, m) => m.name }],
      ...(kills ? [['<th title="Hitpoints: a kill is this much damage">HP</th>', (r, m) => `<td>${fmt(m.hp)}</td>`, { key: 'hp', desc: true, value: (r, m) => m.hp }]] : []),
      // (with your own bars made on the way, their XP is in it)
      [kills ? `<th title="${esc(skillName)} XP a kill, in the style you picked">XP</th>` : '<th>XP</th>', (r, m) => `<td>${xpText(r.xpAll ?? m.xp)}</td>`, { key: 'xp', desc: true, value: (r, m) => r.xpAll ?? m.xp }],
      // (v3.4) a Ranged goal's: the shots a kill takes at your Ranged level now, with the ammo picked under Ammo
      ...(goal.skill === 'ranged' ? [shotsColumn(goal)] : []),
      // (not where nothing has a price. Agility: nothing to sell and nothing to buy)
      ...(!priced ? [] : [['<th title="What one sells for, less what it takes, bought from scratch">Net/item</th>', r => {
        const e = r.econ;
        return `<td>${e.net == null ? '<span class="c-faint">?</span>' : `<span class="${e.net >= 0 ? 'c-win' : 'c-lose'}">${signed(e.net)}</span>`}</td>`;
      }, { key: 'netitem', desc: true, value: r => r.econ.net }],
      ['<th title="gp per XP: what each XP costs you (negative: you make money)">gp/XP</th>', r => {
        const e = r.econ;
        return `<td>${e.gpPerXp == null ? '<span class="c-faint">?</span>' : `<span class="${e.gpPerXp <= 0 ? 'c-win' : ''}">${gpShort(e.gpPerXp)}</span>`}</td>`;
      }, { key: 'cheap', value: r => r.econ.gpPerXp }]]),
    ];
    if (!bankOn) {
      const verb = kills ? 'kill' : 'make';
      columns.push([`<th title="${kills ? 'Kills of it alone, from your XP now' : 'How many on their own, from your XP now'}">To goal</th>`, r => `<td>${r.needed ? fmt(r.needed) : '–'}</td>`, { key: 'togoal', value: r => r.needed }]);
      columns.push([`<th class="wrap" title="Your mix: how many of each you plan to ${verb}. Their XP counts toward your goal, and the rest is planned after them.">Plan to<br>${verb}</th>`,
        (r, m) => `<td><input class="input small num mix-in" data-mix="${m.id}" inputmode="decimal" value="${r.planned ? fmt(r.planned) : ''}" placeholder="0" aria-label="How many ${esc(m.name)} you plan to ${verb}" title="How many you plan to ${verb}"></td>`]);
      if (plan.fromMix) columns.push(['<th class="wrap" title="How many more to reach your goal, after your mix">Still needed<br>to goal</th>', r => `<td>${r.toMake ? fmt(r.toMake) : '–'}</td>`, { key: 'still', value: r => r.toMake }]);
    } else {
      columns.push(['<th title="What your bank makes of it now">From bank</th>', r => `<td>${r.have ? `<span class="c-level">${fmt(r.have)}</span>` : '0'}</td>`, { key: 'have', desc: true, value: r => r.have || 0 }]);
      // The XP of each stage beside it: from your bank, after rounding up, and in all once the supplies needed are made.
      // (none: what a dash says, where there's something to say)
      const xpTd = (xp10, tip, cls = '', none = null) => {
        const title = xp10 > 0 ? tip() : none ? none() : '';
        return `<td${cls ? ` class="${cls}"` : ''}${title ? ` title="${esc(title)}"` : ''}>${xp10 > 0 ? `<span class="c-xp">+${xpText(xp10)}</span>` : '<span class="c-faint">–</span>'}</td>`;
      };
      // (what the bank plan as it is made on the way to each row, stage by stage, for that cell's tooltip;
      // and the other way round, via: a row that's made on the way to others, how many for each)
      const onTheWay = new Map(), via = new Map();
      for (const st of (plan.bankNow || plan.fromBank).steps) {
        const acc = onTheWay.get(st.id) || onTheWay.set(st.id, {}).get(st.id);
        for (const [id, n] of Object.entries(st.sub)) {
          acc[id] = (acc[id] || 0) + n;
          const to = via.get(id) || via.set(id, new Map()).get(id);
          to.set(st.id, (to.get(st.id) || 0) + n);
        }
      }
      const stages = id => Object.entries(onTheWay.get(id) || {}).map(([sub, n]) => [ix.byId.get(sub), n]).filter(([sm]) => sm && !sm.roll)
        .map(([sm, n]) => `${fmt(n)} × ${sm.name}${sm.xp > 0 ? ` (+${xpText(n * sm.xp)} XP)` : ''}`);
      // A stage's XP is in the row it was made for: 709 molten glass are 686 air
      // battlestaves' and 23 unpowered orbs', so the glass row's own cell is a dash
      // (the column adds up to From your bank's total). Its tooltip says where they went.
      const viaTip = (m, more) => {
        const uses = [...(via.get(m.id) || [])].filter(([id]) => ix.byId.get(id));
        if (!uses.length || m.roll) return '';
        const n = uses.reduce((a, [, k]) => a + k, 0);
        const each = uses.map(([id, k]) => `${fmt(k)} for ${ix.byId.get(id).name}`);
        const where = uses.length === 1 ? ` to ${ix.byId.get(uses[0][0]).name}` : ` (${each.slice(0, -1).join(', ')} and ${each[each.length - 1]})`;
        const xp = m.xp > 0 && !ix.byLevel ? `+${xpText(n * m.xp)} XP, ` : '';
        return `${more ? 'Another ' : ''}${fmt(n)} ${n === 1 ? 'is' : 'are'} made on the way${where}: ${xp}counted in ${uses.length === 1 ? "that row's" : "those rows'"} XP from bank.`;
      };
      columns.push(['<th class="wrap" title="The XP of what your bank plan makes of it as your bank is, what\'s made on the way included: its lines under From your bank, before any rounding up. What\'s made on the way to something else is counted in that row.">XP from<br>bank</th>',
        (r, m) => xpTd(r.xp.bank, () => {
          const made = stages(m.id), also = viaTip(m, true);
          return `Your bank plan makes ${count(m, r.fromNow)}: +${xpText(r.xp.bank)} XP${made.length ? `, with what's made on the way: ${made.join(', ')}` : ''}.${also ? ` ${also}` : ''}`;
        }, '', () => viaTip(m, false)), { key: 'xpbank', desc: true, value: r => r.xp.bank || 0 }]);
      // (a fee paid on the way, the tanner's, isn't part of a gross: it comes off in Total net)
      const fees = PLACES[goal.skill] ? `the ${PLACES[goal.skill].label.toLowerCase()}'s fee` : 'fees';
      // Gross from banked supplies is your bank as it is, with Round up my supplies on or off:
      // rounding up shows in the columns after it.
      columns.push([`<th class="wrap" title="Gross from your already banked supplies: what your bank plan makes of it as your bank is, before any rounding up. ${whatIf ? 'Round up my supplies leaves it as it is: rounding up shows in the columns after it.' : "It's the bank part of Total net."}">Gross from<br>banked supplies</th>`,
        (r, m) => gainTd(!r.gains.before ? null : { ...r.gains.before, total: r.gains.before.value },
          g => `Your bank plan makes ${count(m, r.fromNow)}${whatIf ? ' as your bank is, before rounding up' : ' (From your bank)'}: worth ${gpShort(g.value)}. Your banked supplies are yours already.${g.cost ? ` (${gpShort(g.cost)} for ${fees} comes off in Total net.)` : ''}`),
        { key: 'gross', desc: true, value: r => (r.gains.before && !r.gains.before.missing.length ? r.gains.before.value : null) }]);
      // Round up my supplies, and what your bank's supplies come to then (only
      // where something takes two or more things, like an unf potion and a
      // secondary). A line on each side sets them apart.
      if (evenCol) {
        columns.push([`<th class="l wrap sep-l" title="${esc(EVEN_TIP)}">Round up<br>my supplies</th>`, (r, m) => evenTd(m, r)]);
        columns.push(['<th class="wrap" title="The XP of what your bank makes of it on its own once its supplies are rounded up, what\'s made on the way included.">XP after rounding<br>up my supplies</th>',
          (r, m) => xpTd(r.xp.even, () => `${count(m, r.balance ? r.balance.runs : r.have)}${r.balance ? ', with your supplies rounded up' : ' (nothing to round up)'}: +${xpText(r.xp.even)} XP.`), { key: 'xpeven', desc: true, value: r => r.xp.even || 0 }]);
        columns.push(['<th class="wrap sep-r" title="What your bank makes of it once your supplies are rounded up is worth, less what rounding up takes to collect. Your banked supplies are yours already.">Net after rounding<br>up my supplies</th>',
          (r, m) => gainTd(r.gains.even, g => `${count(m, r.balance ? r.balance.runs : r.have)}: worth ${gpShort(g.value)}${g.cost ? `, less ${gpShort(g.cost)} ${r.balance && Object.keys(r.balance.collect).length ? `to collect${r.balance.paid ? ' and in fees' : ''}` : `for ${fees}`}` : ''}. Your banked supplies are yours already.`, 'sep-r'),
          { key: 'neteven', desc: true, value: r => gv(r.gains.even) }]);
      }
      columns.push(['<th class="wrap" title="How many more to reach your goal, after everything your bank makes">Still needed<br>to goal</th>', r => `<td>${r.toMake ? fmt(r.toMake) : '–'}</td>`, { key: 'still', value: r => r.toMake }]);
      columns.push(['<th class="l" title="What those take, beyond what\'s left in your bank">Supplies needed</th>', r => `<td class="l">${r.toMake ? itemList(r.collect, { small: true }) : ''}</td>`]);
      const rounded = whatIf ? ', supplies rounded up' : '';
      columns.push([`<th class="wrap" title="The XP you've gained once the supplies needed are made as well: everything your bank makes${rounded}, plus the ones still needed. That's your goal reached (the last one made can take you a little past it).">Total XP after<br>supplies needed</th>`,
        (r, m) => xpTd(r.xp.total, () => {
          const bankXp = r.xp.total - r.xp.rest;
          const end = Math.min(MAX_XP10, (cur?.xp10 || 0) + r.xp.total);
          const parts = [bankXp > 0 ? `everything your bank makes${rounded} (+${xpText(bankXp)} XP)` : '', r.toMake ? `${count(m, r.toMake)} (+${xpText(r.xp.rest)} XP)` : ''].filter(Boolean).join(' and ');
          return `${parts[0].toUpperCase()}${parts.slice(1)}: +${xpText(r.xp.total)} XP in all${cur ? `, which takes you to ${xpText(end)} XP (level ${levelForXp10(end)})` : ''}.`;
        }), { key: 'xptotal', desc: true, value: r => r.xp.total || 0 }]);
      columns.push(['<th class="wrap" title="What the ones still needed are worth, less what their supplies cost">Net after<br>buying supplies</th>',
        (r, m) => gainTd(r.gains.collect, g => `${count(m, r.toMake)}: worth ${gpShort(g.value)}, less ${gpShort(g.cost)} for supplies.`), { key: 'netcollect', desc: true, value: r => gv(r.gains.collect) }]);
      columns.push([`<th class="wrap" title="${whatIf ? 'What your bank plan makes of it with your supplies rounded up, less what that takes to collect, plus net after buying supplies' : 'Gross from banked supplies plus net after buying supplies'}: the gp it all comes to on the way to your goal">Total net gp<br>toward goal</th>`,
        (r, m) => gainTd(r.gains.net, () => {
          const b = r.gains.bank;
          const bank = whatIf
            ? (b ? `Your bank plan, with your supplies rounded up, makes ${count(m, r.fromPlan)}: worth ${gpShort(b.value)}${b.cost ? `, less ${gpShort(b.cost)} to collect${ix.fees.size ? ' and in fees' : ''}` : ''} (${signed(b.total)})` : 'Your bank plan makes none of it')
            : !b?.cost ? `Gross from banked supplies ${signed(b?.total || 0)}` : `Gross from banked supplies ${signed(b.value)}, less ${gpShort(b.cost)} for ${fees},`;
          return `${bank} + net after buying supplies ${signed(r.gains.collect?.total || 0)}`;
        }), { key: 'net', desc: true, value: r => gv(r.gains.net) }]);
    }
    // Use comes first, where it can't scroll out of sight: untick anything you
    // don't plan to make. (v3.1) Every skill's table has it, under a word of its
    // own where nothing comes from the bank (Chop, Mine, Fish, Steal, Run, Fight):
    // untick what you won't train with, and the plan leaves it out.
    const [tick, ticked] = tickOf(goal.skill);
    const hideLabel = `Hide unticked ${ticked}`;
    if (bankCols) {
      columns.unshift(['<th title="Let the bank plan make this. Untick anything you don\'t plan to make. (What a ticked row needs is still made on the way: a ring\'s sapphire is cut even with Sapphire (cut) unticked.)">Use</th>',
        (r, m) => `<td class="c"><input type="checkbox" data-use="${m.id}" ${excluded.has(m.id) ? '' : 'checked'} title="Let the bank plan make this" aria-label="Use ${esc(m.name)} in the bank plan"></td>`]);
    } else {
      const what = kills ? 'a monster you won\'t fight' : `anything you won't ${tick.toLowerCase()}`;
      columns.unshift([`<th title="${esc(`Untick ${what}: the plan leaves it out (what to train with, and the levels on the way to it). Click a row to train ${kills ? 'on' : 'with'} it.`)}">${tick}</th>`,
        (r, m) => `<td class="c"><input type="checkbox" data-use="${m.id}" ${excluded.has(m.id) ? '' : 'checked'} title="${esc(`${tick}: untick ${what}`)}" aria-label="${esc(`${tick} ${kills ? m.short : m.name}`)}"></td>`]);
    }
    // (v3.3) The order: the column whose name was clicked (S.sort, for every plan's table; where this table
    // hasn't that column, by level). By level, lowest first, is the data's own order.
    const specs = new Map(columns.filter(c => c[2]).map(c => [c[2].key, c[2]]));
    const sort = specs.has(S.sort.key) ? S.sort : { key: 'level', desc: false };
    if (sort.key !== 'level' || sort.desc) rows = sortedBy(rows, x => specs.get(sort.key).value(x.r, x.m), sort.desc);
    // More than one group (Fletching, Mining's rocks and bars): show one at a
    // time, the one you train with unless you pick. The buttons keep the
    // data's own order whatever the sort (Smithing: Smelting, Bronze … Rune);
    // with every group shown, the table's sections follow the sort.
    const groups = groupsOf(rows.map(x => x.m)).map(([g]) => g);
    const groupOrder = groupsOf(plan.table.map(r => ix.byId.get(r.id)).filter(m => !hidden || !excluded.has(m.id))).map(([g]) => g);
    let shown = null;
    if (groupOrder.length > 1) {
      const pick = S.tgroup[goal.skill];
      const fillGroup = plan.fill ? ix.byId.get(plan.fill.id)?.group : ix.byId.get(plan.fromBank.steps[0]?.id)?.group;
      shown = pick === 'all' ? null : groupOrder.includes(pick) ? pick : fillGroup || groupOrder[0];
    }
    const nameCol = columns.findIndex(([head]) => head.includes(`>${textFor(goal.skill).what}<`));
    // A monster's row says what a kill gives besides, what it leaves, and how many there are.
    const killTitle = m => {
      const also = Object.entries(m.gives || {}).filter(([, x]) => x > 0).map(([k, x]) => `${xpText(x)} ${SKILL_BY_KEY.get(k).name} XP`);
      const few = m.n === 1 ? 'One of a kind.' : `${fmt(m.n)} in the world.`;
      return `${m.name}: ${fmt(m.hp)} hitpoints, ${xpText(m.xp)} ${skillName} XP a kill` +
        (also.length ? `\nA kill also gives ${also.length > 1 ? `${also.slice(0, -1).join(', ')} and ${also[also.length - 1]}` : also[0]}` : '') +
        (m.bones ? `\nLeaves ${ITEMS[m.bones]?.name || m.bones}: ${xpText(BURY_XP[m.bones] || 0)} Prayer XP if you bury them` : '\nLeaves nothing to bury') +
        `\n${few}` + (m.note ? `\n${m.note}` : '');
    };
    // (monsters: every group's rows are there, for the search to show; applySearch hides the rest)
    const body = !rows.length ? `<tr><td class="l c-faint" colspan="${columns.length}">Every row is unticked, and they're hidden. Untick ${hideLabel} to see them.</td></tr>`
      : groups.filter(g => kills || !shown || g === shown).map(gname => {
      const inGroup = rows.filter(x => x.m.group === gname);
      // (the group's name sits above the names, not under Use)
      return `<tr class="grp"${kills ? ` data-grp="${esc(gname)}"` : ''}>${nameCol > 0 ? `<td colspan="${nameCol}"></td>` : ''}<td colspan="${columns.length - Math.max(0, nameCol)}">${esc(gname)}</td></tr>` + inGroup.map(({ r, m }) => {
        const e = r.econ;
        const chosen = plan.fill?.id === m.id;
        if (kills) {
          return `<tr class="${chosen ? 'hl ' : ''}${excluded.has(m.id) ? 'off' : ''}" data-method="${m.id}" data-grp="${esc(gname)}" data-find="${esc(m.short.toLowerCase())}" data-cb="${m.cb}" title="${esc(killTitle(m))}">
          ${columns.map(([, cell]) => cell(r, m)).join('')}
        </tr>`;
        }
        const per = m.unit ? ` per ${m.unit}` : ' each';
        const needs = Object.entries(e.inputs).map(([k, n]) => `${amountText(n)} ${ITEMS[k]?.name || k}`).join(', ');
        const title = `${m.name}: level ${m.level}, ${xpText(m.xp)} XP${per}${m.parts ? ` (${partsText(m)})` : ''}` +
          (r.xpAll ? `\nWith what's made on the way: ${xpText(r.xpAll)} XP${per} (${xpText(r.xpAll - m.xp)} of it from ${textFor(goal.skill).own || "what's made on the way"})` : '') +
          burnLine(ix, m, cur1) + oddsLine(m, cur1) +
          (needs ? `\nNeeds (from scratch): ${needs}` : '') +
          (m.tools?.length ? `\nTools: ${m.tools.map(t => ITEMS[t]?.name || t).join(', ')}` : '') +
          (m.note ? `\n${m.note}` : '') +
          (e.net != null && priced ? `\nCosts ${gpShort(e.cost)}, worth ${gpShort(e.value)}: net ${signed(e.net)}${per}` : '');
        return `<tr class="${r.locked ? 'dim ' : ''}${chosen ? 'hl ' : ''}${excluded.has(m.id) ? 'off' : ''}" data-method="${m.id}" title="${esc(title)}">
          ${columns.map(([, cell]) => cell(r, m)).join('')}
        </tr>`;
      }).join('');
    }).join('');
    const gBtn = (g, label) => `<button type="button" class="chip${(shown || 'all') === g ? ' on' : ''}" data-tgroup="${esc(g)}" aria-pressed="${(shown || 'all') === g}">${esc(label)}</button>`;
    const groupBar = groupOrder.length > 1 ? `<div class="group-pick" role="group" aria-label="Which options">${groupOrder.map(g => gBtn(g, g)).join('')}${gBtn('all', 'All')}</div>` : '';
    // Hide unticked: every table's rows have a tick box (v3.1). It says how many it's hiding here.
    const hideBox = hideOffBox(tick, ticked, hidden);
    // The search looks through every monster, whatever group is shown.
    const search = !kills ? '' : `<div class="bar wrap find-bar"><input class="input small find-in" type="search" data-search="1" value="${esc(S.search[goal.id] || '')}" placeholder="Search monsters: a name, or a combat level" aria-label="Search monsters" autocomplete="off" spellcheck="false">
        <span class="c-faint small-note" data-found></span></div>`;
    return `<div class="plan-sec"><h4>${tableName} <span class="c-faint">(on its own, from ${cur ? `level ${cur.level}` : 'now'}; click one to train ${kills ? 'on' : 'with'} it)</span>
        <button type="button" class="linkish small-note" data-act="table-toggle" aria-expanded="true" title="Hide this plan's table. The rest of the plan stays.">Hide table</button></h4>
      ${search}${groupBar}
      <div class="bar wrap"><span class="c-muted small-note">Click a column's name to sort by it.</span>
        ${hideBox}
        <span class="c-faint small-note">${unitNote(goal.skill, ix, mixed, { bankOn, even: evenCol, assumed: assumed.length ? ASSUME_LABEL[goal.skill] : null, mix: !!plan.fromMix, whatIf })}</span></div>
      <div class="table-wrap"><table class="grid plan-t"${kills ? ` data-shown="${esc(shown || '')}"` : ''}>
        <thead><tr>${columns.map(([th, , spec]) => (spec ? sortTh(th, 'tsort-plan', spec, sort) : th)).join('')}</tr></thead>
        <tbody>${body}</tbody></table></div></div>`;
  }

  // The monster search of a goal's table: rows are shown or hidden where they
  // stand, so typing never redraws the table (and never loses a click). With
  // nothing typed, the group picked is what shows.
  function applySearch(card) {
    const table = card.querySelector('table.plan-t[data-shown]');
    if (!table) return;
    const terms = searchTerms(S.search[card.dataset.goal]);
    const shown = table.dataset.shown;
    const groups = new Set();
    let n = 0;
    for (const tr of table.querySelectorAll('tr[data-method]')) {
      const on = terms.length ? searchHit(tr.dataset.find, tr.dataset.cb, terms) : !shown || tr.dataset.grp === shown;
      tr.hidden = !on;
      if (on) { n++; groups.add(tr.dataset.grp); }
    }
    for (const tr of table.querySelectorAll('tr.grp')) tr.hidden = !groups.has(tr.dataset.grp);
    const out = card.querySelector('[data-found]');
    if (out) out.textContent = !terms.length ? '' : n ? `${fmt(n)} found, whatever their level` : 'No monster matches that. Try part of its name, or its combat level.';
    // (searching, no group's button is the one shown)
    for (const chip of card.querySelectorAll('.group-pick [data-tgroup]')) {
      const on = !terms.length && chip.dataset.tgroup === (shown || 'all');
      chip.classList.toggle('on', on);
      chip.setAttribute('aria-pressed', String(on));
    }
  }

  // Skill tabs on the Bank and Prices views, for the skills the planner covers
  // (the Bank tab leaves out skills that don't use it).
  function skillSwitch(keys, current, { all = false, values = null } = {}) {
    if (keys.length < 2 && !all) return '';
    const worth = k => (values?.[k] ? ` <span class="sw-v">${gpShort(values[k])}</span>` : '');
    const tab = (k, label) => `<button type="button" class="tab skill-tab${k === 'all' ? ' all-tab' : ''}${k === current ? ' active' : ''}" data-bskill="${k}" aria-pressed="${k === current}">${label}${worth(k)}</button>`;
    return `<div class="skill-switch" role="group" aria-label="Skill">${all ? tab('all', 'All') : ''}${keys.map(k => {
      // (Other, v3.1: every item no skill's tab lists; v3.3: nor Gear's or Rares')
      if (k === OTHER) return tab(k, '<span class="other-tab">Other</span>');
      // (v3.3: Gear, the game's Worn Equipment icon; Rares, a partyhat)
      if (k === GEAR || k === RARES) return tab(k, `<span class="ico ico-${k}" aria-hidden="true"></span> ${viewName(k)}`);
      const sk = skillOf(k);
      return tab(k, `${iconImg(sk)} ${esc(sk.name)}`);
    }).join('')}</div>`;
  }

  // ── Reading the bank from screenshots ───────────────────────────────────
  // The reader (bankread.js, its data and icons) loads the first time it's used.
  let reader = null;
  async function getReader() {
    if (reader) return reader;
    const [B, D] = await Promise.all([import('./bankread.js'), import('./bankread-data.js')]);
    const atlas = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(pixelsOf(img, img.naturalWidth, img.naturalHeight));
      img.onerror = () => reject(new Error('The icons for reading screenshots didn\'t load. Reload the page and try again.'));
      img.src = D.BANK_ICON_SHEET || 'bankicons.png';
    });
    reader = { B, D, icons: B.prepareIcons(atlas, D.BANK_ICONS, D.BANK_ICONS_PER_ROW) };
    return reader;
  }
  function pixelsOf(source, w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(source, 0, 0);
    return g.getImageData(0, 0, w, h);
  }

  // Choosing screenshots. Where the browser has the newer file picker (LostKit
  // does), it opens in the folder you last picked from, which is remembered in
  // IndexedDB; the first time, in Pictures, where LostKit Screenshots is. Pages
  // can't name a folder themselves. Elsewhere it's the plain file button.
  // (the files picked; 'input' when it's the plain file button, whose change
  // event reads them; null when none were picked. Loot for a Slayer goal is
  // picked the same way, with a file button of its own.)
  async function pickFiles(inputId) {
    if (typeof window.showOpenFilePicker === 'function') {
      const last = await idb.get('shotsFile');
      try {
        const handles = await window.showOpenFilePicker({
          id: 'lostkit-screenshots', multiple: true, startIn: last || 'pictures',
          types: [{ description: 'Screenshots', accept: { 'image/png': ['.png'] } }],
        });
        if (!handles.length) return null;
        idb.set('shotsFile', handles[0]);
        return await Promise.all(handles.map(h => h.getFile()));
      } catch (e) {
        if (e?.name === 'AbortError') return null;     // closed without picking
        if (last) idb.set('shotsFile', null);           // forget a folder that's gone
      }
    }
    $(inputId)?.click();
    return 'input';
  }
  async function pickScreenshots() {
    const files = await pickFiles('shots-file');
    if (Array.isArray(files) && files.length) readShots(files);
  }

  // files: screenshots (File or Blob). Results wait in S.shots for you to apply.
  async function readShots(files) {
    const list = [...files].filter(f => f && (/^image\//.test(f.type) || /\.png$/i.test(f.name || '')));
    if (!list.length) { S.shots = { error: 'That isn\'t a picture. Use the PNG screenshots LostKit saves.' }; renderShots(); return; }
    showMsg('bank-msg', '');
    S.shots = { busy: list.length };
    renderShots();
    try {
      const { B, D, icons } = await getReader();
      list.sort((a, b) => (a.lastModified || 0) - (b.lastModified || 0));      // later screenshots win
      const reads = [];
      for (const f of list) {
        const name = f.name || 'Pasted picture';
        try {
          const bmp = await createImageBitmap(f);
          const r = B.readBank(pixelsOf(bmp, bmp.width, bmp.height), icons, D.STACK_FONT, D.BANK_LAYOUT);
          bmp.close?.();
          reads.push({ name, ...r });
        } catch (e) {
          reads.push({ name, ok: false, why: 'unreadable' });
        }
      }
      const merged = B.mergeReads(reads.filter(r => r.ok));
      const b = bank();
      const read = B.reviewRows(merged, { bank: b.items, memory: b.twins, likelier: LIKELIER_TWIN, repeat: [UNID_HERBS.item] });
      // off: lines you've unticked. (Kept here: the view is redrawn as prices arrive.)
      S.shots = { reads, merged, off: new Set(), rows: read };
      prices.want(S.shots.rows.flatMap(r => r.choices || [r.slug]));
    } catch (e) {
      S.shots = { error: e?.message || String(e) };
    }
    renderShots();
  }

  // A line read from a screenshot that looks exactly like other items: its
  // drop-down asks which it is. Said out loud (the review's note, the line
  // marked) only where two or more of those can be traded: not for an unid herb
  // (any could be lantadyme), nor where the rest are quest items.
  const twinNudge = it => !!it.choices && it.icon !== UNID_HERBS.item && it.choices.filter(c => ITEMS[c] && !ITEMS[c].untradeable).length >= 2;
  function renderShots() {
    const el = $('bank-shots');
    if (!el) return;
    if (!S.account) { el.innerHTML = ''; return; }
    const sh = S.shots;
    const pick = '<button type="button" class="btn small" data-act="shots-pick">Choose screenshots</button>';
    if (!sh || sh.error) {
      el.innerHTML = `<div class="card shots-drop" data-drop="1">
        <div class="shots-title">Read your bank from screenshots</div>
        <p class="note">Open your bank in LostKit and press the screenshot key. If your bank scrolls, scroll and take another until you've covered it.
          LostKit saves them in <b>Pictures › LostKit Screenshots</b>. Drop them here, paste one, or ${pick}</p>
        ${sh?.error ? `<div class="msg error">${esc(sh.error)}</div>` : ''}
      </div>`;
      return;
    }
    if (sh.busy) {
      el.innerHTML = `<div class="card shots-drop"><span class="busy">Reading ${sh.busy} screenshot${sh.busy === 1 ? '' : 's'}…</span></div>`;
      return;
    }
    const m = sh.merged;
    const b = bank().items;
    const bad = sh.reads.filter(r => !r.ok);
    const okCount = sh.reads.length - bad.length;
    const problems = bad.map(r => `<li><b>${esc(r.name)}</b>: ${r.why === 'no-bank' ? 'no bank in this one. Open your bank before pressing the screenshot key.' : 'couldn\'t open this picture.'}</li>`).join('');
    const moved = reader.B.movedFrom(sh.rows, b, { complete: m.complete });
    const lines = shotLines(sh.rows, b);
    const first = new Set();
    // (v3.2) what stayed the same can be left out of the list, to see what changed
    const sameOf = it => { const l = lines.get(it.slug); return l.next === l.cur && !moved[it.key]; };
    const sameCount = new Set(sh.rows.filter(sameOf).map(it => it.slug)).size;
    const rows = sh.rows.filter(it => !(sh.hideSame && sameOf(it))).map(it => {
      const { cur, next, approx, min, max } = lines.get(it.slug);
      const read = it.approx ? `≈${esc(gpShort(it.count))}` : fmt(it.count);
      const tip = it.approx ? `The bank shows rounded amounts from 100K up: this is between ${fmt(it.min)} and ${fmt(it.max)}.${approx && cur >= min && cur <= max ? ' Your amount is in that range, so it\'s kept.' : ''}` : '';
      // the same icon as another item: one of ours (you pick which), or one the planner doesn't use (like)
      const likes = (it.like || []).map(n => esc(n));
      const twins = it.choices ? [] : (it.also || []).map(a => itemName(a));
      const also = twins.length + likes.length ? ` <span class="c-faint small-note">or ${[...twins, ...likes].join(', ')}: they look the same</span>` : '';
      const unsure = it.unsure ? ` <span class="shot-check" title="A close call between items that look alike: check this one">check</span>` : '';
      const name = it.choices
        ? `<select class="input small shot-as" data-shot-as="${it.key}" aria-label="Which item this is" title="These look exactly the same in the game: pick the one this is. Your pick is kept for next time.">${it.choices.map(c =>
          `<option value="${c}"${c === it.slug ? ' selected' : ''}>${itemName(c)}</option>`).join('')}</select>`
        : itemName(it.slug);
      // one "was" for an item, on its first line
      const lead = !first.has(it.slug);
      first.add(it.slug);
      // (a stack an earlier read filed under the item it looks like: "was under Ashes", with the amount if it's another)
      const from = moved[it.key];
      const was = from ? `was ${b[from] === it.count ? '' : `${fmt(b[from])} `}under ${itemName(from)}`
        : !lead ? '' : next === cur ? 'same' : `was ${fmt(cur)}`;
      // (any unid herb could be lantadyme, which looks just like one: its drop-down is there, without the nudge.
      // Nor where all but one of its look-alikes are quest items, which a bank rarely holds.)
      const nudge = twinNudge(it);
      return `<label class="shot-row${next !== cur ? ' changed' : ''}${nudge ? ' twin' : ''}">
        <input type="checkbox" data-shot="${it.key}"${sh.off.has(it.key) ? '' : ' checked'}>
        ${itemIcon(it.slug, true)} <span class="shot-name">${name}${also}${unsure}</span>
        <span class="shot-n" title="${esc(tip)}">${read}</span>
        <span class="shot-was c-faint">${was}</span>
      </label>`;
    }).join('');
    const twinCount = sh.rows.filter(twinNudge).length;
    const twinNote = twinCount ? ` <b class="c-level">${twinCount === 1 ? 'One of them looks' : `${twinCount} of them look`} exactly like another item</b> (soda ash and ashes, a sapphire ring and a ring of recoil): pick which ${twinCount === 1 ? 'it is' : 'each is'} from its drop-down. Your pick is kept for next time.` : '';
    const gone = Object.values(moved);
    const skipped = m.others + m.unknown;
    const missing = m.complete ? Object.keys(b).filter(slug => b[slug] > 0 && !lines.has(slug) && !gone.includes(slug)) : [];
    el.innerHTML = `<div class="card shots-result" data-drop="1">
      <div class="shots-title">From ${okCount} screenshot${okCount === 1 ? '' : 's'}: ${lines.size} kind${lines.size === 1 ? '' : 's'} of item</div>
      <p class="note">${fmt(m.seen)} bank slots read${m.complete ? ', the whole bank' : ''}. ${skipped ? `${fmt(skipped)} item${skipped === 1 ? '' : 's'} couldn't be read and ${skipped === 1 ? 'was' : 'were'} skipped.` : ''}
        Items cut off at the top or bottom edge are skipped too, so let screenshots overlap a little.${twinNote}</p>
      ${problems ? `<ul class="shot-problems">${problems}</ul>` : ''}
      ${sameCount ? `<label class="check shot-clear"><input type="checkbox" id="shots-same"${sh.hideSame ? ' checked' : ''}> Hide the ${fmt(sameCount)} item${sameCount === 1 ? '' : 's'} that stayed the same</label>` : ''}
      ${rows ? `<div class="shot-list">${rows}</div>` : sh.rows.length ? '<p class="c-faint">Nothing changed: every item read is what your bank has.</p>' : '<p class="c-faint">No items could be read in these screenshots.</p>'}
      ${missing.length ? `<label class="check shot-clear"><input type="checkbox" id="shots-clear"${sh.clear ? ' checked' : ''}> Also clear ${missing.length} item${missing.length === 1 ? '' : 's'} that ${missing.length === 1 ? 'isn\'t' : 'aren\'t'} in your bank anymore: ${missing.map(itemName).join(', ')}</label>` : ''}
      ${sh.rows.length && Array.isArray(bank().order) ? `<label class="check shot-clear"><input type="checkbox" id="shots-order"${sh.keepOrder ? '' : ' checked'}> Put the All view back in your bank's order (you've moved items around there)</label>` : ''}
      <div class="bar wrap">
        ${sh.rows.length ? `<button type="button" class="btn small" data-act="shots-apply">Update my bank</button>` : ''}
        <button type="button" class="btn small" data-act="shots-discard">${sh.rows.length ? 'Discard' : 'Close'}</button>
        <span class="c-faint small-note">Only the ticked items change; everything else in your bank stays as it is.</span>
        <span class="grow"></span>${pick}
      </div>
    </div>`;
  }

  // What the review's lines come to, item by item: { slug -> { count, min, max,
  // approx, cur (in your bank now), next (after updating), slots } }. Lines of
  // one item add up (unid herbs in several slots). only: the lines that count.
  function shotLines(rows, b, only = () => true) {
    const out = new Map();
    for (const r of rows) {
      if (!only(r)) continue;
      const t = out.get(r.slug) || { count: 0, min: 0, max: 0, approx: false, slots: [] };
      t.count += r.count; t.min += r.min; t.max += r.max;
      t.approx ||= !!r.approx;
      t.slots.push(...(r.slots || []));
      out.set(r.slug, t);
    }
    for (const [slug, t] of out) {
      t.cur = b[slug] || 0;
      // 100K and up the bank shows rounded: an amount of yours in that range is kept
      t.next = t.approx && t.cur >= t.min && t.cur <= t.max ? t.cur : t.count;
    }
    return out;
  }

  function applyShots() {
    const sh = S.shots;
    if (!sh?.merged) return;
    const m = sh.merged;
    const b = bank();
    const on = r => !sh.off.has(r.key);
    const all = shotLines(sh.rows, b.items);                   // every line read, ticked or not
    const lines = shotLines(sh.rows, b.items, on);
    let changed = 0;
    // a stack that was filed under the other item with its icon moves over
    const moved = reader.B.movedFrom(sh.rows, b.items, { complete: m.complete });
    for (const r of sh.rows) {
      const from = on(r) && moved[r.key];
      if (!from || !(b.items[from] > 0)) continue;
      delete b.items[from];
      if (b.slots) delete b.slots[from];
      changed++;
    }
    for (const [slug, t] of lines) {
      if (t.next !== t.cur) changed++;
      if (t.next > 0) b.items[slug] = t.next; else delete b.items[slug];
    }
    if (sh.clear && m.complete) {
      for (const slug of Object.keys(b.items)) if (!all.has(slug)) { delete b.items[slug]; changed++; }
    }
    // Where each item is in the bank, for the All view's order. Screenshots of
    // the whole bank replace what was known; a part of it updates what it shows.
    const slots = m.complete ? {} : { ...(b.slots || {}) };
    for (const [slug, t] of all) {
      if (!t.slots.length) continue;
      if (lines.has(slug)) slots[slug] = Math.min(...lines.get(slug).slots);
      else if (b.slots?.[slug] != null) slots[slug] = b.slots[slug];
    }
    b.slots = slots;
    // which of two look-alikes each stack is, for next time
    const twins = { ...(b.twins || {}) };
    for (const r of sh.rows) if (r.choices) twins[r.icon] = sh.rows.filter(x => x.icon === r.icon).map(x => x.slug);
    if (Object.keys(twins).length) b.twins = twins;
    const reordered = Array.isArray(b.order) && !sh.keepOrder && !!$('shots-order');
    if (reordered) delete b.order;
    saveBank(b);
    S.shots = null;
    showMsg('bank-msg', `Bank updated from your screenshots: ${changed} item${changed === 1 ? '' : 's'} changed.${reordered ? ' All is in your bank\'s order again.' : ''}`, 'ok');
    renderBank();
  }

  // ── Bank view ───────────────────────────────────────────────────────────
  // (v3.1) Item boxes eight to a row, as the bank has them in the game (fewer
  // on a narrow screen: style.css), each with what one is worth and what yours
  // come to. Other: every item no skill's tab lists, and any item added by name.
  const byName = (x, y) => itemName(x).localeCompare(itemName(y), 'en', { numeric: true, sensitivity: 'base' }) || (x < y ? -1 : 1);
  function renderBank() {
    if (bankDrag?.hold()) return;          // don't pull items out from under a drag
    renderAccount('bank-account', 'bank');
    renderShots();
    const body = $('bank-body');
    if (!S.account) { $('bank-head').innerHTML = ''; body.innerHTML = ''; return; }
    renderBankHead();
    if (S.bankView === 'all') {
      // Everything you have: in your order (drag items around), or most valuable first.
      const b = bank();
      const have = bankSubset(b.items, 'all');
      const worth = slug => { const p = prices.gp(slug); return p == null ? -1 : p * have[slug]; };
      const byValue = S.allSort === 'value', bySkill = S.allSort === 'skill';
      const list = byValue
        ? Object.keys(have).sort((x, y) => worth(y) - worth(x) || itemName(x).localeCompare(itemName(y)))
        : allOrder(b, Object.keys(have));
      const own = Array.isArray(b.order), inGame = list.some(slug => b.slots?.[slug] != null);
      const note = bySkill ? 'Each item once: weapons and armour under Gear, rares under Rares, the rest under the skill it first belongs to; Slayer has what only monsters drop, and Other what nothing else lists.'
        : byValue ? 'Drag an item to make this your own order.'
        : own ? 'Your own order. Drag items to move them.'
        : inGame ? 'In the order they have in your bank, from your screenshots. Drag items to move them.'
        : 'Drag items to move them. Reading your bank from screenshots puts them in the order they have in-game.';
      const oBtn = (k, label) => `<button type="button" class="${S.allSort === k ? 'on' : ''}" data-allsort="${k}" aria-pressed="${S.allSort === k}">${label}</button>`;
      const reset = own && !byValue && !bySkill ? `<button type="button" class="linkish" data-act="bank-order-reset">${inGame ? 'Back to your bank\'s order' : 'Reset order'}</button>` : '';
      // By skill: a section a skill, in the tabs' order, the items as its tab lists them
      // (v3.3: Gear and Rares first, as their buttons are: weapons before armour, the rares as Rares lists them)
      const order = s => (IS_RARE.has(s) ? RARE_ITEMS.indexOf(s) : SKILL_ORDER.get(s) ?? Infinity);
      const sections = !bySkill ? '' : [GEAR, RARES, ...BANK_TABS, null].map(k => {
        const mine = list.filter(slug => homeOf(slug) === k).sort((x, y) => (k === GEAR ? ITEMS[x].k - ITEMS[y].k : 0) || (order(x) - order(y)) || byName(x, y));
        if (!mine.length) return '';
        const title = k === GEAR || k === RARES ? `<span class="ico ico-${k}" aria-hidden="true"></span> ${viewName(k)}` : k ? `${iconImg(skillOf(k))} ${esc(skillOf(k).name)}` : 'Other';
        return `<div class="bank-sec"><h5>${title}</h5><div class="bank-grid">${mine.map(bankCell).join('')}</div></div>`;
      }).join('');
      body.innerHTML = list.length
        ? `<div class="card bank-group"><div class="bank-all-head"><h4>Everything you have</h4>
            <div class="seg" role="group" aria-label="Order">${oBtn('yours', 'Your order')}${oBtn('value', 'Most valuable')}${oBtn('skill', 'By skill')}</div>
            <span class="c-faint small-note">${note}</span>${reset}</div>
            ${bySkill ? sections : `<div class="bank-grid movable" id="bank-all-grid">${list.map(bankCell).join('')}</div>`}</div>`
        : `<div class="empty">Nothing in your bank yet. Read it from screenshots above, or pick a skill to type in what you have.</div>`;
    } else if (S.bankView === OTHER || S.bankView === GEAR) {
      // What you have that no skill's tab lists, in your bank's order, and a way to add any item by name.
      // (v3.2: by kind, gear in sections of its own: weapons, armour, ammunition, jewellery…)
      // (v3.3: Gear, every weapon and piece of armour you have, the same way; Other, what no other button lists)
      const b = bank();
      const gear = S.bankView === GEAR;
      const list = allOrder(b, Object.keys(bankSubset(b.items, S.bankView)));
      const none = gear ? 'No weapons or armour yet: they show here once your bank is read from screenshots, or added above.'
        : 'Nothing here yet: what you have that no other button lists shows here once your bank is read from screenshots, or added above.';
      body.innerHTML = `<div class="card bank-group"><h4>${gear ? 'Gear' : 'Other items'}</h4>
        ${bankAddHtml()}
        ${list.length ? kindGroups(list).map(g => `<div class="bank-sec"><h5>${esc(g.name)}</h5><div class="bank-grid">${g.items.map(bankCell).join('')}</div></div>`).join('') : `<div class="c-faint small-note">${none}</div>`}</div>`;
    } else if (S.bankView === RARES) {
      // (v3.3) Every rare, like a skill's tab: type in the ones you have.
      body.innerHTML = `<div class="card bank-group"><h4>Rares</h4><div class="bank-grid">${RARE_ITEMS.map(bankCell).join('')}</div></div>`;
    } else {
      const groups = BANK_GROUPS[S.bankView] || [];
      body.innerHTML = groups.map(g => `<div class="card bank-group"><h4>${esc(g.name)}</h4><div class="bank-grid">${g.items.map(bankCell).join('')}</div></div>`).join('');
    }
    const items = Object.keys(bank().items);
    if (items.length) prices.want(items);
  }

  // Adding any item by its name (Other). The names to pick from are a list of
  // their own, made once and kept outside what's redrawn.
  const ADDABLE = () => Object.keys(ITEMS).filter(s => !ITEMS[s].set && !ITEMS[s].charge && !ITEMS[s].clue);
  let addNames = null;
  function addList() {
    if (addNames) return;
    addNames = new Map(ADDABLE().map(s => [ITEMS[s].name.toLowerCase(), s]));
    const dl = document.createElement('datalist');
    dl.id = 'bank-add-names';
    dl.innerHTML = [...addNames.keys()].map(n => `<option value="${esc(ITEMS[addNames.get(n)].name)}">`).join('');
    $('view-bank').appendChild(dl);
  }
  function bankAddHtml() {
    addList();
    return `<form class="bar wrap bank-add" data-form="bank-add" autocomplete="off">
      <span class="c-muted">Add an item</span>
      <input class="input small add-in" name="item" list="bank-add-names" data-add-q="1" value="${esc(S.addQ)}" placeholder="Any item: part of its name" aria-label="An item to add" spellcheck="false">
      <input class="input small num" name="n" data-add-n="1" inputmode="decimal" value="${esc(S.addN || '')}" placeholder="How many" aria-label="How many">
      <button class="btn small" type="submit">Add to my bank</button>
      <span class="small-note ${S.addMsg?.bad ? 'c-lose' : 'c-faint'}">${S.addMsg ? S.addMsg.html : 'Any item in the game, by its name.'}</span>
    </form>`;
  }
  // -> { slug } or { problem } (HTML)
  function findItem(text) {
    addList();
    const t = String(text || '').trim().toLowerCase();
    if (!t) return { problem: 'Type part of an item\'s name.' };
    if (addNames.has(t)) return { slug: addNames.get(t) };
    const terms = t.split(/\s+/);
    const hits = [...addNames].filter(([n]) => terms.every(w => n.includes(w))).map(([, s]) => s);
    if (hits.length === 1) return { slug: hits[0] };
    if (!hits.length) return { problem: `No item is called anything like <b>${esc(text)}</b>.` };
    const names = hits.sort(byName).slice(0, 6).map(s => itemName(s));
    return { problem: `Which one? ${names.join(', ')}${hits.length > 6 ? ` and ${fmt(hits.length - 6)} more` : ''}. Pick it from the list.` };
  }
  function addToBank(form) {
    S.addQ = form.item.value; S.addN = form.n.value;
    const found = findItem(form.item.value);
    if (found.problem) { S.addMsg = { html: found.problem, bad: true }; renderBank(); return; }
    const n = form.n.value.trim() === '' ? 1 : parseAmount(form.n.value);
    if (!(n > 0)) { S.addMsg = { html: 'How many? 1500, 1.5k or 2m all work.', bad: true }; renderBank(); return; }
    const b = bank();
    b.items[found.slug] = Math.min(2_147_483_647, (b.items[found.slug] || 0) + n);
    saveBank(b);
    prices.want([found.slug]);
    // (v3.3: and where it shows, Gear, Rares, the skills that list it or Other, if not just here)
    const where = BANK_VIEWS.filter(k => viewHas(k, found.slug));
    const names = where.map(k => `<b>${esc(viewName(k))}</b>`);
    const listed = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
    S.addQ = ''; S.addN = '';
    S.addMsg = { html: `Added ${fmt(n)} ${itemName(found.slug)}: you have ${fmt(b.items[found.slug])}${where.length && !(where.length === 1 && where[0] === S.bankView) ? `, under ${listed}` : ''}.` };
    renderBank();
    document.querySelector('[data-add-q]')?.focus({ preventScroll: true });
  }

  function renderBankHead() {
    const b = bank();
    const view = S.bankView;
    const sub = bankSubset(b.items, view);
    const value = bankValue(sub, prices.priceOf);
    const kinds = Object.keys(sub).length;
    const values = {};
    for (const k of ['all', ...BANK_VIEWS]) {
      const v = bankValue(bankSubset(b.items, k), prices.priceOf).total;
      if (v > 0) values[k] = v;
    }
    const skillName = view === 'all' || view === OTHER || view === GEAR || view === RARES ? '' : skillOf(view).name;
    const hint = {
      all: 'Showing everything you have. Pick a button to see just its items and what they\'re worth; a skill\'s lists the ones you don\'t have yet too, to type in. Each button picks out what it lists, so an item can be under more than one (a rune platebody is Gear\'s and Smithing\'s, logs Firemaking\'s and Fletching\'s): All counts each item once.',
      [GEAR]: 'Every weapon and piece of armour you have, read from your screenshots or added above, whichever skill\'s button lists it too (a rune platebody is Smithing\'s, a dragonhide body Crafting\'s). The rares are under Rares.',
      [RARES]: 'This version\'s rares: Christmas crackers and the partyhats in them, Santa hats, Halloween masks, pumpkins, Easter eggs, half full wine jugs, disks of returning, bunny ears and scythes. Type in the ones you have.',
      [OTHER]: 'Every item you have that no other button lists: quest items, tools, jewellery and the rest, read from your screenshots or added above. Each is valued like any other (the market\'s price, high alch or yours: pick on the Prices tab, under Other); an item that can\'t be traded is worth its high alch.',
      herblore: 'Unid herbs are one entry: every "Herb" in your bank, whatever it turns out to be.',
      runecraft: 'Rune essence is the only essence in this version of the game; pure essence came later.',
      firemaking: 'Achey tree logs aren\'t listed: lighting them gives no XP in this version. Your logs are shared with Fletching (it\'s one bank).',
      fletching: 'Unstrung bows are marked (u); in-game they have the same name as the strung bow. Feathers count for both arrows and darts.',
      cooking: 'Raw fish and meat cook into food; a pie, a pizza, a cake, a stew or a wine is put together first, and anything on the way counts (flour and water, dough, a pie shell). Burnt food is counted on a Cooking goal, where you also say what you cook on. Dough takes a bucket of water here; in the game a jug does too. Cooked meat and anchovies are food and a filling or topping: one entry each. Your raw fish are the ones Fishing catches (it\'s one bank).',
      magic: 'A Magic goal casts your runes as the best teleport and combat spell they allow. Jewellery and orbs can be entered as what they\'re made of (gold bars, gems, molten glass): a goal makes them on the way, where your Crafting level allows. Those are shared with Crafting, and ore with Smithing (it\'s one bank).',
      slayer: 'Everything a monster drops, by kind: a Slayer goal\'s "Deposit to my bank" puts what you got here. Items a skill uses too (herbs, ore, bars, bones, runes) are on that skill\'s tab as well: it\'s one bank. All, by skill, has each item once, under the skill it first belongs to.',
      crafting: 'Hides are tanned before they\'re worked: type in hides or leather, and both are used. The tanner\'s fee is counted (pick the tanner on a Crafting goal). Key halves and crystal keys count as the uncut dragonstone the crystal chest always gives (its other loot is luck, and isn\'t counted). Dragonhide\'s colour is added in brackets, the two key halves are told apart as tooth and loop, and unstrung amulets are marked (u), since in-game those share a name. Dragonhide sets are priced on the Prices tab: in a bank they\'re their three pieces. Bow strings, vials and runes are shared with other skills (it\'s one bank).',
    }[view] || '';
    // ("40 kinds of item", "12 kinds of Herblore item", "3 other kinds of item", v3.3: "5 kinds of gear", "2 rares")
    const s = kinds === 1 ? '' : 's';
    const count = view === GEAR ? `<b>${kinds}</b> kind${s} of gear` : view === RARES ? `<b>${kinds}</b> rare${s}`
      : `<b>${kinds}</b> ${view === OTHER ? 'other kind' : 'kind'}${s} of ${skillName ? esc(skillName) + ' ' : ''}item`;
    const none = view === GEAR ? 'No gear yet' : view === RARES ? 'No rares yet' : view === OTHER ? 'No other items yet' : skillName ? `No ${esc(skillName)} items yet` : 'Nothing entered yet';
    const worth = view === GEAR ? 'Your gear is worth' : view === RARES ? 'Your rares are worth' : view === OTHER ? 'Other items are worth' : skillName ? `${esc(skillName)} items are worth` : 'Worth';
    $('bank-head').innerHTML = `${skillSwitch(BANK_VIEWS, view, { all: true, values })}<div class="bank-sum">
      <span>${kinds ? count : none}${b.updated ? ` · updated ${ago(b.updated)}` : ''}</span>
      ${kinds ? `<span>${worth} about <b class="c-xp">${value.total || !value.missing.length ? gpShort(value.total) : '?'}</b> gp${value.missing.length ? ` <span class="c-faint">(${value.missing.length} without a price)</span>` : ''}</span>` : ''}
      <span class="grow"></span>
      <button type="button" class="btn small" data-act="bank-prices">Get prices</button>
      <button type="button" class="btn small danger" data-act="bank-clear">Clear bank</button>
    </div>
    <p class="note">Type what you have: 1500, 1.5k or 2m all work. Each box says what one is worth (ea) and what yours come to. Click an item's name to see its price on the Prices tab. A skill's button lists the items its plans use, Gear your weapons and armour, Rares the rares, and Other everything else you have.
      ${hint}</p>`;
  }

  function bankCell(slug) {
    const it = ITEMS[slug];
    const n = bank().items[slug] || 0;
    const p = prices.gp(slug);
    // (v3.2: a name opens the item's line on the Prices tab; coins have none)
    const name = !pricedLine(slug) ? `<span class="bn">${itemName(slug)}</span>`
      : `<a class="bn mk" ${priceLink(slug)} draggable="false" title="See its price on the Prices tab${it.untradeable ? ' (it can\'t be traded: its high alch)' : ''}">${itemName(slug)}</a>`;
    const each = p != null ? `${gpShort(p)} ea` : n ? '<span class="c-faint">? ea</span>' : '';
    return `<label class="bank-cell${n ? ' has' : ''}" data-slug="${slug}" title="${esc(it.name)}\n${esc(priceTip(slug))}">
      ${itemIcon(slug)}
      ${name}
      <input class="input small num" data-bank="${slug}" inputmode="decimal" value="${n ? fmt(n) : ''}" placeholder="0" aria-label="${itemName(slug)} in bank">
      <span class="bvals"><span class="bp" data-bp="${slug}" title="What one is worth">${each}</span><span class="bv" data-bv="${slug}" title="What yours come to">${n && p != null ? gpShort(n * p) : ''}</span></span>
    </label>`;
  }

  // ── Prices view ─────────────────────────────────────────────────────────
  // Each item uses the price you pick for it, and keeps it: the market's (the
  // default), high alch, or yours (typing one in picks it). A whole list or
  // skill can be switched at once; that leaves prices you typed in be.
  // (not coins, worth what they are: a Slayer goal's loot has them from v3)
  // (v3.1) Other: every item no skill's list has that you have (or have picked a
  // price for), untradeable ones too (worth their high alch); and a search
  // finds any item at all.
  // (v3.2) Items in sections by kind (ITEM_KINDS: weapons, armour, …, the rest last), each in the order given.
  function kindGroups(slugs) {
    const by = new Map();
    for (const s of slugs) {
      const k = ITEMS[s]?.k != null ? ITEM_KINDS[ITEMS[s].k] : 'Other';
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(s);
    }
    return ITEM_KINDS.filter(k => by.has(k)).map(k => ({ name: k, items: by.get(k) }));
  }
  function priceItems(list, { untradeable = false } = {}) { return list.filter(s => ITEMS[s] && (untradeable || !ITEMS[s].untradeable) && ITEMS[s].gp == null); }
  let pricedAll = null;
  const pricedSet = () => pricedAll || (pricedAll = new Set(priceGroups('all').flatMap(g => g.items)));
  function otherPriceItems() {
    const b = bank().items;
    const list = [...Object.keys(b).filter(s => b[s] > 0), ...Object.keys(prices.overrides), ...Object.keys(prices.use)];
    // (v3.3: and not under Gear or Rares)
    return [...new Set(list)].filter(s => ITEMS[s] && ITEMS[s].gp == null && !ITEMS[s].set && !pricedSet().has(s) && !isGear(s) && !IS_RARE.has(s)).sort(byName);
  }
  const FOUND_MAX = 200;
  function foundItems(q) {
    const terms = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return null;
    return Object.keys(ITEMS).filter(s => ITEMS[s].gp == null && terms.every(t => ITEMS[s].name.toLowerCase().includes(t))).sort(byName);
  }
  // The lists the Prices tab shows: what's found, Other, or a skill's (All: every skill's).
  // (v3.2) Your list: what has a quantity typed in, and what it all comes to at your prices.
  const pqItems = () => Object.keys(S.pq).filter(s => S.pq[s] > 0 && ITEMS[s] && pricedLine(s)).sort(byName);
  function pqTotal() {
    let total = 0, missing = 0;
    for (const s of pqItems()) { const p = prices.gp(s); if (p == null) missing++; else total += p * S.pq[s]; }
    return { total, missing, count: pqItems().length };
  }
  const savePq = () => store.set('priceQty', S.pq);
  function pqSumHtml() {
    const t = pqTotal();
    if (!t.count) return '';
    return `<div class="bar wrap pq-sum"><span>Your list: <b>${fmt(t.count)}</b> item${t.count === 1 ? '' : 's'}, <b class="c-xp">${gpShort(t.total)}</b> gp${t.missing ? ` <span class="c-faint">(${t.missing} without a price)</span>` : ''}</span>
      <button type="button" class="linkish small-note" data-act="pq-only" aria-pressed="${S.pqOnly}">${S.pqOnly ? 'Show every item' : 'Show only these'}</button>
      <button type="button" class="linkish small-note" data-act="pq-clear">Clear the list</button></div>`;
  }
  function shownPriceGroups() {
    if (S.pqOnly && !foundItems(S.priceQ)) return [{ name: 'Your list', items: pqItems(), any: true }];
    const found = foundItems(S.priceQ);
    if (found) return [{ name: found.length ? `Found: ${fmt(found.length)}${found.length > FOUND_MAX ? ` (the first ${FOUND_MAX})` : ''}` : 'Found: none', items: found.slice(0, FOUND_MAX), any: true }];
    if (S.priceView === OTHER) {
      const groups = kindGroups(otherPriceItems());
      return groups.length ? groups.map(g => ({ ...g, any: true })) : [{ name: 'Other items you have', items: [], any: true }];
    }
    return priceGroups(S.priceView);
  }
  function wantPriceView() {
    if (S.priceView === OTHER) prices.want(otherPriceItems(), { all: true });
    else if (S.priceView === GEAR || S.priceView === RARES) prices.want(priceGroups(S.priceView).flatMap(g => g.items), { all: true });
    else if (S.priceView !== 'all') wantPrices([S.priceView], { all: true });
  }
  function renderPrices() {
    const st = prices.status();
    const head = $('prices-head');
    const running = st.busy || st.queued;
    const all = S.priceView === 'all';
    const searching = !!foundItems(S.priceQ);
    // ("Every Herblore item", "Every other item", or on All "Every item")
    // (v3.3: "Every piece of gear", "Every rare")
    const every = searching ? 'item found' : all ? 'item' : S.priceView === OTHER ? 'other item' : S.priceView === GEAR ? 'piece of gear' : S.priceView === RARES ? 'rare' : `${esc(skillOf(S.priceView).name)} item`;
    head.innerHTML = `${skillSwitch(PRICE_VIEWS, S.priceView, { all: true })}<div class="card">
      <div class="bar wrap">
        <button type="button" class="btn small" data-act="prices-refresh"${running ? ' disabled' : ''}>Check prices now</button>
        ${running ? `<button type="button" class="btn small" data-act="prices-stop">Stop</button><span class="busy">Checking ${fmt(Math.min(st.done + 1, st.total))} of ${fmt(st.total)}…</span>` : ''}
        ${st.error && !running ? `<span class="c-lose small-note">${esc(st.error)}${ctx.fullMarket ? '' : ' Prices work best inside LostKit.'}</span>` : ''}
        <span class="grow"></span>
        <span class="bulk"><span class="c-muted small-note">Every ${every}:</span>
          <button type="button" class="btn small" data-pall="market" title="Use the market's price for every ${every} (prices you typed in stay)">Market</button>
          <button type="button" class="btn small" data-pall="alch" title="Use high alch for every ${every} (prices you typed in stay)">High alch</button></span>
      </div>
      <div class="bar wrap find-bar"><input class="input small find-in" type="search" data-price-q="1" value="${esc(S.priceQ)}" placeholder="Find any item: part of its name" aria-label="Find any item" autocomplete="off" spellcheck="false">
        <span class="c-faint small-note">${searching ? 'Every item whose name has that in it, whatever the tab. Clear the box to go back.' : 'Any item in the game, planner or not.'}</span>
        ${S.priceSort ? '<button type="button" class="linkish small-note" data-act="price-sort-reset" title="Each list in its own order again (a skill\'s as its plans have it, the rest A to Z)">Back to the lists\' own order</button>' : ''}</div>
      <div id="pq-sum">${pqSumHtml()}</div>
      <p class="note">Pick the price each item uses, and it sticks: the <b>market</b>'s, <b>high alch</b> (what High Level Alchemy gives: 3/5 of its value), or <b>your own</b> (type it in).
        Market prices are the median of recent sales on <a href="https://markets.lostcity.rs" target="_blank" rel="noopener">markets.lostcity.rs</a>, otherwise of open offers, and high alch for items nobody trades or that can't be traded.
        ${ctx.fullMarket ? '' : 'In a normal browser only open offers can be read; LostKit also sees the sales. '}They're checked one at a time and kept for 12 hours.
        Click an item to open it on the market${ctx.inLostKit ? ' (LostKit\'s ◀ button brings you back here)' : ''}. Type how many you want under <b>Qty</b>, or what you want to spend under <b>Cost</b> (it works out how many that buys), and <b>Your list</b> adds them up. Click a column's name to sort the lists by it.
        ${all && !searching ? `<b>All</b> is every item the planner prices, ${fmt(priceGroups('all').reduce((n, g) => n + g.items.length, 0))} of them, each once: under the skill it first belongs to, A to Z (Slayer has what only monsters drop). Opening it checks nothing (a skill's tab checks its own, and your goals and bank what they use): <b>Check prices now</b> goes through them all, which takes a while; Stop ends it. <b>Gear</b> has every weapon and piece of armour, <b>Rares</b> the rares, and <b>Other</b> the rest of what you have.` : ''}
        ${S.priceView === GEAR && !searching ? '<b>Gear</b> is every weapon and piece of armour that can be traded (and any you have that can\'t), A to Z, whichever skill\'s list has it too: opening it checks them all, which takes a while; Stop ends it. The rares are under Rares.' : ''}
        ${S.priceView === RARES && !searching ? '<b>Rares</b>: Christmas crackers and the partyhats in them, Santa hats, Halloween masks and the rest of this version\'s rares. Bunny ears and the scythe can\'t be traded: they\'re worth their high alch.' : ''}
        ${S.priceView === OTHER && !searching ? '<b>Other</b> is what you have that no other list has (and any you\'ve picked a price for). To price any other item, find it above.' : ''}</p>
    </div>`;
    renderPricesBody();
  }
  // (v3.3) The lists sorted by a column's name (S.priceSort, every list; null: each list's own order)
  const PRICE_VALUE = {
    name: s => ITEMS[s]?.name || s,
    market: s => prices.market(s)?.gp ?? null,
    alch: s => (ITEMS[s]?.noAlch ? null : highAlch(s)),
    mine: s => prices.overrides[s] ?? null,
    qty: s => S.pq[s] || null,
    cost: s => { const q = S.pq[s], p = prices.gp(s); return q && p != null ? q * p : null; },
  };
  function renderPricesBody() {
    const groups = shownPriceGroups();
    const ps = S.priceSort;
    const allBtn = (use, gi, what) => ` <button type="button" class="linkish th-all" data-pall="${use}" data-pgroup="${gi}" title="Use ${what} for every item in this list (prices you typed in stay)">all</button>`;
    const th = (html, key, desc, after = '') => sortTh(html, 'price-sort', { key, desc }, ps, after);
    const scrolls = tableScrolls($('prices-body'));        // (v3.3.1)
    $('prices-body').innerHTML = groups.map((g, gi) => {
      const own = priceItems(g.items, { untradeable: !!g.any });
      const items = ps ? sortedBy(own, PRICE_VALUE[ps.key], ps.desc) : own;
      return `<div class="table-wrap price-wrap"><table class="grid prices-t">
      <thead><tr>${th(`<th class="l">${esc(g.name)}</th>`, 'name', false)}
        ${th('<th class="l">Market</th>', 'market', true, allBtn('market', gi, 'the market\'s price'))}
        ${th('<th class="l">High alch</th>', 'alch', true, allBtn('alch', gi, 'high alch'))}
        ${th('<th class="l">Your price</th>', 'mine', true)}
        ${th('<th class="pq" title="How many you want: Your list adds up what they cost">Qty</th>', 'qty', true)}${th('<th class="pcost" title="What that many cost, at the price ticked">Cost</th>', 'cost', true)}</tr></thead>
      <tbody>${items.length ? items.map(priceRow).join('') : `<tr><td class="l c-faint" colspan="6">${S.pqOnly && !S.priceQ.trim() ? 'Nothing on your list.' : S.priceQ.trim() ? 'No item is called anything like that.' : 'Nothing here yet: what you have that no skill uses shows here once your bank is read from screenshots.'}</td></tr>`}</tbody></table></div>`;
    }).join('');
    restoreTableScrolls($('prices-body'), scrolls);
    // (the item a link came to see: its line stands out, and is scrolled to once)
    const hl = S.priceHl && $('prices-body').querySelector(`tr[data-prow="${S.priceHl}"]`);
    if (hl) {
      hl.classList.add('hl');
      if (S.priceHlScroll) { S.priceHlScroll = false; hl.scrollIntoView({ block: 'center' }); }
    }
  }
  // (a quantity typed: its cost and the list's total, in place)
  function showPq(slug, { qty = false } = {}) {
    const q = S.pq[slug] || 0, p = prices.gp(slug);
    const box = $('prices-body').querySelector(`[data-pcost="${slug}"]`);
    if (box && box !== document.activeElement) { box.value = q && p != null ? fmt(Math.round(q * p)) : ''; box.placeholder = q ? '?' : '0'; box.classList.remove('bad'); }
    const qbox = qty && $('prices-body').querySelector(`[data-pq="${slug}"]`);
    if (qbox) { qbox.value = q ? fmt(q) : ''; qbox.classList.remove('bad'); }
    const sum = $('pq-sum');
    if (sum) sum.innerHTML = pqSumHtml();
  }

  function priceRow(slug) {
    const use = prices.sourceOf(slug);
    const own = prices.overrides[slug];
    const m = prices.market(slug);
    const at = prices.fetchedAt(slug);
    const name = ITEMS[slug]?.name || slug;
    const pick = (value, label) => `<input type="radio" name="pu-${slug}" value="${value}" data-psrc="${slug}"${use === value ? ' checked' : ''} aria-label="${esc(`${label} for ${name}`)}">`;
    const market = m
      ? `<b>${gpShort(m.gp)}</b><span class="src">${esc(m.untraded ? (m.untradeable ? 'can\'t be traded: high alch' : 'no trades: high alch') : sourceText(m))}${at && !m.untraded ? ` · checked ${ago(at)}` : ''}</span>`
      : `<span class="c-faint">${at ? 'not traded' : 'not checked yet'}</span>`;
    // (an item that can't be traded has no page on the market)
    const label = ITEMS[slug]?.untradeable ? `<span class="sk-cell" title="${esc(`${name}: can't be traded`)}">${itemIcon(slug, true)} ${itemName(slug)}</span>`
      : `<a class="sk-cell mk" ${marketLink(slug)} title="${esc(`Open ${name} on the market`)}">${itemIcon(slug, true)} ${itemName(slug)}</a>`;
    const q = S.pq[slug] || 0, p = prices.gp(slug);
    return `<tr data-prow="${slug}">
      <td class="l">${label}</td>
      <td class="l pc${use === 'market' ? ' on' : ''}"><label class="pick">${pick('market', 'Market price')}<span>${market}</span></label></td>
      <td class="l pc${use === 'alch' ? ' on' : ''}"><label class="pick">${pick('alch', 'High alch')}<b>${ITEMS[slug]?.noAlch ? '<span class="c-faint" title="High Level Alchemy refuses it">can\'t</span>' : gpShort(highAlch(slug))}</b></label></td>
      <td class="l pc${use === 'mine' ? ' on' : ''}"><label class="pick">${pick('mine', 'Your price')}</label><input class="input small num${own != null ? ' set' : ''}" data-price="${slug}" inputmode="decimal" value="${own != null ? own : ''}" placeholder="type one" aria-label="Your price for ${esc(name)}" title="${own != null ? 'Your price. Clear the box to go back to the market\'s' : 'Type a price to use it for this item'}"></td>
      <td class="pq"><input class="input small num" data-pq="${slug}" inputmode="numeric" value="${q ? fmt(q) : ''}" placeholder="0" aria-label="How many ${esc(name)}" title="How many you want"></td>
      <td class="pcost"><input class="input small num" data-pcost="${slug}" inputmode="decimal" value="${q && p != null ? fmt(Math.round(q * p)) : ''}" placeholder="${q ? '?' : '0'}" aria-label="What ${esc(name)} would cost" title="${p != null ? 'What they cost. Type what you want to spend, and the quantity is what it buys at this price' : 'No price for it yet'}"></td>
    </tr>`;
  }

  // (v3.2) The one switch that hides unticked rows, the same in every table that has
  // ticks: "Hide unticked items" (Use), trees (Chop), rocks, fish, targets, courses,
  // monsters (Fight), loot (Take) and skills (Train). How many it hides here, after it.
  function hideOffBox(tick, ticked, hidden) {
    return `<label class="check hide-off" title="${esc(`Leave the rows you've unticked under ${tick} out of the table. Untick this to see them again. It applies to every table with ticks.`)}"><input type="checkbox" data-topt="hideOff" ${S.hideOff ? 'checked' : ''}> Hide unticked ${esc(ticked)}${hidden ? ` <span class="c-faint">(${fmt(hidden)} hidden)</span>` : ''}</label>`;
  }

  // ── Rendering glue ──────────────────────────────────────────────────────
  // Views are rebuilt as prices and XP arrive, so whatever field you're typing
  // in is found again afterwards, with its text and caret where they were.
  function fieldKey(el) {
    if (el.dataset?.psrc) return `[data-psrc="${el.dataset.psrc}"][value="${el.value}"]`;
    for (const a of ['bank', 'price', 'gopt', 'use', 'mix', 'shot', 'search', 'gcalc', 'got', 'done', 'sopt', 'dryKills', 'dryItem', 'npcSearch', 'npcKills', 'npcStyle', 'npcOpt',
      // (v3.1)
      'take', 'alch', 'lootN', 'lootShot', 'lootAs', 'lootOne', 'lootAgain', 'lootEarly', 'dep', 'depOn', 'bring', 'bringAdd', 'ses', 'sesNpc', 'sesReduce', 'sesFrom', 'alchN', 'alchKills', 'alchAdd', 'planPick', 'npcHerbs', 'totalSkip', 'priceQ', 'addQ', 'addN', 'pq', 'pcost']) {
      if (el.dataset?.[a]) return `[data-${a.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}="${el.dataset[a]}"]`;
    }
    if (el.dataset?.shotAs) return `[data-shot-as="${el.dataset.shotAs}"]`;
    const form = el.closest('[data-form]');
    if (form && el.name) return `[data-form="${form.dataset.form}"] [name="${el.name}"]`;
    return null;
  }
  function render(tab) {
    S.tab = tab;
    const view = $('view-' + tab);
    const a = document.activeElement;
    const key = a && view?.contains(a) && a.matches('input, select, textarea') ? fieldKey(a) : null;
    const goal = key && a.closest('[data-goal]')?.dataset.goal;
    const keep = key && { value: a.value, start: a.selectionStart, end: a.selectionEnd };
    if (tab === 'goals') renderGoals();
    if (tab === 'npcs') npc().renderNpcs();
    if (tab === 'bank') renderBank();
    if (tab === 'prices') renderPrices();
    if (!keep) return;
    const scope = goal ? view.querySelector(`[data-goal="${goal}"]`) : view;
    const el = scope?.querySelector(key);
    if (!el) return;
    if (el.type !== 'checkbox' && el.type !== 'radio' && el.tagName !== 'SELECT') el.value = keep.value;
    el.focus({ preventScroll: true });
    try { if (keep.start != null) el.setSelectionRange(keep.start, keep.end); } catch (e) { /* not a text field */ }
  }
  let rerenderTimer = null;
  // A button pressed while the view is rebuilt would lose its click: wait for
  // the press to finish. Same for an open drop-down, which would snap shut,
  // and for an amount or a price half typed: a field that's rebuilt hands in
  // what it holds so far (the browser's doing, and that redraws in the middle
  // of this one), or in other browsers forgets that anything was typed.
  let pressing = false;
  let typing = null;                       // that field, until it's entered or left
  let pressNew = false;                    // the press began this very moment: nothing else has run since
  let lifted = false;                      // the button is up again; the click it makes is still to come
  let pressHeld = false;                   // a redraw is waiting for the press to end
  const released = () => { const due = pressHeld; pressing = lifted = pressHeld = false; if (due) rerender(); };
  document.addEventListener('pointerdown', () => { pressing = pressNew = true; lifted = false; setTimeout(() => { pressNew = false; }, 0); }, true);
  document.addEventListener('pointerup', () => { lifted = true; setTimeout(() => { if (lifted) released(); }, 0); }, true);
  document.addEventListener('pointercancel', released, true);
  document.addEventListener('keydown', () => { if (lifted) released(); }, true);      // (a key: that press is over)
  // (a press that opens a menu, or ends in another window, makes no click, and may never say it's over)
  document.addEventListener('contextmenu', released, true);
  window.addEventListener('blur', released);
  const midTyping = () => !!typing && typing.isConnected && typing === document.activeElement;
  function rerender() {
    if (!S.tab || $('view-' + S.tab)?.hidden) return;
    clearTimeout(rerenderTimer);
    pressHeld = pressing;
    if (pressing) { rerenderTimer = setTimeout(rerender, 250); return; }
    if (document.activeElement?.tagName === 'SELECT' || midTyping()) { rerenderTimer = setTimeout(rerender, 1000); return; }
    // (and look again when it's time: a press or a number may have started in between)
    rerenderTimer = setTimeout(() => (pressing || midTyping() ? rerender() : render(S.tab)), 30);
  }

  // Leaving a field for something else on the page enters what was typed in it,
  // and then the press that did it is still under way: redrawn on the spot, the
  // view would be rebuilt under it and the click would land on nothing (the next
  // amount box, a row, a tick box: clicked for nothing). So then it's redrawn
  // once the click has landed; entered with Enter or Tab, straight away.
  const entered = redraw => (pressing && pressNew ? rerender() : redraw());

  function show(tab) {
    render(tab);
    if (S.account && (tab === 'goals' || tab === 'bank' || tab === 'npcs')) loadProfile();
    // (shows the market's price beside the others. All checks nothing by itself: that's every item there is)
    if (tab === 'prices') wantPriceView();
  }

  // Price updates arrive one item at a time; redraw about once a second.
  let priceTimer = null;
  prices.addEventListener('update', () => {
    if (priceTimer) return;
    priceTimer = setTimeout(() => { priceTimer = null; rerender(); }, 1000);
  });

  // ── Events ──────────────────────────────────────────────────────────────
  function wire() {
    for (const id of ['view-goals', 'view-npcs', 'view-bank', 'view-prices']) {
      const root = $(id);
      root.addEventListener('submit', onSubmit);
      root.addEventListener('click', onClick);
      root.addEventListener('change', onChange);
      root.addEventListener('input', onInput);
      // (an amount or a price being typed, for rerender: from its first key until it's entered or left
      // for something else on the page. Another window in front isn't leaving it.)
      root.addEventListener('input', e => {
        const d = e.target.dataset;
        if (d?.mix || d?.price || d?.bank || d?.gcalc || d?.got || d?.done || d?.dryKills || d?.npcKills
          || d?.lootN || d?.dep || d?.ses || d?.sesNpc || d?.bring || d?.priceQ || d?.addQ || d?.addN || d?.pq || d?.pcost || d?.alchN || d?.alchKills) typing = e.target;
      });
      root.addEventListener('change', e => { if (e.target === typing) typing = null; }, true);
      root.addEventListener('focusout', e => { if (e.target === typing && document.hasFocus()) typing = null; });
    }
    // The plain file button for screenshots: one that stays, outside what's
    // redrawn. Redrawn with the rest, a redraw while the file dialog was open
    // left the files you then picked with a button that was no longer there.
    $('view-bank').appendChild(Object.assign(document.createElement('input'),
      { type: 'file', id: 'shots-file', accept: 'image/png,image/*', multiple: true, hidden: true }));
    // (and a Slayer goal's loot)
    $('view-goals').appendChild(Object.assign(document.createElement('input'),
      { type: 'file', id: 'loot-file', accept: 'image/png,image/*', multiple: true, hidden: true }));
    bankDrag = sortable({
      root: $('view-bank'),
      item: '#bank-all-grid .bank-cell',
      skip: 'input',
      onDrop(cell) {
        const b = bank();
        b.order = [...cell.parentNode.children].map(c => c.dataset.slug).filter(Boolean);
        saveLayout(b);
        if (S.allSort !== 'yours') { S.allSort = 'yours'; saveUi(); }   // it's your own order now
      },
      onEnd({ dropped, stale }) { if (dropped || stale) renderBank(); },
    });
    // A bank plan's lines, dragged into your own order: what's on screen, top
    // first, then whatever your order held that isn't on screen now.
    stepDrag = sortable({
      root: $('view-goals'),
      item: '.steps.movable > .step',
      skip: 'a, button, input, select',
      onDrop(step) {
        const card = step.closest('[data-goal]');
        if (!card) return;
        const shown = [...new Set([...step.parentNode.children].map(el => el.dataset.step).filter(Boolean))];
        updateGoal(card.dataset.goal, g => { g.order = [...shown, ...(Array.isArray(g.order) ? g.order : []).filter(id => !shown.includes(id))]; });
      },
      onEnd({ dropped, stale }) { if (dropped || stale) renderGoals(); },
    });
    // (v3.3) A goal dragged by its head (its name and title: not a button or a link) to a new place. The
    // goals shown take the order they're in on the page; one a filter leaves out keeps its place.
    goalDrag = sortable({
      root: $('view-goals'),
      item: '#goals-list > .goal',
      skip: '.goal > :not(.goal-head), a, button, input, select, label, textarea',
      ghost: card => card.querySelector('.goal-head'),
      onDrop(card) {
        placeShown([...card.parentNode.children].filter(el => el.matches('.goal[data-goal]')).map(el => el.dataset.goal));
      },
      onEnd({ dropped, stale }) { if (dropped || stale) renderGoals(); },
    });
    // Screenshots dropped or pasted on the Bank tab. A file dropped anywhere else
    // on the page is ignored rather than opened in place of the tool.
    const onBank = () => S.tab === 'bank' && !$('view-bank')?.hidden && S.account;
    const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
    // (a Slayer goal's card on the Goals tab takes screenshots of loot)
    const lootCard = e => (S.tab === 'goals' && !$('view-goals')?.hidden ? e.target.closest?.('.slayer-goal') : null);
    document.addEventListener('dragover', e => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      const zone = onBank() && e.target.closest?.('#view-bank');
      const card = lootCard(e);
      e.dataTransfer.dropEffect = zone || card ? 'copy' : 'none';
      $('bank-shots')?.firstElementChild?.classList.toggle('drag', !!zone);
      for (const c of document.querySelectorAll('.slayer-goal.drag')) if (c !== card) c.classList.remove('drag');
      card?.classList.add('drag');
    });
    document.addEventListener('dragleave', e => {
      if (e.relatedTarget) return;
      $('bank-shots')?.firstElementChild?.classList.remove('drag');
      for (const c of document.querySelectorAll('.slayer-goal.drag')) c.classList.remove('drag');
    });
    document.addEventListener('drop', e => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      $('bank-shots')?.firstElementChild?.classList.remove('drag');
      for (const c of document.querySelectorAll('.slayer-goal.drag')) c.classList.remove('drag');
      if (onBank() && e.target.closest?.('#view-bank')) readShots(e.dataTransfer.files);
      const card = lootCard(e);
      if (card) npc().readLoot(card.dataset.goal, e.dataTransfer.files);
    });
    document.addEventListener('paste', e => {
      if (!onBank() || e.target.closest?.('input, textarea')) return;
      const files = [...(e.clipboardData?.files || [])].filter(f => /^image\//.test(f.type));
      if (files.length) { e.preventDefault(); readShots(files); }
    });
  }

  function onSubmit(e) {
    const form = e.target.closest('[data-form]');
    if (!form) return;
    e.preventDefault();
    if (form.dataset.form === 'account') { if (setAccount(form.account.value)) render(S.tab); }
    if (form.dataset.form === 'bank-add') { addToBank(form); return; }
    if (form.dataset.form === 'goal') {
      // (Slayer: a monster and its kills)
      if (S.newGoal.skill === SLAYER.key) {
        const r = npc().addFromForm(form);
        if (r.problem) showMsg('goals-msg', r.problem, 'error');
        else { showMsg('goals-msg', ''); showNewGoal(r.goal.id); }
      } else addGoal(form.value.value);
    }
    if (form.dataset.form === 'edit-goal') {
      const id = form.closest('[data-goal]')?.dataset.goal;
      const goal = goals().find(g => g.id === id);
      if (isSlayerGoal(goal)) { npc().saveEdit(goal, form); renderGoals(); } else saveGoalEdit(id, form.value.value);
    }
    npc().onSubmit(form);
  }

  function onClick(e) {
    const t = e.target;
    // (v3.2: an item's name, anywhere: its line on the Prices tab)
    const pgo = t.closest('[data-price-go]');
    if (pgo) { e.preventDefault(); goPrice(pgo.dataset.priceGo); return; }
    // (the NPCs tab, and a Slayer goal's own buttons)
    if (npc().onClick(e, t.closest('[data-act]'))) return;
    const nskill = t.closest('[data-nskill]');
    if (nskill) { S.newGoal.skill = nskill.dataset.nskill; saveUi(); showMsg('goals-msg', ''); renderNewGoal(); return; }
    const ntype = t.closest('[data-ntype]');
    if (ntype) { S.newGoal.type = ntype.dataset.ntype; saveUi(); showMsg('goals-msg', ''); renderNewGoal(); return; }
    const bskill = t.closest('[data-bskill]');
    if (bskill) {
      const k = bskill.dataset.bskill;
      // (a tab, on the Prices tab, ends a search: that's what it lists again)
      if (S.tab === 'prices') { if (k === 'all' || PRICE_VIEWS.includes(k)) { S.priceView = k; S.priceQ = ''; } } else if (k === 'all' || BANK_VIEWS.includes(k)) S.bankView = k;
      saveUi();
      render(S.tab);
      if (S.tab === 'prices') wantPriceView();
      return;
    }
    const allsort = t.closest('[data-allsort]');
    if (allsort) { S.allSort = ['value', 'skill'].includes(allsort.dataset.allsort) ? allsort.dataset.allsort : 'yours'; saveUi(); renderBank(); return; }
    const priceSort = t.closest('[data-price-sort]');
    if (priceSort) { S.priceSort = sortFrom(priceSort, priceSort.dataset.priceSort); saveUi(); renderPrices(); return; }
    const pall = t.closest('[data-pall]');
    if (pall) {
      const groups = shownPriceGroups();
      const gi = pall.dataset.pgroup;
      const items = priceItems(gi != null ? groups[Number(gi)]?.items || [] : groups.flatMap(g => g.items), { untradeable: true });
      prices.setSource(items, pall.dataset.pall);
      renderPrices();
      return;
    }
    const gshow = t.closest('[data-gshow]');
    if (gshow) { S.show = gshow.dataset.gshow; saveUi(); renderGoals(); return; }
    const gonly = t.closest('[data-gonly]');
    if (gonly) {
      const k = gonly.dataset.gonly;
      // (v3.3.1: one at a time, it's that skill alone, or, clicked again, every goal)
      if (S.onlyOne) S.only = S.only.has(k) ? new Set() : new Set([k]);
      else if (S.only.has(k)) S.only.delete(k); else S.only.add(k);
      saveUi(); renderGoals(); return;
    }
    const psort = t.closest('[data-tsort-plan]');
    if (psort) { S.sort = sortFrom(psort, psort.dataset.tsortPlan); saveUi(); renderGoals(); return; }
    const card = t.closest('[data-goal]');
    const etype = t.closest('[data-etype]');
    if (etype && S.editing) { S.editing = { id: S.editing.id, type: etype.dataset.etype }; renderGoals(); return; }
    const tgroup = t.closest('[data-tgroup]');
    if (tgroup && card) {
      const skill = goals().find(g => g.id === card.dataset.goal)?.skill;
      // (and ends a search: the group is what shows again)
      if (skill) { S.tgroup = { ...S.tgroup, [skill]: tgroup.dataset.tgroup }; delete S.search[card.dataset.goal]; saveUi(); renderGoals(); }
      return;
    }
    const first = t.closest('[data-first]');
    if (first && card) {
      const id = first.dataset.first;
      updateGoal(card.dataset.goal, g => { g.order = [id, ...(Array.isArray(g.order) ? g.order : []).filter(x => x !== id)]; });
      renderGoals();
      return;
    }
    const methodRow = t.closest('tr[data-method]');
    if (card && methodRow && !t.closest('input, a')) {
      // (a row you'd unticked is ticked again: you're training with it)
      const id = methodRow.dataset.method;
      updateGoal(card.dataset.goal, g => {
        g.fillId = id;
        if (g.excluded?.includes(id)) g.excluded = g.excluded.filter(x => x !== id);
      });
      renderGoals();
      return;
    }
    const act = t.closest('[data-act]');
    if (!act) return;
    switch (act.dataset.act) {
      case 'refresh-xp': S.goalErr = {}; loadProfile({ force: true }); break;
      case 'goal-top':
      case 'goal-bottom': {
        // (v3.3.1) followed to where it went: its name at the top of the window (below the tabs), lit for a
        // moment. (Up to v3.3.0 the page went to the nearest end of the goal: with its plan open, the middle
        // of its plan, the goal's name out of sight.)
        const id = card.dataset.goal;
        moveGoalTo(id, act.dataset.act === 'goal-top' ? 'top' : 'bottom');
        S.lit = { id, at: Date.now() };
        renderGoals();
        document.querySelector(`#goals-list > .goal[data-goal="${CSS.escape(id)}"] > .goal-head`)?.scrollIntoView({ block: 'start' });
        break;
      }
      case 'goal-up':
      case 'goal-down': {
        moveGoal(card.dataset.goal, act.dataset.act === 'goal-up' ? -1 : 1);
        renderGoals();
        // keep the button under the keyboard, so pressing again keeps moving it
        document.querySelector(`[data-goal="${card.dataset.goal}"] [data-act="${act.dataset.act}"]:not([disabled])`)?.focus({ preventScroll: true });
        // (v3.3.1: its head in view, the buttons with it, not the nearest end of a plan that may be open)
        document.querySelector(`#goals-list > .goal[data-goal="${CSS.escape(card.dataset.goal)}"] > .goal-head`)?.scrollIntoView({ block: 'nearest' });
        break;
      }
      case 'open-all':
      case 'close-all':
        for (const id of S.visible) {
          if (act.dataset.act === 'open-all') S.open.add(id); else S.open.delete(id);
        }
        saveUi(); renderGoals();
        break;
      case 'show-all-goals': S.show = 'all'; S.only.clear(); saveUi(); renderGoals(); break;
      case 'gonly-clear': S.only.clear(); saveUi(); renderGoals(); break;
      case 'toggle-plan': {
        const id = card.dataset.goal;
        if (S.open.has(id)) S.open.delete(id); else S.open.add(id);
        saveUi(); renderGoals();
        break;
      }
      case 'remove-goal':
        if (!act.dataset.armed) { arm(act); break; }
        saveGoals(goals().filter(g => g.id !== card.dataset.goal));
        S.open.delete(card.dataset.goal); S.tableOff.delete(card.dataset.goal); saveUi();
        if (S.editing?.id === card.dataset.goal) S.editing = null;
        renderGoals();
        break;
      case 'edit-goal': {
        const g = goals().find(x => x.id === card.dataset.goal);
        S.editing = !g || S.editing?.id === g.id ? null : { id: g.id, type: g.type };
        renderGoals();
        if (S.editing) {
          const input = document.querySelector(`[data-goal="${g.id}"] [data-form="edit-goal"] [name="value"]`);
          input?.focus({ preventScroll: true });
          input?.select();
        }
        break;
      }
      case 'edit-cancel': S.editing = null; renderGoals(); break;
      case 'table-toggle': {
        const id = card.dataset.goal;
        if (S.tableOff.has(id)) S.tableOff.delete(id); else S.tableOff.add(id);
        saveUi(); renderGoals();
        break;
      }
      case 'tables-off':
      case 'tables-on':
        // (the plans that are open: one opened later still has its table)
        for (const id of S.visible) {
          if (!S.open.has(id)) continue;
          if (act.dataset.act === 'tables-off') S.tableOff.add(id); else S.tableOff.delete(id);
        }
        saveUi(); renderGoals();
        break;
      case 'combat-reset': updateGoal(card.dataset.goal, g => { delete g.what; }); renderGoals(); break;
      // (a Total level goal's line: a level goal for that skill, or your one level goal in it raised to it)
      case 'total-set': {
        const key = act.dataset.skill, level = Number(act.dataset.level);
        if (!SKILL_BY_KEY.has(key) || !(level >= 2 && level <= MAX_LEVEL)) break;
        const list = goals();
        const own = list.filter(g => g.skill === key);
        if (own.length === 1 && own[0].type === 'level') {
          own[0].value = Math.max(own[0].value, level);
          saveGoals(list);
        } else if (own.length === 1) {
          // (v3.2: a rank, top % or XP goal made that level: it's the one goal in that skill)
          const g0 = own[0];
          g0.type = 'level'; g0.value = level; delete g0.target;
          saveGoals(list);
        } else {
          const cur = currentOf(key);
          list.push({ id: newId(), skill: key, type: 'level', value: level, created: Date.now(), startXp10: cur ? cur.xp10 : null });
          saveGoals(list);
        }
        renderGoals();
        break;
      }
      case 'to-bank':
        if (BANK_GROUPS[act.dataset.skill]) { S.bankView = act.dataset.skill; saveUi(); }
        ctx.goTab('bank');
        break;
      case 'bank-prices': prices.want(Object.keys(bank().items), { force: true }); renderBankHead(); break;
      case 'mix-clear':
        updateGoal(card.dataset.goal, g => { delete g.mix; });
        renderGoals();
        break;
      case 'order-reset':
        updateGoal(card.dataset.goal, g => { delete g.order; });
        renderGoals();
        break;
      case 'order-more':
        if (S.more.has(card.dataset.goal)) S.more.delete(card.dataset.goal); else S.more.add(card.dataset.goal);
        renderGoals();
        break;
      case 'bank-order-reset': {
        const b = bank();
        delete b.order;
        saveLayout(b);
        renderBank();
        break;
      }
      case 'shots-pick': pickScreenshots(); break;
      case 'shots-apply': applyShots(); break;
      case 'shots-discard': S.shots = null; renderShots(); break;
      case 'bank-clear':
        if (!act.dataset.armed) { act.dataset.armed = '1'; act.textContent = 'Click again to clear'; break; }
        saveBank({ items: {} });
        renderBank();
        break;
      // (what's found, or Other's: the items listed; a skill's tab: everything its plans price)
      case 'price-sort-reset': S.priceSort = null; saveUi(); renderPrices(); break;
      case 'prices-refresh': prices.want(foundItems(S.priceQ) || [OTHER, GEAR, RARES].includes(S.priceView) ? shownPriceGroups().flatMap(g => g.items) : skillItems(S.priceView), { force: true }); renderPrices(); break;
      case 'prices-stop': prices.stop(); renderPrices(); break;
      case 'pq-only': S.pqOnly = !S.pqOnly; S.priceQ = ''; render('prices'); if (S.pqOnly) prices.want(pqItems(), { all: true }); break;
      case 'pq-clear': S.pq = {}; savePq(); S.pqOnly = false; render('prices'); break;
    }
  }

  function onChange(e) {
    const t = e.target;
    if (t.id === 'shots-file') { if (t.files?.length) readShots(t.files); t.value = ''; return; }      // (emptied: the same file can be picked again)
    if (t.id === 'loot-file') { if (t.files?.length) npc().onLootFiles(t.files); t.value = ''; return; }
    if (npc().onChange(e)) return;
    // The screenshot review: what's ticked, and which look-alike a line is.
    if (S.shots?.rows) {
      if (t.id === 'shots-clear') { S.shots.clear = t.checked; return; }
      if (t.id === 'shots-same') { S.shots.hideSame = t.checked; renderShots(); return; }
      if (t.id === 'shots-order') { S.shots.keepOrder = !t.checked; return; }
      if (t.dataset.shot) { if (t.checked) S.shots.off.delete(t.dataset.shot); else S.shots.off.add(t.dataset.shot); return; }
      if (t.dataset.shotAs) {
        if (reader.B.pickRow(S.shots.rows, t.dataset.shotAs, t.value, [UNID_HERBS.item])) { render('bank'); }
        return;
      }
    }
    // (a level in a Combat level goal's calculator, entered or left: shown as it's counted, 1 to 99)
    // (v3.3) a cost typed on Prices: the quantity it buys at the item's price, rounded down
    if (t.dataset.pcost) {
      const slug = t.dataset.pcost, p = prices.gp(slug);
      const cost = t.value.trim() === '' ? 0 : parseAmount(t.value);
      if (cost == null || (cost > 0 && !(p > 0))) { t.classList.add('bad'); return; }
      const n = cost > 0 ? Math.floor(cost / p) : 0;
      if (n > 0) S.pq[slug] = n; else delete S.pq[slug];
      savePq();
      showPq(slug, { qty: true });
      t.value = n && p != null ? fmt(Math.round(n * p)) : '';
      return;
    }
    if (t.dataset.gcalc) {
      const id = t.closest('[data-goal]')?.dataset.goal;
      const L = combatLevels(goals().find(g => g.id === id));
      if (L) t.value = L[t.dataset.gcalc];
      return;
    }
    if (t.dataset.topt === 'hideOff') { S.hideOff = t.checked; saveUi(); renderGoals(); return; }
    // (v3.3.1) the skills' buttons one at a time: of several on, the last one turned on stays
    if (t.dataset.gonlyOne) {
      S.onlyOne = t.checked;
      if (S.onlyOne && S.only.size > 1) S.only = new Set([[...S.only].pop()]);
      saveUi(); renderGoals(); return;
    }
    const card = t.closest('[data-goal]');
    // (a Total level goal's skills: untick one you won't train)
    if (card && t.dataset.totalSkip) {
      updateGoal(card.dataset.goal, g => {
        const skip = new Set(g.skip || []);
        if (t.checked) skip.delete(t.dataset.totalSkip); else skip.add(t.dataset.totalSkip);
        if (skip.size) g.skip = [...skip]; else delete g.skip;
      });
      renderGoals();
      return;
    }
    // (v3.4) a Ranged goal's ammo
    if (card && t.dataset.ammo) {
      const f = t.dataset.ammo;
      updateGoal(card.dataset.goal, g => {
        const a = { ...(g.ammo || {}) };
        if (f === 'kind') { a.kind = t.value; delete a.ammo; delete a.bow; }
        if (f === 'ammo') a.ammo = t.value;
        // (arrows that bow can't fire make way for the best it can)
        if (f === 'bow') { a.bow = t.value; if (a.ammo && !gearOf({ kind: 'arrows', ammo: a.ammo, bow: a.bow })?.fits) delete a.ammo; }
        if (f === 'fight') { if (t.value === 'accurate') a.fight = 'accurate'; else delete a.fight; }
        if (f === 'pickUp') { if (t.checked) delete a.pickUp; else a.pickUp = false; }
        if (f === 'bonus') { const n = Math.round(Number(String(t.value).replace(/[^\d.+-]/g, '')) || 0); if (n) a.bonus = Math.max(-500, Math.min(500, n)); else delete a.bonus; }
        if (Object.keys(a).length) g.ammo = a; else delete g.ammo;
      });
      renderGoals();
      return;
    }
    if (card && t.dataset.gopt) {
      const id = card.dataset.goal;
      updateGoal(id, g => {
        if (t.dataset.gopt === 'useBank') g.useBank = t.checked;
        if (t.dataset.gopt === 'assume') g.assume = t.checked ? (DEFAULT_ASSUME[g.skill] || []) : [];
        if (t.dataset.gopt === 'fill') g.fillId = t.value;
        if (t.dataset.gopt === 'roundUp') g.roundUp = t.checked;
        if (t.dataset.gopt === 'place') g.place = t.value;
        if (t.dataset.gopt === 'opt') {
          // a tick box that's on, or anything but the first of a list; the rest isn't kept
          const c = (CHOICES[g.skill] || []).find(x => x.id === t.dataset.opt);
          const v = !c ? null : c.options ? (c.options.slice(1).some(o => o.id === t.value) ? t.value : null) : (t.checked || null);
          const opts = { ...(g.opts || {}) };
          if (v) opts[t.dataset.opt] = v; else delete opts[t.dataset.opt];
          if (Object.keys(opts).length) g.opts = opts; else delete g.opts;
        }
      });
      renderGoals();
      return;
    }
    if (card && t.dataset.mix) {
      const n = parseAmount(t.value);
      if (n == null) { t.classList.add('bad'); return; }
      t.classList.remove('bad');
      updateGoal(card.dataset.goal, g => {
        g.mix = { ...(g.mix || {}) };
        if (n > 0) g.mix[t.dataset.mix] = n; else delete g.mix[t.dataset.mix];
        if (!Object.keys(g.mix).length) delete g.mix;
      });
      entered(renderGoals);
      return;
    }
    if (card && t.dataset.use) {
      updateGoal(card.dataset.goal, g => {
        const set = new Set(g.excluded || []);
        if (t.checked) set.delete(t.dataset.use); else set.add(t.dataset.use);
        g.excluded = [...set];
      });
      renderGoals();
      return;
    }
    if (t.dataset.bank) {
      const n = parseAmount(t.value);
      if (n == null) { t.classList.add('bad'); return; }
      t.classList.remove('bad');
      const b = bank();
      if (n > 0) b.items[t.dataset.bank] = n; else delete b.items[t.dataset.bank];
      saveBank(b);
      t.value = n ? fmt(n) : '';
      onInput(e);
      renderBankHead();
      if (n > 0) prices.want([t.dataset.bank]);
      return;
    }
    if (t.dataset.price) {
      const v = t.value.trim() === '' ? null : parseAmount(t.value);
      if (v === undefined || (t.value.trim() !== '' && v == null)) { t.classList.add('bad'); return; }
      t.classList.remove('bad');
      prices.setOverride(t.dataset.price, v);
      entered(renderPrices);
      return;
    }
    if (t.dataset.psrc) {
      const slug = t.dataset.psrc;
      if (t.value === 'mine' && prices.overrides[slug] == null) {     // nothing typed in yet: type it first
        renderPrices();
        document.querySelector(`[data-price="${slug}"]`)?.focus();
        return;
      }
      prices.setSource(slug, t.value);
      renderPrices();
      return;
    }
  }

  // Live value next to a bank amount while typing.
  let foundTimer = null;
  function onInput(e) {
    const t = e.target;
    if (npc().onInput(e)) return;
    // (v3.1) The Prices tab's search: only the lists are redrawn as you type. A
    // few items found have their prices looked up once you stop.
    // (v3.2) how many of an item you want: its cost and your list's total, as you type
    if (t.dataset.pq) {
      const n = parseAmount(t.value);
      if (n == null) { t.classList.add('bad'); return; }
      t.classList.remove('bad');
      if (n > 0) S.pq[t.dataset.pq] = n; else delete S.pq[t.dataset.pq];
      savePq();
      showPq(t.dataset.pq);
      return;
    }
    if (t.dataset.priceQ) {
      const was = !!foundItems(S.priceQ);
      S.priceQ = t.value;
      S.priceHl = null;
      // (a search begun or ended: the whole tab, which says what its buttons are for; else just its lists)
      if (was !== !!foundItems(S.priceQ)) render('prices'); else renderPricesBody();
      clearTimeout(foundTimer);
      foundTimer = setTimeout(() => { const f = foundItems(S.priceQ); if (f && f.length <= 12) prices.want(f, { all: true }); }, 700);
      return;
    }
    // (what's typed to add an item survives a redraw)
    if (t.dataset.addQ) { S.addQ = t.value; return; }
    if (t.dataset.addN) { S.addN = t.value; return; }
    // (what's typed into a goal being changed survives a redraw)
    if (S.editing && t.name === 'value' && t.closest('[data-form="edit-goal"]')) { S.editing.draft = t.value; return; }
    if (t.dataset.search) {
      const card = t.closest('[data-goal]');
      if (card) { S.search[card.dataset.goal] = t.value; applySearch(card); }
      return;
    }
    if (t.dataset.gcalc) {
      const card = t.closest('[data-goal]');
      const v = parseInt(t.value, 10);
      if (card && Number.isFinite(v)) {
        const key = t.dataset.gcalc;
        const level = Math.min(MAX_LEVEL, Math.max(key === 'hitpoints' ? 10 : 1, v));
        // (kept with the goal: a what-if stays until it's reset. Typed back to what it started from, there's nothing to keep)
        updateGoal(card.dataset.goal, g => {
          const what = { ...(g.what || {}) };
          if (level === combatNow()?.goal[key]) delete what[key];
          else what[key] = level;
          if (Object.keys(what).length) g.what = what; else delete g.what;
        });
        renderCombatLive(card);
      }
      return;
    }
    if (!t.dataset.bank) return;
    const n = parseAmount(t.value);
    const p = prices.gp(t.dataset.bank);
    const out = document.querySelector(`[data-bv="${t.dataset.bank}"]`);
    if (out) out.textContent = n && p != null ? gpShort(n * p) : '';
    t.closest('.bank-cell')?.classList.toggle('has', !!n);
  }

  // ── What the rest of the app asks for ───────────────────────────────────
  // A small goal line for a Lookup tile, when that player is the one planned for.
  function tileGoal(profile, skill) {
    if (!profile || !S.account || profile.safe !== safe()) return '';
    // (the Overall tile: a Total level goal, v3.1)
    if (skill.id === 0) {
      const t = goals().find(isTotalGoal);
      const now = profile.stats[0]?.level;
      if (!t || now == null) return '';
      let text;
      if (t.type === 'xp') {
        const st = profile.stats[0];
        const left = Math.max(0, Math.ceil((t.value * 10 - (st.xp10 ?? st.xp * 10)) / 10));
        text = `Goal ${gpShort(t.value)} XP${left ? ` · ${gpShort(left)} XP to go` : ' ✓'}`;
      } else if (t.type === 'rank' || t.type === 'top') {
        // (v3.3.2) the levels to pass whoever holds that rank (Overall ranks by total level first), as its plan on the
        // Goals tab worked them out and keeps them with the goal: never looked up from here; ✓ once the rank is yours
        const c = t.target, rank = profile.stats[0]?.rank;
        const left = !c?.rank ? null : rank && rank <= c.rank ? 0 : c.level != null ? Math.max(0, Math.min(MAX_TOTAL, c.level + 1) - now) : null;
        text = `${t.type === 'rank' ? `Goal rank ${fmt(t.value)}` : `Goal top ${formatPercent(t.value)}%`}${left == null ? '' : left ? ` · ${fmt(left)} level${left === 1 ? '' : 's'} to go` : ' ✓'}`;
      } else {
        const left = Math.max(0, t.value - now);
        text = `Goal ${fmt(t.value)}${left ? ` · ${fmt(left)} level${left === 1 ? '' : 's'} to go` : ' ✓'}`;
      }
      return goalLine(t, text);
    }
    const g = goals().find(x => x.skill === skill.key);
    if (!g) return '';
    const st = profile.stats[skill.id];
    const cur = st ? st.xp10 ?? st.xp * 10 : null;
    let text;
    if (g.type === 'level' || g.type === 'xp') {
      const target = goalTargetXp10(g);
      const left = cur == null ? null : Math.max(0, target - cur);
      text = `${g.type === 'level' ? `Goal ${g.value}` : `Goal ${gpShort(g.value)} XP`}${left != null ? (left ? ` · ${gpShort(Math.ceil(left / 10))} XP to go` : ' ✓') : ''}`;
    } else {
      // (v3.3.2) a rank or top % goal: the XP to pass whoever holds that rank, as its plan worked it out; ✓ once the
      // rank is yours
      const aim = st ? keptAim(g, st) : null;
      const left = !aim ? null : aim.reached ? 0 : Math.max(0, aim.xp10 - cur);
      text = `${g.type === 'rank' ? `Goal rank ${fmt(g.value)}` : `Goal top ${formatPercent(g.value)}%`}${left == null ? '' : left ? ` · ${gpShort(Math.ceil(left / 10))} XP to go` : ' ✓'}`;
    }
    return goalLine(g, text);
  }
  // (v3.3.2) A rank or top % goal's aim for a tile: what its plan on the Goals tab worked out and keeps with the
  // goal (whoever held the rank it takes, and the XP that passes them), never looked up from here: reached once
  // the tile's rank is that or better; null before its plan has worked it out.
  function keptAim(g, st) {
    const c = g.target;
    if (!c?.rank) return null;
    if (st.rank && st.rank <= c.rank) return { reached: true };
    return c.xp10 != null ? { xp10: c.xp10 } : null;
  }
  // (v3.3) The line opens the goal on the Goals tab (app.js: data-goal-go).
  const goalLine = (g, text) => `<a class="goal-line" href="#goals" data-goal-go="${esc(g.id)}" draggable="false" title="Go to this goal on the Goals tab">${esc(text)}</a>`;

  const LIT_MS = 1800;
  // (v3.3) A goal on the Goals tab, its plan open and in view whatever the filters (from a Lookup tile's goal
  // line, a monster's page, a goal just added), lit for a moment.
  function goToGoal(id) {
    const g = goals().find(x => x.id === id);
    if (!g) return false;
    S.open.add(id);
    // (v3.3.2: one at a time, that skill's goals in place of the one shown)
    if (S.only.size && !S.only.has(g.skill)) { if (S.onlyOne) S.only = new Set([g.skill]); else S.only.add(g.skill); }
    if (S.show !== 'all') S.show = 'all';
    saveUi();
    S.lit = { id, at: Date.now() };
    S.scrollGoal = { id, at: Date.now() };
    // (from another tab, Lookup's too: the Goals tab, drawn as it opens; renderGoals scrolls to it)
    if (S.tab !== 'goals' || $('view-goals')?.hidden) ctx.goTab('goals'); else renderGoals();
    return true;
  }
  // (v3.3.2) A goal just set, at the bottom of your goals: shown with its skill's alone (One at a time, that
  // skill's button on), scrolled to and lit. From the new goal's form, or a monster's page on NPCs.
  function showNewGoal(id) {
    const g = goals().find(x => x.id === id);
    if (!g) return false;
    S.onlyOne = true;
    S.only = new Set([g.skill]);
    if (S.show === 'done') S.show = 'all';
    saveUi();
    S.lit = { id, at: Date.now() };
    S.scrollGoal = { id, at: Date.now() };
    if (S.tab !== 'goals' || $('view-goals')?.hidden) ctx.goTab('goals'); else renderGoals();
    return true;
  }

  // The tile's bar, once that skill has a goal: how far along the goal is (as on
  // the Goals tab: since you set it), in place of the bar to the next level.
  function tileGoalBar(profile, skill) {
    if (!profile || !S.account || profile.safe !== safe()) return '';
    const g = goals().find(x => x.skill === skill.key);
    const st = profile.stats[skill.id];
    if (!g || !st) return '';
    const cur = st.xp10 ?? st.xp * 10;
    // (a rank or top % goal: the XP to pass whoever holds that rank, as its plan worked it out; v3.3.2: reached
    // once the rank is yours, as the goal line has it)
    const aim = g.type === 'level' || g.type === 'xp' ? { xp10: goalTargetXp10(g) } : keptAim(g, st);
    if (!aim) return '';
    const target = aim.reached ? cur : aim.xp10;
    const reached = !!aim.reached || cur >= target;
    const start = g.startXp10 ?? cur;
    const p = reached ? 100 : pct(cur - start, target - start);
    const left = Math.max(0, Math.ceil((target - cur) / 10));
    const tip = reached ? 'Goal reached' : `${p.toFixed(1)}% of the way to your goal since you set it (${fmt(left)} XP to go)`;
    return `<div class="pbar goal-bar${reached ? ' maxed' : ''}" title="${esc(tip)}"><div style="width:${p.toFixed(1)}%"></div></div>`;
  }

  function summary() {
    const accounts = store.keys().filter(k => k.startsWith('goals.'));
    const count = accounts.reduce((a, k) => a + (store.get(k, []).length || 0), 0);
    const banks = store.keys().filter(k => k.startsWith('bank.')).length;
    return { goals: count, banks };
  }

  wire();
  return {
    render, show, rerender, tileGoal, tileGoalBar, summary, goToGoal,
    get account() { return S.account; },
    setAccount,
    reset() { S.account = null; S.profile = null; S.open.clear(); },
    // (the NPCs tab's address: #npcs, or #npcs/<monster>)
    get npcOpen() { return npc().open; },
    openNpc(id) { npc().showNpc(id); },
  };
}
