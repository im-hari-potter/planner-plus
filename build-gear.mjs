// The Gear tab's data (v3.5), read from Lost City's server (LostCityRS/Content, rev 274) by build-data.mjs:
// what each wearable item is worn in and adds, what it takes to wield, a weapon's attack styles, speed and
// special attack; the combat spells, prayers and potions; and how each monster attacks. Every number is the
// server's, and each rule is checked against the script it's from: a script that reads otherwise stops the
// build. RuneScape is (c) Jagex Ltd.
import { readdir } from 'node:fs/promises';

// What equip_get_bonuses sums over what you wear, in this order (the 13 numbers of an item's b).
export const BONUSES = ['stabattack', 'slashattack', 'crushattack', 'magicattack', 'rangeattack', 'stabdefence', 'slashdefence', 'crushdefence',
  'magicdefence', 'rangedefence', 'strengthbonus', 'prayerbonus', 'rangebonus'];
// The server's wear positions, as the Gear tab's slots.
const SLOTS = { hat: 'head', back: 'cape', front: 'neck', righthand: 'weapon', torso: 'body', lefthand: 'shield', legs: 'legs', hands: 'hands', feet: 'feet', ring: 'ring', quiver: 'ammo' };
const STYLE_OF = { style_melee_accurate: 'accurate', style_melee_aggressive: 'aggressive', style_melee_defensive: 'defensive', style_melee_controlled: 'controlled',
  style_ranged_accurate: 'accurate', style_ranged_rapid: 'rapid', style_ranged_longrange: 'longrange' };
const TYPE_OF = { stab_style: 'stab', slash_style: 'slash', crush_style: 'crush', ranged_style: 'ranged', magic_style: 'magic' };

// E: { scripts, readFile, readConfig, scriptBlocks, SERVER_OBJ, items, methods }
export async function gearItems(E) {
  const { scripts, readFile, readConfig, scriptBlocks, SERVER_OBJ, items, methods } = E;
  const text = p => readFile(scripts(p), 'utf8');
  const notes = [];
  const need = (src, re, what) => { const m = src.match(re); if (!m) throw new Error(`gear: ${what} reads differently now`); return m; };
  const files = (await readdir(scripts(''), { recursive: true })).map(f => f.replace(/\\/g, '/'));
  const allScripts = new Map();
  for (const f of files.filter(f => f.endsWith('.rs2'))) allScripts.set(f, await text(f));

  // ── What you wear adds: equip_get_bonuses, every worn item's params summed ──
  // (the quiver's Ranged strength only with nothing wielded, or arrows with a bow, bolts with a crossbow)
  const equip = scriptBlocks(await text('player/scripts/equip.rs2')).get('proc,equip_get_bonuses') || '';
  for (const b of BONUSES) need(equip, new RegExp(`\\$${b} = calc\\(\\$${b} \\+ oc_param\\(\\$obj, ${b}\\)\\);`), `the sum of ${b}`);
  need(equip, /if \(\$i ! \^wearpos_quiver\s*\| inv_getobj\(worn, \^wearpos_rhand\) = null\s*\| \(oc_category\(\$obj\) = arrows & oc_category\(inv_getobj\(worn, \^wearpos_rhand\)\) = weapon_bow\)\s*\| \(oc_category\(\$obj\) = bolts & oc_category\(inv_getobj\(worn, \^wearpos_rhand\)\) = weapon_crossbow\)\) \{\s*\$rangebonus = calc/, "the quiver's Ranged strength");
  const paramDefaults = await readConfig(scripts('skill_combat/configs/combat.param'));
  for (const b of BONUSES) if (Number(paramDefaults.get(b)?.props.default) !== 0) throw new Error(`gear: ${b} is ${paramDefaults.get(b)?.props.default} by default now`);
  const rateDefault = Number(paramDefaults.get('attackrate')?.props.default);
  if (rateDefault !== 4) throw new Error(`gear: a weapon's attack rate is ${rateDefault} ticks by default now`);

  // ── A weapon's styles: combat_style_table, the row its category picks (combat.rs2), named as the combat
  // tab its category shows (player_attackstyles.rs2: the button for each mode, and the words beside it) ──
  const combatRs = await text('skill_combat/scripts/combat.rs2');
  const pick = need(scriptBlocks(combatRs).get('proc,combat_get_weapon_style_data') || '', /switch_category\(oc_category\(\$weapon\)\) \{([^]*?)\n\}/, 'which style table a weapon has')[1];
  const tableOfCat = new Map();
  for (const [, cat, table] of pick.matchAll(/case (\w+) : return\((\w+)\);/g)) if (cat !== 'default') tableOfCat.set(cat, table);
  const tableDefault = need(pick, /case default : return\((\w+)\);/, 'the style table of what has none')[1];
  if (tableDefault !== 'weapon_unarmed_table' || tableOfCat.size < 14) throw new Error(`gear: ${tableOfCat.size} weapon categories, the rest ${tableDefault}`);
  const tabs = need(await text('skill_combat/scripts/player/player_attackstyles.rs2'), /switch_category \(oc_category\(\$obj\)\) \{([^]*?)\n\}/, 'which combat tab a weapon shows')[1];
  const tabOfCat = new Map();
  for (const [, cats, tab] of tabs.matchAll(/case ([\w, ]+?) : ~weapon_category_tab_attack\((\w+):preview/g)) for (const c of cats.split(/,\s*/)) tabOfCat.set(c, tab);
  if (!/case default : ~weapon_category_tab_attack_unarmed\(\$obj\);/.test(tabs)) throw new Error("gear: what's unarmed shows another tab now");
  const tableRows = await readConfig(scripts('skill_combat/configs/combat.dbrow'));
  const modesOf = table => {
    const row = tableRows.get(table);
    if (!row) throw new Error(`gear: no style table ${table}`);
    const styles = row.data.filter(([k]) => k === 'damagestyle').map(([, v]) => STYLE_OF[v.replace(/^\^/, '')]);
    const types = row.data.filter(([k]) => k === 'damagetype').map(([, v]) => TYPE_OF[v.replace(/^\^/, '')]);
    if (!styles.length || styles.length !== types.length || styles.some(s => !s) || types.some(t => !t)) throw new Error(`gear: can't read the styles of ${table}`);
    return styles.map((style, i) => ({ style, type: types[i] }));
  };
  // A combat tab's words: each text by the select button it's beside (the nearest above it, in the tab's own
  // coordinates: a layer's position added to what's in it)
  const tabWords = async tab => {
    const f = files.find(p => p.endsWith(`/${tab}.if`));
    if (!f) throw new Error(`gear: no interface ${tab}`);
    const blocks = await readConfig(scripts(f));
    const at = name => { const b = blocks.get(name); if (!b) return 0; return Number(b.props.y || 0) + (b.props.layer ? at(b.props.layer) : 0); };
    const buttons = [...blocks.values()].filter(b => b.props.buttontype === 'select' && /^eq,\d+$/.test(b.props.script1 || '') && !/auto/.test(b.name))
      .map(b => ({ mode: Number(b.props.script1.split(',')[1]), y: at(b.name) })).sort((a, b) => a.y - b.y);
    const words = buttons.map(() => []);
    for (const b of blocks.values()) {
      const t = b.props.text;
      if (b.props.type !== 'text' || !t || /^(Weapon:|%1|Choose Attack Style|Attack with|\(none set\)|Choose|Spell)$/.test(t) || /S P E C I A L/.test(t)) continue;
      const y = at(b.name);
      let k = -1;
      buttons.forEach((bt, i) => { if (bt.y <= y + 6) k = i; });
      if (k < 0) continue;
      words[k].push(t);
    }
    return buttons.map((bt, i) => ({ mode: bt.mode, name: words[i].find(w => !w.startsWith('(')), style: words[i].find(w => /^\((Accurate|Aggressive|Defensive|Controlled)\)$/.test(w))?.slice(1, -1).toLowerCase(),
      type: words[i].find(w => /^\((Stab|Slash|Crush)\)$/.test(w))?.slice(1, -1).toLowerCase() })).sort((a, b) => a.mode - b.mode);
  };
  const WEAPON_STYLES = {};               // table (as weapon_slash_table, without weapon_ and _table) -> { tab, modes: [{ name, style, type }] }
  const keyOf = table => table.replace(/^weapon_|_table$/g, '');
  const tableOfWeapon = cat => tableOfCat.get(cat) || tableDefault;
  for (const [cat, table] of [...tableOfCat, ['', tableDefault]]) {
    const key = keyOf(table);
    if (WEAPON_STYLES[key]) continue;
    const tab = cat ? tabOfCat.get(cat) : 'combat_unarmed';
    if (!tab) throw new Error(`gear: no combat tab for ${cat}`);
    const modes = modesOf(table), words = await tabWords(tab);
    if (words.length !== modes.length) throw new Error(`gear: ${tab} has ${words.length} buttons, ${table} ${modes.length} styles`);
    WEAPON_STYLES[key] = {
      tab: tab.replace(/^combat_/, ''),
      modes: modes.map((m, i) => {
        const w = words[i];
        if (!w.name) throw new Error(`gear: no name for style ${i} of ${tab}`);
        // (the words beside a button say the same as the table, where they say anything: Ranged's say only the name)
        if (w.style && w.style !== m.style) throw new Error(`gear: ${tab}'s ${w.name} says ${w.style}, ${table} ${m.style}`);
        if (w.type && w.type !== m.type) throw new Error(`gear: ${tab}'s ${w.name} says ${w.type}, ${table} ${m.type}`);
        return { name: w.name, ...m };
      }),
    };
  }
  // The bonus each style gives your effective levels (combat_get_damagestyle_bonuses): attack, strength, defence, ranged
  const bonusRows = need(combatRs, /\[proc,combat_get_damagestyle_bonuses\][^]*?switch_int\(\$damagestyle\) \{([^]*?)\n\}/, "the styles' bonuses")[1];
  const STYLE_BONUS = {};
  for (const [, st, a, s, d, r] of bonusRows.matchAll(/case \^(style_\w+) : return\((\d+), (\d+), (\d+), (\d+)\);/g)) {
    STYLE_BONUS[`${st.startsWith('style_ranged') ? 'ranged_' : 'melee_'}${STYLE_OF[st]}`] = [a, s, d, r].map(Number);
  }
  if (!/case default : return\(0, 0, 0, 0\);/.test(bonusRows) || Object.keys(STYLE_BONUS).length !== 6) throw new Error(`gear: the styles' bonuses are ${JSON.stringify(STYLE_BONUS)}`);
  STYLE_BONUS.ranged_rapid = [0, 0, 0, 0];     // (no case of its own: the default)

  // ── What it takes to wield: [opheld2,item] @levelrequire_…(levels, last_slot) in every script ──
  const LABELS = {
    levelrequire_attack: ['attack'], levelrequire_attack_caps: ['attack'], levelrequire_defence: ['defence'], levelrequire_defence_caps: ['defence'],
    levelrequire_ranged: ['ranged'], levelrequire_ranged_lower: ['ranged'], levelrequire_magic: ['magic'],
    levelrequire_magic_and_attack: ['magic', 'attack'], levelrequire_ranged_and_defence: ['ranged', 'defence'], levelrequire_magic_and_defence: ['magic', 'defence'],
    levelrequire_attack_and_strength: ['attack', 'strength'], levelrequire_defence_and_strength: ['defence+strength'],
    levelrequire_dragon_slayer_quest_defence: ['defence'], levelrequire_dragon_slayer_quest_ranged_and_defence: ['ranged', 'defence'],
    levelrequire_heroes_quest_attack: ['attack'], levelrequire_legends_quest_defence: ['defence'], levelrequire_zanaris_quest_attack: ['attack'],
    levelrequire_viking_quest_helm: ['defence'], levelrequire_regicide_quest_attack_strength: ['attack', 'strength'], levelrequire_iban_staff: [],
  };
  const QUEST_OF = { dragon_slayer: "Dragon Slayer", heroes: "Heroes' Quest", legends: "Legends' Quest", zanaris: 'Lost City', viking: 'The Fremennik Trials', regicide: 'Regicide' };
  const lr = await text('levelrequire/scripts/levelrequire.rs2');
  for (const label of Object.keys(LABELS)) if (!lr.includes(`[label,${label}]`)) throw new Error(`gear: no @${label}`);
  for (const [, label] of lr.matchAll(/^\[label,(levelrequire_\w+)\]/gm)) if (!LABELS[label]) throw new Error(`gear: a new wield check, @${label}: say what it takes`);
  need(lr, /\[label,levelrequire_iban_staff\][^]*?stat_base\(magic\) < 50[^]*?stat_base\(attack\) < 50/, "Iban's staff's levels");
  need(lr, /\[label,levelrequire_defence_and_strength\]\(int \$level, int \$slot\)\s*if \(stat_base\(strength\) < \$level \| stat_base\(defence\) < \$level\)/, 'Defence and Strength alike');
  const wieldOf = new Map();               // item -> { levels: { skill: level }, quest }
  for (const [f, src] of allScripts) {
    for (const [, obj, label, args] of src.matchAll(/^\[opheld2,(\w+)\]\s*@(levelrequire_\w+)\(([^)]*)\);/gm)) {
      const skills = LABELS[label];
      if (!skills) throw new Error(`gear: ${obj} (${f}) is wielded with @${label}, which this build doesn't know`);
      const vals = args.split(',').map(s => s.trim()).filter(a => a !== 'last_slot').map(Number);
      const levels = {};
      if (label === 'levelrequire_iban_staff') Object.assign(levels, { magic: 50, attack: 50 });
      else if (skills[0] === 'defence+strength') Object.assign(levels, { defence: vals[0], strength: vals[0] });
      else skills.forEach((sk, i) => { levels[sk] = vals[i]; });
      if (Object.values(levels).some(v => !(v >= 1))) throw new Error(`gear: can't read the levels ${obj} takes (${args})`);
      const q = label.match(/^levelrequire_(dragon_slayer|heroes|legends|zanaris|viking|regicide)_quest/)?.[1];
      if (wieldOf.has(obj)) throw new Error(`gear: ${obj} has two wield checks`);
      wieldOf.set(obj, { levels, ...(q ? { quest: QUEST_OF[q] } : {}) });
    }
  }

  // ── Ammo: what a bow or crossbow fires (player_ranged_check_ammo), and what's thrown ──
  const ranged = scriptBlocks(await text('skill_combat/scripts/player/player_ranged.rs2'));
  const check = ranged.get('proc,player_ranged_check_ammo') || '';
  need(check, /if \(\$weapon_cat ! weapon_bow & \$weapon_cat ! weapon_crossbow\) \{\s*return\(\$rhand\);/, 'a thrown weapon as its own ammo');
  need(check, /\(\$rhand ! ogre_bow & \$weapon_cat = weapon_bow & \$ammo_cat ! arrows\)/, 'arrows for a bow');
  need(check, /if \(\$weapon_cat = weapon_crossbow & \$ammo_cat ! bolts\)/, 'bolts for a crossbow');
  need(check, /\(\$rhand = ogre_bow & \$ammo_cat ! ogre_arrows\)/, 'ogre arrows for the ogre bow');
  need(check, /if \(oc_param\(\$ammo, levelrequire\) > oc_param\(\$rhand, levelrequire\)\)/, 'ammo held to its weapon');
  const RANGED_CATS = new Set(['weapon_bow', 'weapon_crossbow', 'weapon_thrown', 'weapon_javelin']);

  // ── Special attacks (player_special_attack.rs2 and specwep.rs2): the weapon's sa_energy, and what each does,
  // from its own script (player/specs). The bar holds ^sa_max_energy and fills ^sa_regen_amount each
  // ^sa_regen_interval ticks. ──
  const constText = await text('skill_combat/configs/combat.constant');
  const constant = name => Number(need(constText, new RegExp(`^\\^${name} = (\\d+)$`, 'm'), `^${name}`)[1]);
  const specBar = { max: constant('sa_max_energy'), regen: constant('sa_regen_amount'), every: constant('sa_regen_interval') };
  const dispatch = need(scriptBlocks(await text('skill_combat/scripts/player/player_special_attack.rs2')).get('label,player_special_attack') || '', /switch_obj\(\$weapon\) \{([^]*?)\n\}/, 'which special a weapon has')[1];
  const specLabel = new Map();
  for (const [, objs, label] of dispatch.matchAll(/case ([\w, ]+?) : @(\w+);/g)) for (const o of objs.split(/,\s*/)) specLabel.set(o, label);
  const spec = async name => { const f = files.find(p => p.endsWith(`/specs/scripts/${name}.rs2`)); if (!f) throw new Error(`gear: no ${name}`); return text(f); };
  const pct = (src, re, what) => { const m = need(src, re, what); return [Number(m[1]), Number(m[2])]; };
  // Each: hits (a special's hits on one monster; big monsters: bigHits), acc [num, den] on your attack roll,
  // max [num, den] on your max hit, or ranged: +levels in place of your effective Ranged for the max hit,
  // vs: the monster's defence it's rolled against (null: your style's), sure: no roll at all.
  const SPECIAL_HITS = {};
  {
    const dd = await spec('pvm_dragon_dagger');
    need(dd, /~pvm_dragon_dagger_spec_hit;\s*p_delay\(0\);\s*~pvm_dragon_dagger_spec_hit;/, "the dragon dagger's two hits");
    SPECIAL_HITS.pvm_dragon_dagger_sa = { hits: 2, max: pct(dd, /def_int \$maxhit = scale\((\d+), (\d+), %com_maxhit\);/, "the dragon dagger's max hit"),
      acc: pct(dd, /def_int \$attackroll = scale\((\d+), (\d+), ~player_attack_roll_specific\(%damagetype\)\);/, "the dragon dagger's accuracy"), vs: need(dd, /~npc_defence_roll_specific\(\^(\w+)_style\)/, "the dragon dagger's roll")[1] };
    const ls = await spec('pvm_dragon_longsword');
    need(ls, /def_int \$attack_roll = ~player_attack_roll_specific\(%damagetype\);/, "the dragon longsword's accuracy");
    SPECIAL_HITS.pvm_dragon_longsword_sa = { hits: 1, max: pct(ls, /def_int \$maxhit = scale\((\d+), (\d+), %com_maxhit\);/, "the dragon longsword's max hit"), acc: [1, 1], vs: need(ls, /~npc_defence_roll_specific\(\^(\w+)_style\)/, "the dragon longsword's roll")[1] };
    const mace = await spec('pvm_dragon_mace');
    SPECIAL_HITS.pvm_dragon_mace_sa = { hits: 1, max: pct(mace, /def_int \$maxhit = scale\((\d+), (\d+), %com_maxhit\);/, "the dragon mace's max hit"),
      acc: pct(mace, /def_int \$attack_roll = scale\((\d+), (\d+), ~player_attack_roll_specific\(%damagetype\)\);/, "the dragon mace's accuracy"), vs: need(mace, /~npc_defence_roll_specific\(\^(\w+)_style\)/, "the dragon mace's roll")[1] };
    const hal = await spec('pvm_dragon_halberd');
    need(hal, /~pvm_dragon_halberd_spec_hit\(100\);\s*if\(nc_size\(npc_type\) > 1\) \{\s*~pvm_dragon_halberd_spec_hit\(100\);/, "the dragon halberd's second hit on a big monster");
    need(hal, /def_int \$attackroll = scale\(\$scale, 100, ~player_attack_roll_specific\(%damagetype\)\);/, "the dragon halberd's accuracy");
    SPECIAL_HITS.pvm_dragon_halberd_sa = { hits: 1, bigHits: 2, max: pct(hal, /def_int \$maxhit = scale\((\d+), (\d+), %com_maxhit\);/, "the dragon halberd's max hit"), acc: [1, 1], vs: need(hal, /~npc_defence_roll_specific\(\^(\w+)_style\)/, "the dragon halberd's roll")[1] };
    const claws = await spec('pvm_rune_claws');
    need(claws, /if \(~player_npc_hit_roll\(%damagetype\) = true\)/, "the rune claws' roll");
    SPECIAL_HITS.pvm_rune_claws_sa = { hits: 1, max: pct(claws, /def_int \$maxhit = scale\((\d+), (\d+), %com_maxhit\);/, "the rune claws' max hit"), acc: [1, 1], vs: null };
    const msb = await spec('pvm_magic_shortbow');
    need(msb, /~pvm_magic_shortbow_spec_hit\(\$ammo, \$duration\);\s*~pvm_magic_shortbow_spec_hit\(\$ammo, \$duration2\);/, "the magic shortbow's two arrows");
    const plus = (src, what) => Number(need(src, /def_int \$combat_stat = ~combat_stat\(add\(stat\(ranged\), (\d+)\), oc_param\(\$ammo, rangebonus\)\);/, what)[1]);
    SPECIAL_HITS.pvm_magic_shortbow_sa = { hits: 2, ranged: plus(msb, "the magic shortbow's max hit"), acc: pct(msb, /def_int \$attackroll = scale\((\d+), (\d+), ~player_attack_roll_specific\(%damagetype\)\);/, "the magic shortbow's accuracy"), vs: need(msb, /~npc_defence_roll_specific\(\^(\w+)_style\)/, "the magic shortbow's roll")[1] };
    const mlb = await spec('pvm_magic_longbow');
    if (/hit_roll|attack_roll|attackroll|defence_roll|defenceroll/.test(mlb)) throw new Error('gear: the magic longbow special rolls to hit now');
    SPECIAL_HITS.pvm_magic_longbow_sa = { hits: 1, ranged: plus(mlb, "the magic longbow's max hit"), sure: true, vs: null };
    const axe = await spec('pvm_rune_thrownaxe');
    need(axe, /def_boolean \$hit = ~player_npc_hit_roll\(%damagetype\);/, "the rune thrownaxe's roll");
    SPECIAL_HITS.pvm_rune_thrownaxe_sa = { hits: 1, ranged: plus(axe, "the rune thrownaxe's max hit"), acc: [1, 1], vs: null, chain: 5 };
    const spear = await spec('pvm_dragon_spear');
    if (/randominc\(|npc_queue\(2/.test(spear)) throw new Error('gear: the dragon spear special does damage now');
    SPECIAL_HITS.pvm_dragon_spear_sa = { hits: 0, push: true };
    for (const [k, v] of Object.entries(SPECIAL_HITS)) if (v.max && !(v.max[0] > 0 && v.max[1] > 0)) throw new Error(`gear: ${k}'s max hit is ${v.max}`);
    if (SPECIAL_HITS.pvm_dragon_dagger_sa.vs !== 'slash' || SPECIAL_HITS.pvm_magic_shortbow_sa.vs !== 'ranged') throw new Error('gear: specials roll against other defences now');
  }
  // (two that boost you, from the combat tab's special bar itself: the dragon battleaxe's Rampage, Excalibur's Sanctuary)
  const bar = await text('skill_combat/scripts/player/specwep.rs2');
  need(bar, /if\(\$weapon = dragon_battleaxe\) \{[^]*?def_int \$drained_attack = calc\(stat\(attack\) \/ 10\);[^]*?stat_boost\(strength, calc\(10 \+ \(\$sum \/ 4\)\), 0\);/, "the dragon battleaxe's Rampage");
  need(bar, /if\(\$weapon = excalibur\) \{[^]*?stat_boost\(defence, (\d+), 0\);/, "Excalibur's boost");
  const excalibur = Number(bar.match(/if\(\$weapon = excalibur\) \{[^]*?stat_boost\(defence, (\d+), 0\);/)[1]);

  // ── The items ──
  // (v3.5: not what only the server's staff can have, as appearance.rs2 has it: a dagger with 255 of every bonus;
  // nor a dummy, a name the game keeps for an object no one gets)
  const staffOnly = new Set([...(await text('player/scripts/appearance.rs2')).matchAll(/staffmodlevel >= \d+ & inv_getobj\(worn, \^wearpos_rhand\) = (\w+)/g)].map(m => m[1]));
  if (!staffOnly.has('poisoned_dagger_p')) throw new Error('gear: appearance.rs2 no longer keeps the poisoned dagger(p) for staff');
  const EQUIPMENT = {};
  const oddWear = [];
  for (const [slug, b] of SERVER_OBJ) {
    const wp = b.props.wearpos;
    if (!wp || !items[slug] || b.props.certtemplate || staffOnly.has(slug) || /\bdummy$/i.test(b.props.name || '')) continue;
    const slot = SLOTS[wp];
    if (!slot) { oddWear.push(`${slug} (${wp})`); continue; }
    const bonus = BONUSES.map(k => Number(b.params[k] ?? 0));
    const cat = b.props.category || '';
    const e = { s: slot, b: bonus };
    if (bonus.every(v => v === 0)) delete e.b;
    if (slot === 'weapon') {
      e.w = keyOf(tableOfWeapon(cat));
      e.r = Number(b.params.attackrate ?? rateDefault);
      if (b.props.wearpos2 === 'lefthand' || b.props.wearpos3 === 'lefthand') e.two = 1;
      if (RANGED_CATS.has(cat)) {
        e.ranged = cat === 'weapon_bow' ? (slug === 'ogre_bow' ? 'ogre_arrows' : 'arrows') : cat === 'weapon_crossbow' ? 'bolts' : 'thrown';
        if (cat !== 'weapon_thrown' && cat !== 'weapon_javelin') e.power = Number(b.params.levelrequire ?? 0);
      }
      const label = specLabel.get(slug);
      if (label || b.params.specwep === '^true') {
        const energy = Number(b.params.sa_energy ?? paramDefaults.get('sa_energy')?.props.default);
        if (label) {
          if (!SPECIAL_HITS[label]) throw new Error(`gear: ${slug}'s special (@${label}) isn't read here`);
          e.spec = { energy, ...SPECIAL_HITS[label] };
        } else if (slug === 'dragon_battleaxe') e.spec = { energy, rampage: true };
        else if (slug === 'excalibur') e.spec = { energy, defence: excalibur };
        else notes.push(`gear: ${slug} has a special bar and no special this build reads`);
      }
    }
    if (slot === 'ammo' && /^(arrows|bolts|ogre_arrows)$/.test(cat)) { e.ammo = cat; e.power = Number(b.params.levelrequire ?? 0); }
    const w = wieldOf.get(slug);
    if (w) { e.need = w.levels; if (w.quest) e.quest = w.quest; }
    if (b.params.saradominitem === '^true' || b.params.saradominitem === '1') e.god = 'saradomin';
    if (b.params.zamorakitem === '^true' || b.params.zamorakitem === '1') e.god = 'zamorak';
    if (b.params.guthixitem === '^true' || b.params.guthixitem === '1') e.god = 'guthix';
    EQUIPMENT[slug] = e;
  }
  for (const k of specLabel.keys()) if (items[k] && !EQUIPMENT[k]?.spec) throw new Error(`gear: ${k} has a special and isn't counted as one`);
  const withNeeds = Object.values(EQUIPMENT).filter(e => e.need).length;
  notes.push(`gear: ${Object.keys(EQUIPMENT).length} items to wear (${withNeeds} with levels to wield, ${Object.values(EQUIPMENT).filter(e => e.quest).length} a quest), ${Object.keys(WEAPON_STYLES).length} kinds of weapon; specials: ${Object.keys(EQUIPMENT).filter(k => EQUIPMENT[k].spec).join(', ')}${oddWear.length ? `; worn where no slot is: ${oddWear.join(', ')}` : ''}`);
  const unwieldable = [...wieldOf.keys()].filter(k => SERVER_OBJ.get(k)?.props.wearpos && !EQUIPMENT[k] && items[k]);
  if (unwieldable.length) notes.push(`gear: wield checks for items not counted: ${unwieldable.join(', ')}`);

  // ── Prayers (skill_prayer: prayers.dbrow, their varps as prayer_deactivate_specific has them; what each
  // does to your levels: player_combat_stat.rs2's check_attack_prayer, check_strength_prayer, check_defence_prayer) ──
  const prayerRows = [...(await readConfig(scripts('skill_prayer/configs/prayers.dbrow'))).values()];
  const deact = scriptBlocks(await text('skill_prayer/scripts/prayer.rs2')).get('proc,prayer_deactivate_specific') || '';
  const varpOf = new Map([...deact.matchAll(/case \^(prayer_\w+) :\s*if \(%prayer(\d+) = \^true\)/g)].map(m => [m[1], Number(m[2])]));
  const stat = await text('skill_combat/scripts/player/player_combat_stat.rs2');
  const boosts = which => new Map([...need(stat, new RegExp(`\\[proc,check_${which}_prayer\\]\\(\\)\\(int\\)([^\\[]*)`), `the ${which} prayers`)[1].matchAll(/if \(%prayer(\d+) = \^true\) return \((\d+)\);/g)].map(m => [Number(m[1]), Number(m[2])]));
  const att = boosts('attack'), str = boosts('strength'), def = boosts('defence');
  const prot = need(stat, /\[proc,check_protect_prayer\][^]*?%prayer(\d+) = \^true\) return \(true\);[^]*?%prayer(\d+) = \^true\) return \(true\);[^]*?%prayer(\d+) = \^true\) return \(true\);/, 'the protect prayers');
  const protectOf = { [Number(prot[1])]: 'melee', [Number(prot[2])]: 'ranged', [Number(prot[3])]: 'magic' };
  need(stat, /if \(\(\$style = \^melee_style \| \$style = \^stab_style \| \$style = \^slash_style \| \$style = \^crush_style\) & %prayer(\d+) = \^true\)/, 'Protect from Melee');
  need(stat, /def_int \$effective_ranged = ~combat_effective_stat\(\$ranged_level, 100\); \/\/ no ranged prayers/, 'no Ranged prayers');
  need(stat, /def_int \$effective_magic = ~combat_effective_stat\(\$magic_level, 100\); \/\/ no magic prayers/, 'no Magic prayers');
  const PRAYERS = prayerRows.map(row => {
    const d = Object.fromEntries((row.data || []).map(([k, ...v]) => [k, v]));
    const key = d.prayer[0].replace(/^\^/, '');
    const varp = varpOf.get(key);
    if (varp == null) throw new Error(`gear: no varp for ${key}`);
    const p = { id: row.name.replace(/^prayer_/, ''), name: d.name[0], level: Number(d.level[0]) };
    if (att.has(varp)) p.attack = att.get(varp);
    if (str.has(varp)) p.strength = str.get(varp);
    if (def.has(varp)) p.defence = def.get(varp);
    if (protectOf[varp]) p.protect = protectOf[varp];
    return p;
  }).filter(p => p.attack || p.strength || p.defence || p.protect);
  if (PRAYERS.length !== 12) throw new Error(`gear: ${PRAYERS.length} combat prayers`);

  // ── Potions: the consume table's boosts to a combat level (stat_boost: + constant + level × percent / 100) ──
  const consume = [...(await readConfig(scripts('player/configs/consumption/consume_effects.dbrow'))).values()];
  const POTIONS = [];
  const COMBAT_STATS = new Set(['attack', 'strength', 'defence', 'ranged', 'magic']);
  for (const row of consume) {
    const ch = (row.data || []).filter(([k]) => k === 'stat_change').map(([, st, c, p]) => ({ st, c: Number(c), p: Number(p) }));
    const doses = (row.data || []).filter(([k]) => k === 'consumable').map(([, o]) => o);
    if (!ch.length || ch.some(x => x.c < 0 || x.p < 0 || !COMBAT_STATS.has(x.st)) || !doses.some(o => /^\ddose|^strength4$/.test(o))) continue;
    const named = doses.find(o => items[o]) || doses[0];
    POTIONS.push({ id: row.name.replace(/_consumable_effect$/, '').replace(/^\d+/, ''), name: (items[named]?.name || named).replace(/\s*\(\d\)$/, ''), item: named, boosts: ch.map(x => [x.st, x.c, x.p]) });
  }
  if (POTIONS.length !== 8) throw new Error(`gear: ${POTIONS.length} combat potions: ${POTIONS.map(p => p.id).join(', ')}`);

  // ── Combat spells (magic_combat_spells.dbrow): those that hit, with a level ──
  const spellRows = [...(await readConfig(scripts('skill_combat/configs/magic/magic_combat_spells.dbrow'))).values()];
  const magicRs = scriptBlocks(await text('skill_combat/scripts/pvp/pvp_magic.rs2')).get('proc,magic_spell_maxhit') || '';
  const gaunt = need(magicRs, /inv_total\(worn, (\w+)\) > 0 & \$spell >= \^(\w+) & \$spell <= \^(\w+)\) \{\s*\$maxhit = add\(\$maxhit, (\d+)\)/, 'what chaos gauntlets do');
  const spellConst = new Map((await text('skill_combat/configs/magic/spells.constant')).split(/\r?\n/).map(l => l.match(/^\^(\w+)\s*=\s*(\d+)/)).filter(Boolean).map(m => [m[1], Number(m[2])]));
  const COMBAT_SPELLS = [];
  const godOf = { saradomin_strike: 'saradomin', claws_of_guthix: 'guthix', flames_of_zamorak: 'zamorak' };
  const own = async f => text(`skill_combat/scripts/player/spells/scripts/${f}.rs2`);
  for (const row of spellRows) {
    const d = Object.fromEntries((row.data || []).map(([k, ...v]) => [k, v]));
    const key = d.spell?.[0]?.replace(/^\^/, '');
    const max = Number(d.maxhit?.[0] ?? 0), level = Number(d.levelrequired?.[0] ?? 0);
    if (!key || !(max > 0) || !(level > 0)) continue;
    const name = d.name?.[0] || methods.find(m => m.id === `mg_${key}`)?.name;
    if (!name) throw new Error(`gear: no name for the spell ${key}`);
    const sp = { id: key, name, level, max, ...(d.members?.[0] === 'true' ? { members: 1 } : {}) };
    if (d.wornrequired) sp.staff = d.wornrequired[0];
    const n = spellConst.get(key);
    if (n >= spellConst.get(gaunt[2]) && n <= spellConst.get(gaunt[3])) sp.gauntlets = Number(gaunt[4]);
    if (godOf[key]) {
      const src = await own(key);
      const m = need(src, /if \(%magearena_charge > 0\) \{\s*\$maxhit = scale\((\d+), (\d+), \$maxhit\)/, `what Charge does to ${key}`);
      need(src, new RegExp(`inv_total\\(worn, ${godOf[key]}_cape\\) > 0 & inv_total\\(worn, ${godOf[key]}_staff\\) > 0\\) \\{`), `${key}'s cape and staff for Charge`);
      sp.god = godOf[key];
      sp.charged = Math.floor((max * Number(m[1])) / Number(m[2]));
    }
    if (key === 'crumble_undead') { need(await own('crumble_undead'), /npc_param\(undead\) = \^false\)/, 'Crumble Undead on the undead alone'); sp.undead = 1; }
    COMBAT_SPELLS.push(sp);
  }
  COMBAT_SPELLS.sort((a, b) => a.level - b.level || a.max - b.max);
  if (COMBAT_SPELLS.length < 20) throw new Error(`gear: only ${COMBAT_SPELLS.length} combat spells`);
  if (gaunt[1] !== 'gauntlets_of_chaos') throw new Error(`gear: ${gaunt[1]} adds to bolt spells now`);

  // ── The sums, checked where they're written: what the Gear tab works out with them ──
  const RULES = { specBar, magicRate: 0, protectPvp: null, pvpXp: null };
  const pvm = scriptBlocks(await text('skill_combat/scripts/player/player_magic.rs2'));
  RULES.magicRate = Number(need(pvm.get('proc,pvm_spell_cast') || '', /%action_delay = add\(map_clock, (\d+)\);/, 'how often a spell is cast')[1]);
  need(stat, /def_int \$effective_magic_defence = divide\(add\(multiply\(7, \$effective_magic\), multiply\(3, \$effective_defence\)\), 10\);/, 'magic defence of 7 parts Magic, 3 Defence');
  need(stat, /\$effective_magic = add\(add\(\$effective_magic, 8\), 1\);/, "Magic's 8 and 1");
  need(stat, /\$effective_magic_defence = add\(\$effective_magic_defence, 8\);/, 'magic defence\'s 8');
  need(stat, /%com_magicdef = ~combat_stat\(\$effective_magic_defence, \$magicdefence\);/, 'the magic defence roll');
  for (const t of ['stab', 'slash', 'crush']) {
    need(stat, new RegExp(`%com_${t}attack = ~combat_stat\\(\\$effective_attack, \\$${t}attack\\);`), `the ${t} attack roll`);
    need(stat, new RegExp(`%com_${t}def = ~combat_stat\\(\\$effective_defence, \\$${t}defence\\);`), `the ${t} defence roll`);
  }
  need(stat, /%com_rangedef = ~combat_stat\(\$effective_defence, \$rangedefence\);/, 'the ranged defence roll');
  need(stat, /def_int \$melee_strength = ~combat_stat\(\$effective_strength, \$strengthbonus\);/, 'melee strength');
  need(stat, /case \^stab_style, \^slash_style, \^crush_style : %com_maxhit = ~combat_maxhit\(\$melee_strength\);/, 'the melee max hit');
  for (const s of ['attack', 'strength', 'defence']) need(stat, new RegExp(`\\$effective_${s} = add\\(add\\(\\$effective_${s}, 8\\), \\$${s}_stylebonus\\);`), `effective ${s}'s 8 and style bonus`);
  const pvpRanged = await text('skill_combat/scripts/pvp/pvp_ranged.rs2'), pvpMelee = await text('skill_combat/scripts/pvp/pvp_melee.rs2');
  const cut = pct(pvpRanged, /if \(~\.check_protect_prayer\(\^ranged_style\) = true\) \{\s*\$maxhit = scale\((\d+), (\d+), \$maxhit\);/, 'Protect from Missiles in PvP');
  const cutMelee = pct(pvpMelee, /if \(~\.check_protect_prayer\(\^melee_style\) = true\) \{\s*\$maxhit = scale\((\d+), (\d+), \$maxhit\);/, 'Protect from Melee in PvP');
  if (cut.join() !== cutMelee.join()) throw new Error('gear: the protect prayers cut melee and Ranged differently in PvP now');
  RULES.protectPvp = cut;
  need(pvpRanged, /\$damage = min\(randominc\(\$maxhit\), \.stat\(hitpoints\)\);/, 'a PvP hit no more than they have left');
  const pvpCombat = await text('skill_combat/scripts/pvp/pvp_combat.rs2');
  need(pvpCombat, /\[proc,pvp_hit_roll\][^]*?def_int \$attack_roll = ~player_attack_roll_specific\(\$damagetype\);\s*def_int \$defence_roll = ~\.player_defence_roll_specific\(\$damagetype\);[^]*?if \(randominc\(\$attack_roll\) > randominc\(\$defence_roll\)\)/, 'the PvP hit roll');
  const xpm = need(pvpCombat, /\[proc,pvp_xp_multiplier\]\(int \$combat_level\)\(int\)\s*return\(min\((\d+), add\((\d+), divide\(multiply\(divide\(\$combat_level, (\d+)\), (\d+)\), (\d+)\)\)\)\);/, 'the PvP XP multiplier');
  RULES.pvpXp = { cap: Number(xpm[1]), base: Number(xpm[2]), per: Number(xpm[3]), mult: Number(xpm[4]), div: Number(xpm[5]) };
  const pvpMagic = await text('skill_combat/scripts/pvp/pvp_magic.rs2');
  const cutMagic = pvpMagic.match(/if \(~\.check_protect_prayer\(\^magic_style\) = true\) \{\s*\$maxhit = scale\((\d+), (\d+), \$maxhit\);/);
  if (!cutMagic || `${cutMagic[1]},${cutMagic[2]}` !== cut.join()) throw new Error('gear: Protect from Magic in PvP reads differently now');
  // (against a monster's hits, a protect prayer leaves none: npc_combat_melee/ranged's damage 0, a spell's failing)
  const npcMelee = scriptBlocks(await text('skill_combat/scripts/npc/npc_combat_melee.rs2')).get('proc,playerhit_n_melee') || '';
  need(npcMelee, /if \(\$check_protect_prayer = true & ~check_protect_prayer\(\^melee_style\) = true\) \{\s*\$damage = 0;/, 'Protect from Melee against a monster');
  const npcRanged = scriptBlocks(await text('skill_combat/scripts/npc/npc_combat_ranged.rs2')).get('proc,playerhit_n_ranged') || '';
  need(npcRanged, /if \(\$check_protect_prayer = true & ~check_protect_prayer\(\^ranged_style\) = true\) \{\s*\$damage = 0;/, 'Protect from Missiles against a monster');
  // (silverlight on a demon: its max hit × 160 / 100; player_melee.rs2)
  const melee = await text('skill_combat/scripts/player/player_melee.rs2');
  RULES.demonbane = pct(melee, /if \(npc_param\(demonbane_vulnerable\) = true & inv_total\(worn, silverlight\) > 0\) \{\s*\$maxhit = scale\((\d+), (\d+), %com_maxhit\);/, "silverlight on a demon");
  need(melee, /\$damage = randominc\(~npc_max_dealt\(\$maxhit, 0\)\);/, 'a melee hit');
  RULES.slots = Object.values(SLOTS);
  RULES.styleBonus = STYLE_BONUS;
  return { EQUIPMENT, WEAPON_STYLES, PRAYERS, POTIONS, COMBAT_SPELLS, RULES, notes };
}

// ── How each monster attacks (v3.5) ─────────────────────────────────────────
// Its attack trigger (ai_opplayer2: next to you; its own, its category's, or every NPC's; ai_applayer2 where
// that doesn't attack), followed through with build-drops.mjs's evaluator: every value a random() can take,
// with the server's attack procs as the leaves. Each attack: { p (its share of the attacks), kind (melee,
// ranged, magic, dragonfire, breath, none), and what it hits for }. Melee and Ranged are the monster's
// own rolls and max hits (npc_combat_melee/ranged.rs2), a spell's max hit its row's (magic_combat_spells)
// or what the script gives it. Where the script checks your levels first (a curse on what isn't lowered
// yet), they're counted as not lowered.
// E: { scripts, readFile, readConfig, scriptBlocks, monsters, npcWorld }
export async function npcAttacks(E) {
  const { scripts, readFile, readConfig, scriptBlocks, monsters, npcWorld } = E;
  const text = p => readFile(scripts(p), 'utf8');
  const need = (src, re, what) => { const m = src.match(re); if (!m) throw new Error(`npc attacks: ${what} reads differently now`); return m; };
  const { npcs, drops: ev, blocks: raw, rowsOf } = npcWorld;
  const { blocks, ctx: dropCtx, envFor, evaluate } = ev;
  const notes = [];
  // the spells: constant -> key, and each one's max hit (none: a curse or a bind)
  const spellConst = new Map((await text('skill_combat/configs/magic/spells.constant')).split(/\r?\n/).map(l => l.match(/^\^(\w+)\s*=\s*(\d+)/)).filter(Boolean).map(m => [Number(m[2]), m[1]]));
  const spellMax = new Map();
  for (const f of ['skill_combat/configs/magic/magic_combat_spells.dbrow', 'skill_magic/configs/magic_spells.dbrow']) {
    for (const row of (await readConfig(scripts(f))).values()) {
      const d = Object.fromEntries((row.data || []).map(([k, ...v]) => [k, v]));
      const key = d.spell?.[0]?.replace(/^\^/, '');
      if (key) spellMax.set(key, d.maxhit ? Number(d.maxhit[0]) : 0);
    }
  }
  const keyOf = v => (typeof v === 'number' ? spellConst.get(v) : typeof v === 'string' ? v.replace(/^\^/, '') : null);
  // Dragonfire (dragon.rs2) and the King Black Dragon's breaths, as their scripts have them
  const dragon = scriptBlocks(await text('npc/scripts/dragon.rs2'));
  const fire = dragon.get('proc,dragon_fire') || '';
  const dragonfire = {
    kind: 'dragonfire',
    base: Number(need(fire, /def_int \$maxhit = (\d+);/, 'dragonfire')[1]),
    plus: Number(need(fire, /\} else if \(randominc\(\$attack_roll\) > randominc\(\$defence_roll\)\) \{[^}]*?\$maxhit = add\(\$maxhit, (\d+)\);/, "dragonfire's roll")[1]),
    shield: Number(need(fire, /if \(inv_total\(worn, antidragonbreathshield\) > 0\) \{[^}]*?\$maxhit = (\d+);/, 'the anti-dragon shield')[1]),
    protect: Number(need(fire, /\} else if \(%prayer12 = \^true\) \{[^}]*?\$maxhit = (\d+);/, 'Protect from Magic against dragonfire')[1]),
    antifire: Number(need(fire, /if \(map_clock < %dragonresist\) \{[^}]*?\$maxhit = sub\(\$maxhit, (\d+)\);/, 'an antifire potion')[1]),
  };
  need(fire, /def_int \$attack_roll = ~npc_magic_attack_roll;\s*def_int \$defence_roll = ~player_defence_roll_specific\(npc_param\(damagetype\)\);/, "dragonfire's two rolls");
  need(fire, /def_int \$damage = randominc\(max\(\$maxhit, 0\)\);/, "dragonfire's damage");
  need(dragon.get('label,dragon_ai_opplayer2') || '', /if \(random\(4\) = 0\) \{\s*~dragon_fire;\s*\} else \{\s*~dragon_melee;/, 'how often a dragon breathes fire');
  const kbdText = await text('areas/area_wilderness/scripts/king_black_dragon.rs2');
  const kbd = scriptBlocks(kbdText);
  const breath = (maxProc, what) => {
    const src = kbd.get(`proc,${maxProc}`) || '';
    return {
      kind: 'breath', what,
      max: Number(need(src, /def_int \$maxhit = (\d+);/, `the KBD's ${what} breath`)[1]),
      protect: Number(need(src, /if \(%prayer12 = \^true\) \{[^}]*?\$maxhit = (\d+);/, `Protect from Magic against the ${what} breath`)[1]),
      shield: Number(need(src, /if \(inv_total\(worn, antidragonbreathshield\) > 0\) \{[^}]*?\$maxhit = (\d+);/, `the shield against the ${what} breath`)[1]),
      ...(/%dragonresist/.test(src) ? { antifire: Number(need(src, /\$maxhit = sub\(\$maxhit, (\d+)\);/, `antifire against the ${what} breath`)[1]) } : {}),
    };
  };
  for (const p of ['kbd_dragonfire_close', 'kbd_dragonfire_far', 'kbd_toxic_breath', 'kbd_icy_breath', 'kbd_shocking_breath']) {
    need(kbd.get(`proc,${p}`) || '', /def_int \$attack_roll = ~npc_magic_attack_roll;\s*def_int \$defence_roll = ~player_defence_roll_specific\(\^magic_style\);\s*if \(randominc\(\$attack_roll\) > randominc\(\$defence_roll\)\) \{\s*\$damage = randominc\(~kbd_(fiery|special)_breath_maxhit\);/, `the KBD's ${p}`);
  }
  need(kbd.get('proc,kbd_special_breath') || '', /def_int \$random_attack = random\(3\);/, "the KBD's three breaths");
  const fiery = breath('kbd_fiery_breath_maxhit', 'fiery'), special = breath('kbd_special_breath_maxhit', 'special');
  // The Kalphite Queen's spines and lightning: no roll, only a protect prayer (kalphite_queen.rs2)
  const kq = await text('areas/area_kalphite/scripts/kalphite_queen.rs2');
  const kqBlocks = scriptBlocks(kq);
  const spines = Number(need(kqBlocks.get('proc,kalphite_queen_ranged_attack') || '', /def_int \$maxhit = (\d+);[^]*?if \(~check_protect_prayer\(\^ranged_style\) = false\) \{\s*\$damage = randominc\(\$maxhit\);/, "the Kalphite Queen's spines")[1]);
  const bolt = Number(need(kqBlocks.get('proc,kalphite_queen_mage_hunt') || '', /def_int \$maxhit = (\d+);\s*if \(~check_protect_prayer\(\^magic_style\) = false\) \{\s*\$damage = randominc\(\$maxhit\);/, "the Kalphite Queen's lightning")[1]);
  for (const form of ['kalphite_queen', 'kalphite_flyingqueen']) {
    need(kqBlocks.get(`ai_applayer2,${form}`) || '', /def_int \$random = random\(2\);\s*if \(npc_range\(coord\) <= 1\) \{\s*\$random = random\(3\);\s*\}/, `the ${form}'s three attacks`);
  }
  const fp = kqBlocks.get('proc,kalphite_flyingqueen_ranged_attack') || '', fm = kqBlocks.get('proc,kalphite_flyingqueen_mage_attack') || '';
  const dag = scriptBlocks(await text('quests/quest_horror/scripts/horror_dagannoth.rs2')).get('proc,dagannoth_rangeattack') || '';
  need(dag, /def_int \$damage = randominc\(\$maxhit\);[^]*?if \(~check_protect_prayer\(\^ranged_style\) = true\) \{\s*\$damage = 0;/, "a dagannoth's spines");
  if (/randominc\(\$attack_roll\) > randominc\(\$defence_roll\)/.test(dag)) throw new Error("npc attacks: a dagannoth's spines roll to hit now");
  const snail = scriptBlocks(await text('areas/area_mortmyre/scripts/snail.rs2')).get('ai_applayer2,_snail') || '';
  need(snail, /def_int \$maxhit = \d+;[^]*?~playerhit_n_ranged\(true, ~snelm_reduction\(randominc\(\$maxhit\)\)/, "a snail's spit");
  const troll = scriptBlocks(await text('areas/area_burthorpe/scripts/death_troll_thrower.rs2')).get('ai_applayer2,_troll_thrower') || '';
  need(troll, /def_int \$maxhit = ~npc_ranged_maxhit;[^]*?~playerhit_n_ranged\(true, randominc\(\$maxhit\)/, "a thrower troll's rock");
  // A record of an attack, in the state the evaluator follows
  const rec = (s, a) => [{ p: 1, v: null, s: { ...s, drops: [...s.drops, { attack: a }] } }];
  const yes = (v, s) => [{ p: 1, v: 1, s }], no = (v, s) => [{ p: 1, v: 0, s }];
  const hooks = {
    '~npc_meleeattack': (v, s) => rec(s, { kind: 'melee' }),
    '~npc_default_attack': (v, s) => rec(s, { kind: 'melee' }),
    '~dragon_melee': (v, s) => rec(s, { kind: 'melee' }),
    '~kalphite_melee_attack': (v, s) => rec(s, { kind: 'melee' }),
    '~kalphite_flyingqueen_melee_attack': (v, s) => rec(s, { kind: 'melee' }),
    '~npc_rangeattack': (v, s) => rec(s, { kind: 'ranged' }),
    '~npc_cast_spell': ([sp], s) => { const k = keyOf(sp); return rec(s, { kind: 'magic', spell: k, max: spellMax.get(k) ?? 0 }); },
    '~npc_cast_spell_with_forced_max_hit': ([sp, , max], s) => { const k = keyOf(sp); return rec(s, { kind: 'magic', spell: k, max: max ?? spellMax.get(k) ?? 0 }); },
    '~npc_zap_attack': ([max], s) => rec(s, { kind: 'magic', max }),
    '~get_spell_data': ([sp], s) => [{ p: 1, v: { spell: keyOf(sp) }, s }],
    '~npc_spell_success': ([data, max], s) => rec(s, { kind: 'magic', spell: data?.spell ?? null, max: max == null ? 0 : max }),
    '~npc_spell_fail': (v, s) => [{ p: 1, v: null, s }],
    '~npc_player_hit_roll': yes, '~check_protect_prayer': no,
    '~npc_check_notcombat': yes, '~npc_check_notcombat_self': yes, '~npc_combat_spell_checks': yes,
    '~npc_set_attack_vars': (v, s) => [{ p: 1, v: null, s }],
    '~dragon_fire': (v, s) => rec(s, { ...dragonfire }),
    '~kbd_dragonfire_close': (v, s) => rec(s, { ...fiery }), '~kbd_dragonfire_far': (v, s) => rec(s, { ...fiery }),
    '~kbd_toxic_breath': (v, s) => rec(s, { ...special }), '~kbd_icy_breath': (v, s) => rec(s, { ...special }), '~kbd_shocking_breath': (v, s) => rec(s, { ...special }),
    '~kalphite_queen_ranged_attack': (v, s) => rec(s, { kind: 'ranged', max: spines, sure: 1 }),
    '~kalphite_queen_mage_attack': (v, s) => rec(s, { kind: 'magic', max: bolt, sure: 1 }),
    '~kalphite_flyingqueen_ranged_attack': (v, s) => rec(s, { kind: 'ranged', max: Number(fp.match(/def_int \$maxhit = (\d+);/)?.[1] ?? spines), sure: 1 }),
    '~kalphite_flyingqueen_mage_attack': (v, s) => rec(s, { kind: 'magic', max: Number(fm.match(/def_int \$maxhit = (\d+);/)?.[1] ?? bolt), sure: 1 }),
    '~necro_summon_zombie': (v, s) => rec(s, { kind: 'none' }),
    // (the few attacks of their own: a shade's and a vampire leech's are the usual melee rolls; a snail's spit, a
    // thrower troll's rock and a dagannoth's spines hit without a roll, for what the script's $maxhit is)
    '~shade_meleeattack': (v, s) => rec(s, { kind: 'melee' }),
    '~leech_meleeattack': (v, s) => rec(s, { kind: 'melee' }),
    '~playerhit_n_ranged': (v, s) => rec(s, { kind: 'ranged', max: s.vars.get('$maxhit'), sure: 1 }),
    '~dagannoth_rangeattack': ([max, twice], s) => rec(s, { kind: 'ranged', max, sure: 1, ...(twice ? { hits: 2 } : {}) }),
    stat: yes, stat_base: yes, npc_range: yes, busy: no, lineofwalk: yes,
  };
  // (a proc's parameters, from its header: (int $maxhit, int $attackspeed))
  const paramsOf = name => [...((raw.get(`proc,${name}`) || '').trimStart().match(/^\(([^)]*)\)/)?.[1] || '').matchAll(/\$(\w+)/g)].map(m => `$${m[1]}`);
  const ctx = { ...dropCtx, hooks, paramsOf, log: [] };
  // the attack trigger: its own, its category's, or every NPC's
  const triggerOf = (key, trig) => {
    const cat = npcs.get(key)?.props.category;
    if (raw.has(`${trig},${key}`)) return `${trig},${key}`;
    if (cat && raw.has(`${trig},_${cat}`)) return `${trig},_${cat}`;
    if (raw.has(`${trig},_`)) return `${trig},_`;
    return null;
  };
  const sig = a => JSON.stringify(a);
  const mixOf = (key, trig) => {
    const t = triggerOf(key, trig);
    if (!t) return null;
    let states;
    try { states = evaluate(blocks.get(t), envFor(key), ctx); } catch (e) { throw new Error(`npc attacks: ${key} (${t}): ${e.message}`); }
    const mix = new Map();
    let total = 0;
    for (const s of states) {
      const as = s.drops.filter(d => d.attack).map(d => d.attack);
      if (!as.length) continue;
      if (as.length > 1) throw new Error(`npc attacks: ${key} attacks ${as.length} times in one go`);
      const k = sig(as[0]);
      mix.set(k, (mix.get(k) || 0) + s.p);
      total += s.p;
    }
    if (!total) return null;
    return [...mix].map(([k, p]) => ({ p: p / total, ...JSON.parse(k) })).sort((a, b) => b.p - a.p);
  };
  const out = new Map();
  for (const m of monsters) {
    const key = [...rowsOf.get(m.id)].sort((a, b) => b.n - a.n)[0].key;
    const mix = mixOf(key, 'ai_opplayer2') || mixOf(key, 'ai_applayer2');
    if (!mix) { notes.push(`npc attacks: ${m.id} (${key}): no attack read`); continue; }
    // (rounded to the shares a script can have: random(n) branches)
    for (const a of mix) a.p = Math.round(a.p * 1e6) / 1e6;
    out.set(m.id, mix);
  }
  const odd = [...new Set(ctx.log)].filter(l => /unknown proc/.test(l));
  if (odd.length) notes.push(`npc attacks: calls followed into nothing: ${odd.slice(0, 20).join('; ')}`);
  const kinds = {};
  for (const mix of out.values()) for (const a of mix) kinds[a.kind] = (kinds[a.kind] || 0) + 1;
  notes.push(`npc attacks: ${out.size} monsters (${[...out.values()].filter(x => x.length > 1).length} with more than one attack); ${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  return { attacks: out, notes };
}
