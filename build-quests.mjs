// The Quests tab's data (v3.6): node build-quests.mjs <Content checkout> <LostHQ 2004 checkout>
// writes questdata.js. The quests, their order and which are members' are the server's quest list
// (player/interfaces/questlist.if); quest points are what count_questpoints adds up (general/scripts/quests.rs2,
// the constants in quest.constant); the XP is what each quest's completion gives (stat_advance where
// send_quest_complete is called). What it takes, where it starts and the full guides are LostHQ's
// (2004.losthq.rs, GPL-3.0; the guides are RuneHQ's from 2004): its quest guides' "Items & Skills Needed"
// lists, read here. The quests a quest needs done first, the short steps and what it unlocks are written
// for Planner+ (quest-steps.mjs). A file that reads differently stops the build. RuneScape is (c) Jagex Ltd.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { STEPS } from './quest-steps.mjs';

export const SKILL_NAMES = ['attack', 'defence', 'strength', 'hitpoints', 'ranged', 'prayer', 'magic', 'cooking', 'woodcutting', 'fletching', 'fishing',
  'firemaking', 'crafting', 'smithing', 'mining', 'herblore', 'agility', 'thieving', 'runecraft'];

// ── The server ─────────────────────────────────────────────────────────────
export async function serverQuests(content) {
  const sc = p => join(content, 'scripts', p);
  const text = p => readFile(sc(p), 'utf8');
  // the quest list: each line's component, words and height
  const comps = [];
  let cur = null;
  for (const line of (await text('player/interfaces/questlist.if')).split(/\r?\n/)) {
    const h = line.match(/^\[(\w+)\]$/);
    if (h) { cur = { comp: h[1] }; comps.push(cur); continue; }
    const kv = line.match(/^(\w+)=(.*)$/);
    if (cur && kv) cur[kv[1]] = kv[2];
  }
  const rows = comps.filter(c => c.text != null && c.y != null).map(c => ({ comp: c.comp, text: c.text, y: Number(c.y) })).sort((a, b) => a.y - b.y);
  const freeAt = rows.find(r => r.text === 'FREE QUESTS:')?.y, membersAt = rows.find(r => r.text === 'MEMBERS QUESTS:')?.y;
  if (freeAt == null || membersAt == null || !(freeAt < membersAt)) throw new Error('quests: the quest list has no FREE QUESTS: / MEMBERS QUESTS: headings now');
  const list = rows.filter(r => r.y > freeAt && r.text !== 'MEMBERS QUESTS:').map(r => ({ comp: r.comp, name: r.text, members: r.y > membersAt ? 1 : 0 }));
  if (list.length < 60) throw new Error(`quests: only ${list.length} quests in the list`);

  // the constants
  const consts = new Map();
  for (const m of (await text('general/configs/quest.constant')).matchAll(/^\^(\w+) = (-?\d+)/gm)) consts.set(m[1], Number(m[2]));
  // quest points: what count_questpoints adds, one check a quest
  const quests = await text('general/scripts/quests.rs2');
  const count = quests.match(/\[proc,count_questpoints\]\(\)\(int\)([^]*?)\n\[/)?.[1];
  if (!count) throw new Error('quests: count_questpoints is gone');
  const counted = [...count.matchAll(/\$questpoints = add\(\$questpoints, \^(\w+)_questpoints\);/g)].map(m => m[1]);
  if (counted.length !== list.length) throw new Error(`quests: count_questpoints counts ${counted.length} quests, the list has ${list.length}`);
  // every script: what each quest's completion gives (the block that calls send_quest_complete for it)
  const files = (await readdir(sc(''), { recursive: true })).map(f => f.replace(/\\/g, '/')).filter(f => f.endsWith('.rs2') && !f.startsWith('_test'));
  const done = new Map();                      // comp -> { qp constant, xp: { skill: xp } }
  for (const f of files) {
    const t = await text(f);
    if (!t.includes('send_quest_complete(questlist:')) continue;
    for (const block of t.replace(/\/\/[^\n]*/g, '').split(/^(?=\[)/m)) {
      for (const m of block.matchAll(/~send_quest_complete\(questlist:(\w+), *\w+, *\d+, *\^(\w+)_questpoints,/g)) {
        const xp = {};
        for (const s of block.matchAll(/stat_advance\((\w+), *(\d+)\);/g)) {
          if (!SKILL_NAMES.includes(s[1])) throw new Error(`quests: ${m[1]} gives XP in ${s[1]}?`);
          xp[s[1]] = (xp[s[1]] || 0) + Number(s[2]) / 10;
        }
        const was = done.get(m[1]);
        if (was && JSON.stringify(was.xp) !== JSON.stringify(xp)) throw new Error(`quests: ${m[1]} is completed in two ways that give different XP`);
        done.set(m[1], { qpName: m[2], xp });
      }
    }
  }
  for (const q of list) {
    // its quest points: its own constant if count_questpoints counts one by its name, else the one its completion shows
    const own = counted.includes(q.comp) ? q.comp : done.get(q.comp)?.qpName;
    if (!own || !counted.includes(own) || !consts.has(`${own}_questpoints`)) throw new Error(`quests: can't tell ${q.name}'s quest points`);
    q.qp = consts.get(`${own}_questpoints`);
    q.xp = done.get(q.comp)?.xp || {};
  }
  if (new Set(list.map(q => q.qp === undefined ? null : q.comp)).size !== list.length) throw new Error('quests: a quest is counted twice');
  return list;
}

// ── LostHQ's guides ────────────────────────────────────────────────────────
const SKILL_WORD = new Map(SKILL_NAMES.map(s => [s[0].toUpperCase() + s.slice(1), s]));
const clean = s => s.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#039;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
export async function lostHqGuides(lhq) {
  const index = await readFile(join(lhq, 'pages/questguides/main.php'), 'utf8');
  const out = new Map();
  for (const m of index.matchAll(/^\s*"(\w+)" => \["([^"]+)", (\d)\],/gm)) {
    const [, key, name, type] = m;
    const dir = type === '2' ? 'miniquest' : type === '1' ? 'members' : 'free';
    const page = await readFile(join(lhq, `pages/questguides/${dir}/${key}.php`), 'utf8');
    const field = re => { const f = page.match(re); return f ? clean(f[1]) : null; };
    const g = {
      key, name, mini: type === '2', members: type === '1',
      difficulty: field(/<b>Difficulty:\s*(?:<font[^>]*>)?([^<]+)/), length: field(/<b>Length:\s*(?:<font[^>]*>)?([^<]+)/),
      start: field(/<b>Starting Location:<\/b>([^]*?)<br/), reward: field(/<b>Reward:<\/b>([^]*?)(?:<\/div>|<br>\s*<br>|<h3>)/),
      skills: {}, qp: 0, needs: [], items: [], recommended: [],
    };
    // "Items & Skills Needed:": the first list (a heading then its own list, like Telekinetic Grab:, is optional)
    const need = page.match(/<h3>Items &(?:amp;)? Skills Needed:<\/h3>\s*<ul[^>]*>([^]*?)<\/ul>/);
    const rec = page.match(/<h3>Recommended:<\/h3>\s*<ul[^>]*>([^]*?)<\/ul>/);
    const lines = html => [...(html || '').matchAll(/<li>([^]*?)<\/li>/g)].map(l => l[1]);
    for (const l of lines(need?.[1])) {
      const item = l.match(/itemname="([^"]+)"/);
      const words = clean(l.replace(/<canvas[^>]*><\/canvas>/g, ''));
      const replace = l.match(/name-replace="([^"]*)"/)?.[1], append = l.match(/name-append="([^"]*)"/)?.[1];
      if (item) { g.items.push({ item: item[1], text: replace ? clean(replace) : null, more: append ? clean(append).replace(/^\(|\)$/g, '') : null }); continue; }
      const skill = words.match(/^(\d+) ([A-Z][a-z]+)$/);
      if (skill && SKILL_WORD.has(skill[2])) { g.skills[SKILL_WORD.get(skill[2])] = Number(skill[1]); continue; }
      const qp = words.match(/^(\d+) Quest points?\b/i);
      if (qp) { g.qp = Number(qp[1]); continue; }
      if (words) g.needs.push(words);
    }
    for (const l of lines(rec?.[1])) {
      const item = l.match(/itemname="([^"]+)"/), replace = l.match(/name-replace="([^"]*)"/)?.[1];
      const words = clean(l.replace(/<canvas[^>]*><\/canvas>/g, ''));
      g.recommended.push(item ? { item: item[1], text: replace ? clean(replace) : null } : { text: words });
    }
    g.steps = [...page.matchAll(/<div data-progress>([^]*?)<\/div>/g)].map(s => clean(s[1])).filter(Boolean);
    out.set(key, g);
  }
  return out;
}

// The server's name for a quest -> LostHQ's key (names that differ in more than case and punctuation)
const LHQ_KEY = { "Witch's House": 'witchshouse' };
const squash = s => s.toLowerCase().replace(/^the /, '').replace(/[^a-z]/g, '');
// XP the server gives outside the block that completes the quest (each checked against its script)
const MORE_XP = {
  itgronigen: { file: 'quests/quest_itgronigen/scripts/quest_itgronigen.rs2', has: ['stat_advance(crafting, 22500);', 'stat_advance(strength, 8750);', 'stat_advance(defence, 8750);', 'stat_advance(hitpoints, 8750);', 'stat_advance(attack, 8750);'],
    xp: { crafting: 2250 }, note: 'and 875 XP in Attack, Strength, Defence or Hitpoints, by the constellation you see' },
  seaslug: { file: 'areas/area_ardougne_east/scripts/caroline.rs2', has: ['stat_advance(fishing, 71750);'], xp: { fishing: 7175 } },
  itwatchtower: { file: 'quests/quest_itwatchtower/scripts/quest_itwatchtower.rs2', has: ['stat_advance(magic, 153000);'], xp: { magic: 15300 } },
  desertrescue: { file: 'quests/quest_desertrescue/scripts/irena.rs2', has: ['stat_advance(fletching, 46500);', 'stat_advance(agility, 46500);', 'stat_advance(smithing, 46500);', 'stat_advance(thieving, 46500);', 'Okay, now choose your second skill.'],
    xp: {}, note: '4,650 XP twice, in Agility, Fletching, Smithing or Thieving (you choose)' },
  legends: { file: 'quests/quest_legends/scripts/radimus_erkle.rs2', has: ['stat_advance($skill, 76500);'], xp: {}, note: '7,650 XP four times, in skills you choose' },
};
const SKILL_LOOSE = new Map([...SKILL_NAMES.map(s => [s, s]), ['ranging', 'ranged'], ['range', 'ranged']]);

export async function buildQuests(content, lhq) {
  const { MINIQUESTS } = await import('./quest-steps.mjs');
  const server = await serverQuests(content);
  const guides = await lostHqGuides(lhq);
  const byName = new Map([...guides.values()].map(g => [squash(g.name), g]));
  // (an item's name, for those the app has no icon of: LostHQ's item database)
  const itemDb = new Map(JSON.parse(await readFile(join(lhq, 'js/itemdb/item_data.json'), 'utf8')).map(i => [i.debugname, i.name]));
  const rows = [
    ...server.map(q => ({ ...q, key: q.comp, g: LHQ_KEY[q.name] ? guides.get(LHQ_KEY[q.name]) : byName.get(squash(q.name)) })),
    ...MINIQUESTS.map(m => ({ key: m.key, name: m.name, members: 1, mini: 1, qp: 0, xp: {}, g: guides.get(m.lhq) })),
  ];
  const keys = new Set(rows.map(r => r.key));
  const out = [], notes = [];
  for (const r of rows) {
    const { g } = r;
    if (!g) throw new Error(`quests: LostHQ has no guide for ${r.name}`);
    if (!r.mini && g.members !== !!r.members) throw new Error(`quests: ${r.name} is ${r.members ? 'members' : 'free'} on the server, not on LostHQ`);
    if (!!r.mini !== g.mini) throw new Error(`quests: ${r.name} is a miniquest on one side only`);
    const st = STEPS[r.key];
    if (!st?.steps?.length) throw new Error(`quests: quest-steps.mjs has no steps for ${r.name} (${r.key})`);
    for (const k of st.quests || []) if (!keys.has(k)) throw new Error(`quests: ${r.name} needs ${k}, which isn't a quest`);
    // its XP: the server's, and what it gives elsewhere
    let xp = r.xp, xpNote = null;
    const more = MORE_XP[r.key];
    if (more) {
      if (Object.keys(xp).length) throw new Error(`quests: ${r.name}'s completion gives XP now: look at MORE_XP`);
      const t = await readFile(join(content, 'scripts', more.file), 'utf8');
      for (const h of more.has) if (!t.includes(h)) throw new Error(`quests: ${more.file} doesn't have ${h} now`);
      xp = more.xp; xpNote = more.note || null;
    }
    // what LostHQ's guide says it takes: skills, quest points, and the rest in words
    const skills = { ...g.skills }, needs = [];
    for (const n of g.needs) {
      const m = n.match(/^(\d+) ([A-Za-z]+)\b/);
      if (m && SKILL_LOOSE.has(m[2].toLowerCase())) { skills[SKILL_LOOSE.get(m[2].toLowerCase())] = Number(m[1]); continue; }
      if (/^none$/i.test(n) || /^Completion of /.test(n)) continue;
      needs.push(n);
    }
    out.push({
      key: r.key, name: r.name, members: r.members ? 1 : 0, ...(r.mini ? { mini: 1 } : {}), qp: r.qp,
      lhq: g.key, difficulty: g.difficulty, length: g.length, start: g.start,
      skills, needQp: g.qp || 0, quests: st.quests || [], needs,
      // [item, words for it (else its name), more, its name]; a stack's icon (coins_100) is the item's
      items: g.items.map(i => { const item = /^coins_\d+$/.test(i.item) ? 'coins' : i.item; return [item, i.text, i.more, itemDb.get(i.item) || null]; }),
      xp, ...(xpNote ? { xpNote } : {}), ...(st.unlocks ? { unlocks: st.unlocks } : {}), steps: st.steps,
    });
  }
  // a quest's quests can't need it back
  const need = new Map(out.map(q => [q.key, q.quests]));
  const all = k => { const seen = new Set(), go = x => { for (const y of need.get(x) || []) if (!seen.has(y)) { seen.add(y); go(y); } }; go(k); return seen; };
  for (const q of out) if (all(q.key).has(q.key)) throw new Error(`quests: ${q.name} needs itself`);
  for (const k of Object.keys(STEPS)) if (!keys.has(k)) notes.push(`quest-steps.mjs has ${k}, which isn't a quest`);
  if (notes.length) throw new Error(notes.join('\n'));
  return out;
}

if (process.argv[1]?.endsWith('build-quests.mjs')) {
  const [content, lhq] = process.argv.slice(2);
  if (!content || !lhq) throw new Error('usage: node build-quests.mjs <Content checkout> <LostHQ 2004 checkout>');
  const quests = await buildQuests(content, lhq);
  const qp = quests.reduce((t, q) => t + q.qp, 0);
  const head = `// Generated by build-quests.mjs. Do not edit by hand; change the script (or quest-steps.mjs) and re-run it.
// The quests, which are members', their quest points and XP are Lost City's server's (LostCityRS/Content,
// rev 274, MIT): its quest list and count_questpoints. What a quest takes and where it starts are from
// LostHQ's quest guides (GPL-3.0; the guides themselves are RuneHQ's, 2004), and so are the full guides
// linked. The steps are written for Planner+. RuneScape is (c) Jagex Ltd.
`;
  await writeFile(new URL('./questdata.js', import.meta.url), `${head}export const QUEST_POINTS = ${qp};\nexport const QUESTS = ${JSON.stringify(quests)};\n`);
  console.log(`questdata.js: ${quests.filter(q => !q.mini).length} quests (${qp} quest points), ${quests.filter(q => q.mini).length} miniquests`);
}
