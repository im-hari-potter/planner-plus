// The Clues tab's data (v3.6): node build-clues.mjs <Content checkout> <LostHQ 2004 checkout>
// writes cluedata.js, cluemaps.webp, cluepics.webp and puzzles.png.
//
// Everything is Lost City's server's (LostCityRS/Content, rev 274, MIT), read from its scripts:
// - the clues: minigames/game_trail/configs/trail_<tier>.obj (each clue's words, where to dig or what to
//   search: trail_coord, trail_loc; a sextant's; its guardian), and trail_<tier>.enum (the ones the game
//   hands out: a clue not in it never turns up);
// - who to talk to: the NPC scripts that move a clue on (their opnpc1 trigger), and the drawers, chests,
//   bookcases and crates that do (the coordinate they check); the keys some medium riddles need
//   (trail_checkmediumdrop: who drops it), the challenge scrolls' questions and answers, and the puzzle
//   boxes (give_trail_puzzle, and the box's trail_puzzle: which picture);
// - what's searched: the loc on that square of the map (maps/m*.jm2), its name and option;
// - the rewards: trail_clue_<tier>_reward.rs2, the rolls a casket has, the chance a roll is rare, and the
//   tables (every roll of them as the script has it: a script that reads differently stops the build);
// - where, and the minimaps (build-npcmaps.mjs, drawn from the map files, as a monster's page).
// The pictures of the map clues are LostHQ's (2004.losthq.rs, GPL-3.0, img/clue_guides/maps); the sliding
// puzzles' pieces are the game's own icons for them, from LostHQ's item sheet. RuneScape is (c) Jagex Ltd.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { npcPlaces } from './build-npcmaps.mjs';

const sharp = createRequire(import.meta.url)('sharp');
const TIERS = ['easy', 'medium', 'hard'];

function parseConfig(text) {
  const blocks = new Map();
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    const head = line.match(/^\[([^\]]+)\]$/);
    if (head) { cur = { params: {} }; blocks.set(head[1], cur); continue; }
    if (!cur) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const k = line.slice(0, eq), v = line.slice(eq + 1);
    if (k === 'param') { const c = v.indexOf(','); cur.params[v.slice(0, c)] = v.slice(c + 1); } else cur[k] = v;
  }
  return blocks;
}
const coordOf = s => { const [level, mx, mz, lx, lz] = s.split('_').map(Number); return { level, x: mx * 64 + lx, z: mz * 64 + lz }; };
// a clue's words as the scroll shows them: | a new line, @col@ colour tags gone
const words = s => s.replace(/@\w{3}@/g, '').split('|').map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
// the server's sextant: minutes from the observatory, 1.875 a square, rounded towards 0 (output_sextant_coords)
export const OBSERVATORY = { x: 38 * 64 + 8, z: 49 * 64 + 25 };
export function sextantText(x, z) {
  const mins = d => Math.trunc((1875 * d) / 1000);
  const part = (m, pos, neg) => { const deg = Math.trunc(m / 60); return [Math.abs(deg), Math.abs(m - deg * 60), m < 0 ? neg : pos]; };
  return [...part(mins(z - OBSERVATORY.z), 'N', 'S'), ...part(mins(x - OBSERVATORY.x), 'E', 'W')];
}

export async function buildClues(content, lhq) {
  const sc = p => join(content, 'scripts', p);
  const files = (await readdir(sc(''), { recursive: true })).map(f => f.replace(/\\/g, '/'));
  const configs = async ext => {
    const out = new Map();
    // (the curated configs first, then rev 225's dump under _unpack for what they lack)
    const list = files.filter(f => f.endsWith(ext)).sort((a, b) => Number(a.startsWith('_unpack')) - Number(b.startsWith('_unpack')));
    for (const f of list) for (const [k, v] of parseConfig(await readFile(sc(f), 'utf8'))) if (!out.has(k)) out.set(k, v);
    return out;
  };
  const OBJ = await configs('.obj'), NPC = await configs('.npc'), LOC = await configs('.loc');
  const scripts = new Map();
  for (const f of files.filter(f => f.endsWith('.rs2') && !f.startsWith('_test'))) scripts.set(f, (await readFile(sc(f), 'utf8')).replace(/\/\/[^\n]*/g, ''));
  const trailFiles = new Map();
  for (const f of files.filter(f => f.startsWith('minigames/game_trail/') && /\.\w+$/.test(f))) trailFiles.set(f, scripts.get(f) ?? await readFile(sc(f), 'utf8'));
  const trail = f => trailFiles.get(`minigames/game_trail/${f}`) ?? (() => { throw new Error(`clues: no ${f}`); })();
  const blocksOf = text => text.split(/^(?=\[)/m).map(b => ({ head: b.match(/^\[(\w+),([^\]]+)\]/), body: b }));
  const need = (cond, what) => { if (!cond) throw new Error(`clues: ${what}`); };

  // ── The map: NPCs and locs, square by square ──
  const pack = async name => new Map((await readFile(join(content, `pack/${name}.pack`), 'utf8')).split(/\r?\n/).filter(l => /^\d+=/.test(l)).map(l => [Number(l.slice(0, l.indexOf('='))), l.slice(l.indexOf('=') + 1)]));
  const npcIds = await pack('npc'), locIds = await pack('loc');
  const spawnsOf = new Map(), locsAt = new Map();      // npc -> [[level, x, z]]; "level_x_z" -> [{ name, shape }]
  for (const f of (await readdir(join(content, 'maps'))).filter(f => /^m\d+_\d+\.jm2$/.test(f))) {
    const [mx, mz] = f.match(/^m(\d+)_(\d+)/).slice(1).map(Number);
    let part = '';
    const bridged = new Set(), locs = [];         // (a square whose level 1 is flagged 2, a bridge: what's on a level there is a level lower)
    for (const line of (await readFile(join(content, 'maps', f), 'utf8')).split(/\r?\n/)) {
      if (line.startsWith('====')) { part = line.replace(/=/g, '').trim(); continue; }
      const m = /^(\d) (\d+) (\d+): (.*)$/.exec(line);
      if (!m) continue;
      const level = Number(m[1]), x = mx * 64 + Number(m[2]), z = mz * 64 + Number(m[3]);
      if (part === 'MAP') {
        const flags = m[4].match(/(?:^|\s)f(\d+)/);
        if (level === 1 && flags && (Number(flags[1]) & 2)) bridged.add(`${x}_${z}`);
      } else if (part === 'NPC') for (const id of m[4].trim().split(/\s+/).map(Number)) {
        const name = npcIds.get(id);
        (spawnsOf.get(name) || spawnsOf.set(name, []).get(name)).push([level, x, z]);
      } else if (part === 'LOC') {
        const [id, shape = 10] = m[4].trim().split(/\s+/).map(Number);
        locs.push([level, x, z, id, shape]);
      }
    }
    for (const [level, x, z, id, shape] of locs) {
      const k = `${level > 0 && bridged.has(`${x}_${z}`) ? level - 1 : level}_${x}_${z}`;
      (locsAt.get(k) || locsAt.set(k, []).get(k)).push({ name: locIds.get(id), shape });
    }
  }
  need(spawnsOf.size > 500, "the maps' NPCs didn't read");
  const npcName = n => { const c = NPC.get(n); need(c?.name, `no NPC ${n}`); return c.name; };
  const npcLevel = n => Number(NPC.get(n)?.vislevel) || null;
  const inCategory = cat => [...NPC].filter(([, c]) => c.category === cat).map(([k]) => k);
  // what's searched on a square: the loc there with an option (its name and the option's word)
  const locThere = at => {
    const here = (locsAt.get(`${at.level}_${at.x}_${at.z}`) || []).map(l => ({ ...l, c: LOC.get(l.name) })).filter(l => l.c?.name && l.c.op1);
    need(here.length, `nothing to search at ${at.level} ${at.x} ${at.z}`);
    const l = here[0];
    return { loc: l.c.name, op: l.c.op1.replace(/^@\w{3}@/, '') };
  };

  // ── The clues the game hands out ──
  const clues = [];
  for (const tier of TIERS) {
    const objs = parseConfig(trail(`configs/trail_${tier}.obj`));
    const handed = [...trail(`configs/trail_${tier}.enum`).matchAll(/^val=\d+,(\S+)/gm)].map(m => m[1]);
    need(handed.length > 40, `trail_${tier}.enum reads differently`);
    for (const name of handed) {
      const o = objs.get(name);
      need(o && o.category === `trail_clue_${tier}`, `${name} isn't a ${tier} clue`);
      const m = name.match(new RegExp(`^trail_clue_${tier}_(map|simple|vague|anagram|riddle|sextant)(\\d+)$`));
      need(m, `${name}: what kind of clue?`);
      clues.push({ name, tier, kind: m[1], n: Number(m[2]), p: o.params });
    }
  }
  // the scripts that move a clue on, outside the treasure trail's own: an NPC's opnpc1, or a loc's oploc1
  // and the coordinate it checks
  const movedBy = new Map();
  for (const [f, t] of scripts) {
    if (f.startsWith('minigames/game_trail/')) continue;
    for (const { head, body } of blocksOf(t)) {
      if (!head || !/^(opnpc1|oploc1)$/.test(head[1])) continue;
      for (const c of clues) {
        const at = body.search(new RegExp(`\\b${c.name}\\b`));
        if (at < 0) continue;
        const coords = [...body.slice(0, at).matchAll(/\b(\d_\d+_\d+_\d+_\d+)\b/g)];
        (movedBy.get(c.name) || movedBy.set(c.name, []).get(c.name)).push({ op: head[1], what: head[2], file: f, coord: coords.at(-1)?.[1] || null });
      }
    }
  }
  // the riddles a locked chest or drawers answers (riddle_loc_<tier>_exp<n>: the clue it moves on, and its key),
  // and the coordinate the drawers' and chests' scripts send there
  const lockedBy = new Map();
  for (const f of ['general_use/scripts/drawers.rs2', 'general_use/scripts/chests.rs2']) {
    for (const m of scripts.get(f).matchAll(/loc_coord = (\d_\d+_\d+_\d+_\d+)\)\s*\{([^]*?)\n\s*\}/g)) {
      for (const l of m[2].matchAll(/@riddle_loc_(\w+?)_exp(\d+)/g)) {
        const key = `${l[1]}_${l[2]}`;
        if (!lockedBy.has(key)) lockedBy.set(key, { coord: m[1], file: f });
      }
    }
  }
  const riddleLocs = new Map();         // clue -> { coord, key }
  for (const tier of ['easy', 'medium']) {
    for (const { head, body } of blocksOf(trail(`scripts/${tier}/trail_clue_${tier}.rs2`))) {
      const h = head?.[2]?.match(/^riddle_loc_(\w+?)_exp(\d+)$/);
      if (!h) continue;
      const clue = body.match(/(trail_clue_\w+?\d+)\b(?!_key)/)?.[1];
      const by = lockedBy.get(`${h[1]}_${h[2]}`);
      need(clue && by, `riddle_loc_${h[1]}_exp${h[2]}: which clue, or where?`);
      riddleLocs.set(clue, { coord: by.coord, key: body.includes(`${clue}_key`) });
    }
  }
  // who drops a medium riddle's key (trail_checkmediumdrop)
  const keyDrops = new Map();
  const drop = trail('scripts/medium/trail_clue_medium.rs2').match(/\[proc,trail_checkmediumdrop\]([^]*?)\n\[/)?.[1];
  need(drop, 'trail_checkmediumdrop is gone');
  for (const m of drop.matchAll(/(?:npc_type = (\w+)|npc_category = (\w+)|compare\(npc_name, "([^"]+)"\) = 0) & inv_total\(inv, (trail_clue_medium_riddle\d+)\)/g)) {
    const [, type, cat, named, clue] = m;
    if (type) keyDrops.set(clue, { who: npcName(type), level: npcLevel(type), npcs: [type] });
    else if (cat) { const all = inCategory(cat); need(all.length, `no NPCs of category ${cat}`); keyDrops.set(clue, { who: `Any ${npcName(all[0]).toLowerCase()}`, npcs: all, any: 1 }); }
    else keyDrops.set(clue, { who: `Any ${named}`, npcs: [...NPC].filter(([, c]) => c.name === named).map(([k]) => k), any: 1 });
  }
  // puzzle boxes: who gives which (give_trail_puzzle), and its picture (the box's trail_puzzle)
  const consts = new Map([...trail('configs/trail.constant').matchAll(/^\^(\w+) = (\d+)/gm)].map(m => [m[1], Number(m[2])]));
  const puzzleOf = new Map();
  for (const t of scripts.values()) for (const m of t.matchAll(/~give_trail_puzzle\((trail_clue_hard_riddle\d+)_puzzlebox,/g)) {
    const box = OBJ.get(`${m[1]}_puzzlebox`);
    const which = { [consts.get('trail_puzzleb')]: 'b', [consts.get('trail_puzzlec')]: 'c', [consts.get('trail_puzzled')]: 'd' }[consts.get(box?.params.trail_puzzle?.replace('^', ''))];
    need(which, `${m[1]}'s puzzle box has no picture`);
    puzzleOf.set(m[1], which);
  }

  // ── Each clue's answer ──
  // The zoo keeper's challenge: the server's answer is 40, but 32 is what worked in the game (Ostap, 2026-11)
  const ANSWER_SEEN = { trail_clue_medium_anagram003_challenge: 32 };
  const out = [], places = new Map(), odd = [];
  const placeFor = (key, spawns, mark) => { if (!places.has(key)) places.set(key, { id: key, spawns, mark }); return key; };
  for (const c of clues) {
    const r = { id: c.name.replace(/^trail_clue_/, ''), tier: c.tier, kind: c.kind, text: c.p.trail_desc ? words(c.p.trail_desc) : null };
    const by = movedBy.get(c.name) || [];
    if (c.p.trail_sextant) {
      const at = coordOf(c.p.trail_coord);
      const said = c.p.trail_desc.match(/^(\d+) degrees (\d+) minutes (North|South)\|(\d+) degrees (\d+) minutes (East|West)$/);
      need(said, `${c.name}'s coordinates read differently`);
      r.coords = [Number(said[1]), Number(said[2]), said[3][0], Number(said[4]), Number(said[5]), said[6][0]];
      const calc = sextantText(at.x, at.z);
      if (calc.join() !== r.coords.join()) odd.push(`${c.name}: the scroll says ${r.coords.join(' ')}, the dig spot's sextant ${calc.join(' ')}`);
      Object.assign(r, { do: 'dig', at, place: placeFor(`at:${at.level}_${at.x}_${at.z}`, [[at.level, at.x, at.z]], 'x') });
      if (c.p.trail_guardian) r.guardian = { who: npcName(c.p.trail_guardian), level: npcLevel(c.p.trail_guardian) };
    } else if (c.p.trail_coord) {
      const at = coordOf(c.p.trail_coord);
      Object.assign(r, { at, place: placeFor(`at:${at.level}_${at.x}_${at.z}`, [[at.level, at.x, at.z]], 'x') });
      if (c.p.trail_loc) Object.assign(r, { do: 'search' }, locThere(at)); else r.do = 'dig';
    } else if (riddleLocs.has(c.name)) {
      const { coord, key } = riddleLocs.get(c.name), at = coordOf(coord);
      Object.assign(r, { do: 'search', at, place: placeFor(`at:${at.level}_${at.x}_${at.z}`, [[at.level, at.x, at.z]], 'x') }, locThere(at));
      if (key) { const k = keyDrops.get(c.name); need(k, `${c.name} needs a key no one drops`); r.key = k; }
    } else if (by.some(b => b.op === 'oploc1')) {
      const b = by.find(b => b.op === 'oploc1');
      need(b.coord, `${c.name}: ${b.file} checks no coordinate`);
      const at = coordOf(b.coord);
      Object.assign(r, { do: 'search', at, place: placeFor(`at:${at.level}_${at.x}_${at.z}`, [[at.level, at.x, at.z]], 'x') }, locThere(at));
    } else if (by.some(b => b.op === 'opnpc1')) {
      const who = by.filter(b => b.op === 'opnpc1').map(b => b.what);
      const npcs = who.flatMap(w => (w.startsWith('_') ? inCategory(w.slice(1)) : [w]));
      need(npcs.length, `${c.name}: talk to whom?`);
      const shown = [...new Set(npcs.map(npcName))];
      const spawns = npcs.flatMap(n => spawnsOf.get(n) || []);
      Object.assign(r, { do: 'talk', npc: who.some(w => w.startsWith('_')) ? `Any ${shown[0].toLowerCase()}` : shown.join(' or '), place: spawns.length ? placeFor(`npc:${npcs.join('+')}`, spawns) : null });
      if (!spawns.length) odd.push(`${c.name}: ${shown.join(', ')} isn't on the map`);
      const ch = OBJ.get(`${c.name}_challenge`);
      if (ch) {
        need(ch.params.trail_desc && ch.params.trail_challenge_answer, `${c.name}_challenge reads differently`);
        const server = Number(ch.params.trail_challenge_answer);
        r.challenge = { q: words(ch.params.trail_desc).replace(/\n/g, ' '), a: ANSWER_SEEN[`${c.name}_challenge`] ?? server, ...(ANSWER_SEEN[`${c.name}_challenge`] ? { server } : {}) };
      }
      if (puzzleOf.has(c.name)) r.puzzle = puzzleOf.get(c.name);
    } else throw new Error(`clues: can't tell how ${c.name} is solved`);
    out.push(r);
  }
  for (const k of Object.keys(ANSWER_SEEN)) need(OBJ.get(k), `ANSWER_SEEN: no ${k}`);
  for (const k of puzzleOf.keys()) need(out.some(r => `trail_clue_${r.id}` === k && r.puzzle), `${k} gives a puzzle but isn't a clue handed out`);
  // key holders on the map too (only one kind of NPC)
  for (const r of out) if (r.key && !r.key.any) {
    const spawns = r.key.npcs.flatMap(n => spawnsOf.get(n) || []);
    if (spawns.length) r.key.place = placeFor(`npc:${r.key.npcs.join('+')}`, spawns);
  }

  // ── The minimaps, and where in words ──
  const maps = await npcPlaces({ content, list: [...places.values()], W: 40, H: 30, perRow: 8 });
  const whereOf = key => (maps.where.get(key) || []).map(([t]) => t).slice(0, 2).join('; ') || null;
  for (const r of out) {
    if (r.place) { r.where = whereOf(r.place); r.map = maps.index.get(r.place); }
    if (r.key?.place) { r.key.where = whereOf(r.key.place); r.key.map = maps.index.get(r.key.place); }
    if (r.key) { delete r.key.npcs; delete r.key.place; }
    delete r.place;
    if (r.at) { r.at = [r.at.level, r.at.x, r.at.z]; }
  }

  // ── The rewards ──
  const rewards = {};
  for (const tier of TIERS) {
    const text = trail(`scripts/${tier}/trail_clue_${tier}_reward.rs2`);
    const procs = new Map(blocksOf(text + '\n' + trail('scripts/trail_clue_drop.rs2')).filter(b => b.head?.[1] === 'proc').map(b => [b.head[2], b.body]));
    const main = procs.get(`trail_clue_${tier}_reward`);
    need(main, `no trail_clue_${tier}_reward`);
    const rolls = main.match(/def_int \$rolls = calc\((\d+) \+ random\((\d+)\)\);/);
    const rare = main.match(/if\(random\((\d+)\) = 0\) \{\s*\$rare = calc\(\$rare \+ 1\);\s*gosub\(trail_clue_\w+_rare\);\s*\} else \{\s*gosub\(trail_clue_\w+_normal\);/);
    need(rolls && rare, `trail_clue_${tier}_reward reads differently`);
    // a table: random(n), then each case's items (an item and how many, a proc that returns one, or a table of its own)
    const count = s => {
      const k = s.trim();
      if (/^\d+$/.test(k)) return [Number(k), Number(k)];
      const m = k.match(/^calc\((\d+) \+ random\((\d+)\)\)$/);
      need(m, `a reward's count reads ${k}`);
      return [Number(m[1]), Number(m[1]) + Number(m[2]) - 1];
    };
    const table = (body, where) => {
      const n = body.match(/def_int \$\w+ = random\((\d+)\);/)?.[1] ?? body.match(/\$\w+ = random\((\d+)\);/)?.[1];
      need(n, `${where}: no random(n)`);
      const firstIf = body.search(/if\s*\(\$\w+ = 0\)/), firstSwitch = body.search(/switch_int \(\$\w+\)/);
      const sw = (firstIf < 0 || (firstSwitch >= 0 && firstSwitch < firstIf)) && body.match(/switch_int \(\$\w+\) \{([^]*)\}/);
      const cases = [];
      if (sw) {
        const parts = sw[1].split(/^\s*case (\d+) :/m);
        for (let i = 1; i < parts.length; i += 2) cases[Number(parts[i])] = parts[i + 1];
      } else {
        // if ($rand = 0) { … } else if ($rand = 1) { … }: each branch a table of its own
        const parts = body.split(/(?:else )?if\s*\(\$\w+ = (\d+)\)\s*\{/);
        for (let i = 1; i < parts.length; i += 2) cases[Number(parts[i])] = { branch: parts[i + 1] };
      }
      need(cases.length === Number(n) && [...cases.keys()].every(i => cases[i]), `${where}: ${cases.filter(Boolean).length} cases for random(${n})`);
      return cases.map((cs, i) => {
        if (typeof cs !== 'string') return { sub: table(cs.branch, `${where} ${i}`) };
        const got = [];
        for (const m of cs.matchAll(/inv_add\(trail_rewardinv, (.+?)\);[ \t]*$/gm)) {
          const args = m[1].trim();
          if (args.startsWith('~')) {
            const p = procs.get(args.slice(1));
            need(p, `${where}: no proc ${args}`);
            got.push({ sub: table(p, args) });
          } else {
            const c = args.indexOf(',');
            const obj = args.slice(0, c).trim();
            // (cert_<item>: the engine's noted <item>)
            need(OBJ.has(obj) || (obj.startsWith('cert_') && OBJ.has(obj.slice(5))), `${where}: no obj ${obj}`);
            got.push({ obj, n: count(args.slice(c + 1)) });
          }
        }
        for (const m of cs.matchAll(/^\s*~(\w+);/gm)) { const p = procs.get(m[1]); need(p, `${where}: no proc ${m[1]}`); got.push({ sub: table(p, m[1]) }); }
        for (const m of cs.matchAll(/return \((\w+), (\d+)\);/g)) { need(OBJ.has(m[1]), `${where}: no obj ${m[1]}`); got.push({ obj: m[1], n: [Number(m[2]), Number(m[2])] }); }
        need(got.length, `${where}: case ${i} gives nothing`);
        return got.length === 1 ? got[0] : { all: got };
      });
    };
    const normal = table(procs.get(`trail_clue_${tier}_normal`), `${tier} normal`);
    const rareT = table(procs.get(`trail_clue_${tier}_rare`), `${tier} rare`);
    // each item's chance a roll, and how many: flattened
    const items = new Map();
    const walk = (t, p, isRare) => {
      for (const e of t) {
        const q = p / t.length;
        const each = e.all || [e];
        for (const x of each) {
          if (x.sub) { walk(x.sub, q, isRare); continue; }
          const slug = x.obj.replace(/^cert_/, '');
          const it = items.get(x.obj) || items.set(x.obj, { slug, name: OBJ.get(slug).name, ...(x.obj.startsWith('cert_') ? { noted: 1 } : {}), p: 0, lo: x.n[0], hi: x.n[1], rare: isRare ? 1 : 0 }).get(x.obj);
          need(it.lo === x.n[0] && it.hi === x.n[1], `${slug} comes in two amounts`);
          it.p += q;
        }
      }
    };
    const pr = 1 / Number(rare[1]);
    walk(normal, 1 - pr, false);
    walk(rareT, pr, true);
    rewards[tier] = { rolls: [Number(rolls[1]), Number(rolls[1]) + Number(rolls[2]) - 1], rare: Number(rare[1]), items: [...items.values()] };
    const total = [...items.values()].reduce((t, i) => t + i.p, 0);
    // (a roll gives one item; the junk table's attack, strength and defence potions come as one roll's three)
    need(total > 0.999, `${tier}: a roll gives ${total} items`);
  }

  // ── The map clues' pictures (LostHQ's), each its clue's ──
  // (paired by where each one's spot is: the picture shows it)
  const PICTURE = {
    easy_map001: 'easy/champ_guild.png', easy_map002: 'easy/varrock_mine.png', easy_map003: 'easy/falador_mine.png', easy_map004: 'easy/clue_brother_galahad.jpg', easy_map005: 'easy/wiztowermap.gif',
    medium_map001: 'medium/draynor_fishing.png', medium_map003: 'medium/clue_hobgoblin_peninsula.png', medium_map004: 'medium/clue_McGrubors_wood.png',
    medium_map005: 'medium/clue_necromancer.png', medium_map006: 'medium/clue_clock_tower.jpg', medium_map007: 'medium/clue_Rimmington_chemists.png',
    hard_map001: 'hard/varrock_lumber.png', hard_map002: 'hard/clue1.jpg', hard_map003: 'hard/clue_west_ardougne.png', hard_map004: 'hard/clue_goblins_near_observatory.jpg', hard_map005: 'hard/clue_black_warriors_fortress_wildy.png',
  };
  const PIC = 200, picRow = 6;
  const pics = [];
  for (const r of out.filter(r => r.kind === 'map')) {
    const file = PICTURE[r.id];
    need(file, `no picture for ${r.id}`);
    r.pic = pics.length;
    pics.push(await sharp(join(lhq, 'img/clue_guides/maps', file)).resize(PIC, PIC, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().raw().toBuffer());
  }
  for (const id of Object.keys(PICTURE)) need(out.some(r => r.id === id), `PICTURE: ${id} isn't a clue handed out`);
  const picRows = Math.ceil(pics.length / picRow), picSheet = Buffer.alloc(picRow * PIC * picRows * PIC * 4);
  pics.forEach((px, n) => { const dx = (n % picRow) * PIC, dy = Math.floor(n / picRow) * PIC; for (let y = 0; y < PIC; y++) px.copy(picSheet, ((dy + y) * picRow * PIC + dx) * 4, y * PIC * 4, (y + 1) * PIC * 4); });

  // ── The sliding puzzles: the game's icon of each piece (LostHQ's item sheet, by the piece's id) ──
  const itemDb = new Map(JSON.parse(await readFile(join(lhq, 'js/itemdb/item_data.json'), 'utf8')).map(i => [i.debugname, i]));
  const { data: sheet, info } = await sharp(join(lhq, 'img/item_spritesheet.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const SIZE = 32, perSheetRow = info.width / SIZE;
  const pieces = Buffer.alloc(24 * SIZE * 3 * SIZE * 4);
  ['b', 'c', 'd'].forEach((letter, row) => {
    for (let i = 1; i <= 24; i++) {
      const slug = `trail_slidingpuzzle${letter}${String(i).padStart(2, '0')}`;
      need(OBJ.has(slug) && itemDb.has(slug), `no ${slug}`);
      const id = itemDb.get(slug).id, sx = (id % perSheetRow) * SIZE, sy = Math.floor(id / perSheetRow) * SIZE;
      need(sy + SIZE <= info.height, `${slug} isn't on LostHQ's sheet`);
      for (let y = 0; y < SIZE; y++) sheet.copy(pieces, ((row * SIZE + y) * 24 * SIZE + (i - 1) * SIZE) * 4, ((sy + y) * info.width + sx) * 4, ((sy + y) * info.width + sx + SIZE) * 4);
    }
  });
  const puzzleSolved = trail('scripts/trail_puzzle.rs2');
  for (const letter of ['b', 'c', 'd']) need(new RegExp(`inv_getobj\\(trail_puzzleinv, 23\\) = trail_slidingpuzzle${letter}24`).test(puzzleSolved), `the ${letter} puzzle is solved differently now`);

  // ── (v3.6.1) Reading a casket's screenshot: the reward window, and every reward's icon ──
  // The window (trail_reward.if): its items in a grid of 3 by 2 slots of 32 pixels, side by side (no margin), at 239, 89
  // in the main view; the client draws the main view at 4, 4 on the game canvas. Trail_complete opens it, and the
  // items go into your inventory only as it closes (trail_give_reward is a normal queue: it waits for the window).
  const rewardIf = parseConfig(trail('interfaces/trail_reward.if')).get('inv');
  need(rewardIf?.type === 'inv' && rewardIf.width === '3' && rewardIf.height === '2' && !rewardIf.margin, 'the reward window\'s grid reads differently now');
  const helper = trail('scripts/trail_clue_helper.rs2');
  need(/inv_transmit\(trail_rewardinv, trail_reward:inv\);\s*if_openmain\(trail_reward\);\s*queue\(trail_give_reward, 0, 0\);/.test(helper), 'the reward window opens differently now');
  const window = { cols: 3, rows: 2, pitchX: 32, pitchY: 32, x: 4 + Number(rewardIf.x), y: 4 + Number(rewardIf.y) };
  // Each reward's look: its own icon; noted, its note's (cert_<item>); coins by how many (the coins' count1 to count9
  // switch to coins_2 … coins_10000). Rewards that look the same share a cell (also).
  const looks = new Map(), cells = [], entries = [];
  const iconOf = slug => {
    const it = itemDb.get(slug);
    need(it, `LostHQ has no ${slug}`);
    const sx = (it.id % perSheetRow) * SIZE, sy = Math.floor(it.id / perSheetRow) * SIZE;
    if (sy + SIZE > info.height) return null;
    const px = Buffer.alloc(SIZE * SIZE * 4);
    for (let y = 0; y < SIZE; y++) sheet.copy(px, y * SIZE * 4, ((sy + y) * info.width + sx) * 4, ((sy + y) * info.width + sx + SIZE) * 4);
    let outline = 0;
    for (let i = 0; i < SIZE * SIZE; i++) if (px[i * 4 + 3] && !px[i * 4] && !px[i * 4 + 1] && px[i * 4 + 2] === 1) outline++;
    return outline >= 8 ? px : null;
  };
  const coinLooks = Object.entries(OBJ.get('coins')).filter(([k]) => /^count\d+$/.test(k)).map(([, v]) => v.split(',')[0]);
  need(coinLooks.length >= 5, 'coins have no countN looks now');
  const noIcon = [];
  const add = (look, of, noted) => {
    const px = iconOf(look);
    if (!px) { noIcon.push(look); return; }
    const k = px.toString('base64');
    if (looks.has(k)) { const e = entries[looks.get(k)]; if (e.of !== of && !(e.also || []).includes(of)) (e.also || (e.also = [])).push(of); return; }
    looks.set(k, entries.length);
    entries.push({ slug: look, of, ...(noted ? { noted: 1 } : {}) });
    cells.push(px);
  };
  const seenReward = new Set();
  for (const tier of TIERS) for (const i of rewards[tier].items) {
    const k = `${i.slug}${i.noted ? '@noted' : ''}`;
    if (seenReward.has(k)) continue;
    seenReward.add(k);
    if (i.noted) add(`cert_${i.slug}`, i.slug, true);
    else if (i.slug === 'coins') for (const look of ['coins', ...coinLooks]) add(look, 'coins', false);
    else add(i.slug, i.slug, false);
  }
  const ICON_ROW = 16, iconRows = Math.ceil(cells.length / ICON_ROW), iconSheet = Buffer.alloc(ICON_ROW * SIZE * iconRows * SIZE * 4);
  cells.forEach((px, n) => { const dx = (n % ICON_ROW) * SIZE, dy = Math.floor(n / ICON_ROW) * SIZE; for (let y = 0; y < SIZE; y++) px.copy(iconSheet, ((dy + y) * ICON_ROW * SIZE + dx) * 4, y * SIZE * 4, (y + 1) * SIZE * 4); });

  return {
    clues: out, rewards, odd,
    maps: { sheet: maps.sheet, w: maps.cell.w, h: maps.cell.h, perRow: maps.perRow, count: maps.index.size },
    pics: { sheet: await sharp(picSheet, { raw: { width: picRow * PIC, height: picRows * PIC, channels: 4 } }).webp({ quality: 85, alphaQuality: 100, effort: 6 }).toBuffer(), size: PIC, perRow: picRow },
    puzzles: { sheet: await sharp(pieces, { raw: { width: 24 * SIZE, height: 3 * SIZE, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer(), size: SIZE },
    read: { window, entries, perRow: ICON_ROW, noIcon, sheet: await sharp(iconSheet, { raw: { width: ICON_ROW * SIZE, height: iconRows * SIZE, channels: 4 } }).png({ compressionLevel: 9, palette: false }).toBuffer() },
  };
}

if (process.argv[1]?.endsWith('build-clues.mjs')) {
  const [content, lhq] = process.argv.slice(2);
  if (!content || !lhq) throw new Error('usage: node build-clues.mjs <Content checkout> <LostHQ 2004 checkout>');
  const b = await buildClues(content, lhq);
  const stamped = async (file, buf) => { await writeFile(new URL(`./${file}`, import.meta.url), buf); return `${file}?v=${createHash('sha1').update(buf).digest('hex').slice(0, 10)}`; };
  const head = `// Generated by build-clues.mjs. Do not edit by hand; change the script and re-run it.
// Treasure trails as Lost City's server has them (LostCityRS/Content, rev 274, MIT): every clue the game hands
// out, how it's solved and where (cluemaps.webp: the minimaps, drawn from the server's map files), and each
// casket's rewards (the reward scripts' rolls and tables). The map clues' pictures (cluepics.webp) are LostHQ's
// (GPL-3.0); the sliding puzzles' pieces (puzzles.png) are the game's icons of them, from LostHQ's item sheet.
// RuneScape is (c) Jagex Ltd.
`;
  const data = `${head}export const CLUES = ${JSON.stringify(b.clues)};
export const CLUE_REWARDS = ${JSON.stringify(b.rewards)};
export const CLUE_MAPS = ${JSON.stringify({ sheet: await stamped('cluemaps.webp', b.maps.sheet), w: b.maps.w, h: b.maps.h, perRow: b.maps.perRow })};
export const CLUE_PICS = ${JSON.stringify({ sheet: await stamped('cluepics.webp', b.pics.sheet), size: b.pics.size, perRow: b.pics.perRow })};
export const PUZZLES = ${JSON.stringify({ sheet: await stamped('puzzles.png', b.puzzles.sheet), size: b.puzzles.size })};
// (v3.6.1) Reading a casket's screenshot: where the reward window's grid is on the game canvas, and every reward's
// icon as it's drawn there (clueicons.png: of is the reward it is, noted a note of it; also, rewards that look the same)
export const CLUE_READ = ${JSON.stringify({ window: b.read.window, sheet: await stamped('clueicons.png', b.read.sheet), perRow: b.read.perRow, icons: b.read.entries })};
`;
  await writeFile(new URL('./cluedata.js', import.meta.url), data);
  console.log(`cluedata.js: ${b.clues.length} clues (${TIERS.map(t => `${b.clues.filter(c => c.tier === t).length} ${t}`).join(', ')}); cluemaps.webp ${b.maps.count} minimaps (${b.maps.sheet.length} bytes); cluepics.webp ${b.pics.sheet.length} bytes; puzzles.png ${b.puzzles.sheet.length} bytes`);
  console.log(`clueicons.png: ${b.read.entries.length} looks of the rewards${b.read.noIcon.length ? `; no icon on LostHQ's sheet for ${b.read.noIcon.join(', ')}` : ''}; the reward window's grid at ${b.read.window.x}, ${b.read.window.y}`);
  if (b.odd.length) console.log(`notes:\n  ${b.odd.join('\n  ')}`);
}
