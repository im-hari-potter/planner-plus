// The Clues tab (v3.6): how many clues of each kind you've done, what you bring, every clue the server hands
// out and its answer (found from what's on your scroll: words, an anagram, coordinates or a map's picture), the
// rewards a casket gives (the server's tables) against what you've had, and a solver for the puzzle box.
// (v3.6.1) A casket counted from a screenshot of its rewards (cluereader.js): from the counts at the top you say
// which kind of clue it was; from Rewards it's counted by itself when its rewards can only be from one kind.
// (v3.6.2) And a puzzle box's puzzle read from a screenshot, and solved from there.
import { CLUES, CLUE_MAPS, CLUE_PICS, PUZZLES, CLUE_READ, CLUE_REWARDS } from './cluedata.js';
import { ITEMS } from './gamedata.js';
import { luck, dryChance } from './loot.js';
import { chanceText, oneIn } from './npc-ui.js';
import { TIERS, TIER_NAMES, CLUE_BY_ID, findClues, kindGroup, KIND_GROUPS, KIND_NAMES, coordsText, rewardsOf, anyOf, GROUPS } from './clues.js';
import { solve, solvable, slide, direction, SOLVED, isSolved } from './puzzle.js';

const VIEWS = ['solve', 'rewards', 'puzzle'];
const VIEW_WORDS = { solve: 'Solve a clue', rewards: 'Rewards', puzzle: 'Puzzle box' };
const LETTERS = ['b', 'c', 'd'];
const ARROW = { up: '↑', down: '↓', left: '←', right: '→' };
const wildOf = c => Number(c.where?.match(/Wilderness level (\d+)/)?.[1] || 0);
// (the screenshots counted, by their pixels: as many as this kept)
const SHOTS_KEPT = 300;
const an = t => (t === 'easy' ? 'an' : 'a');

// P: { esc, fmt, $, itemIcon, store, safe, account, renderAccount, redraw, gpShort, pickFiles, pixelsOf }
export function createClueUi(P) {
  const { esc, fmt, $ } = P;
  const ui = P.store.get('clueUi', {});
  const U = {
    view: VIEWS.includes(ui.view) ? ui.view : 'solve',
    tier: TIERS.includes(ui.tier) ? ui.tier : null,
    kind: KIND_GROUPS.includes(ui.kind) ? ui.kind : null,
    rtier: TIERS.includes(ui.rtier) ? ui.rtier : 'hard',
    find: '', open: null,
    // (v3.6.2 note: what reading a screenshot of it found; unsure: slots it couldn't be sure of)
    pz: { letter: LETTERS.includes(ui.pz) ? ui.pz : 'b', cells: Array(25).fill(null), moves: null, step: 0, busy: false, msg: '', note: null, unsure: [], reading: false },
    undo: null,
    // (v3.6.1) screenshots, each place's own (top: from the counts; bottom: Rewards): being read ({ busy }) or
    // waiting to be checked ({ queue }); what was done with them (note), pages that look alike to say which
    // (pending), the rows they added to (fresh)
    shots: { top: null, bottom: null }, note: null, pending: [], fresh: null, pickFrom: 'bottom',
  };
  let addId = 0;
  // (a link out: in LostKit the tool's own tab, ◀ comes back; in a browser a new tab)
  const out = url => `href="${esc(url)}"${P.inLostKit ? '' : ' target="_blank" rel="noopener"'}`;
  const saveUi = () => P.store.set('clueUi', { view: U.view, tier: U.tier, kind: U.kind, rtier: U.rtier, pz: U.pz.letter });
  const key = () => 'clues.' + P.safe();
  const data = () => {
    const v = P.safe() ? P.store.get(key(), null) : null;
    const done = {}, got = {};
    for (const t of TIERS) {
      done[t] = Math.max(0, Math.floor(Number(v?.done?.[t]) || 0));
      got[t] = {};
      // (0 kept too: typed in, it says none so far; never typed in, nothing's said)
      for (const [s, n] of Object.entries(v?.got?.[t] || {})) if (Number(n) >= 0) got[t][s] = Math.floor(Number(n));
    }
    const shots = (Array.isArray(v?.shots) ? v.shots : []).filter(x => x && typeof x.w === 'string').slice(-SHOTS_KEPT);
    return { done, got, shots };
  };
  const save = d => P.store.set(key(), { ...d, updated: Date.now() });

  // ── The tab ──
  function render() {
    // (what was being done with screenshots, and what Undo would undo, is the account's it was done for)
    if (U.acct !== P.safe()) Object.assign(U, { acct: P.safe(), shots: { top: null, bottom: null }, note: null, pending: [], fresh: null, undo: null });
    P.renderAccount('clues-account', 'clues');
    const body = $('clues-body');
    const acct = !!P.account();
    const d = data();
    const total = TIERS.reduce((t, k) => t + d.done[k], 0);
    const count = t => `<div class="clue-tier">${P.itemIcon(`clue_scroll_${t}`, true)}<span class="ct-name">${TIER_NAMES[t]}</span>
      <span class="got-box"><button type="button" class="mv" data-clue-step="-1" data-tier="${t}" aria-label="One ${t} clue fewer"${d.done[t] ? '' : ' disabled'}>−</button><input class="input small num" data-clue-n="${t}" inputmode="numeric" value="${d.done[t] || ''}" placeholder="0" aria-label="${TIER_NAMES[t]} clues done"><button type="button" class="mv" data-clue-step="1" data-tier="${t}" aria-label="One ${t} clue more">+</button></span></div>`;
    const kit = [
      [['spade'], 'Spade', 'to dig'],
      [['trail_sextant', 'trail_watch', 'trail_chart'], 'Sextant, watch and chart', 'for coordinates (medium and hard): you can\'t dig one without all three'],
      [[], 'Teleports', 'runes, tablets, a ring of dueling, an amulet of glory'],
      [['knife'], 'Knife', 'or a slash weapon, for the webs on the way to Wilderness steps'],
    ];
    body.innerHTML = `<div class="card clue-top">
        ${acct ? `<div class="clue-counts"><span class="c-muted">Clues done</span>${TIERS.map(count).join('')}<span class="c-faint small-note">${fmt(total)} in all. Count one when you open its casket, or</span><button type="button" class="btn small" data-clue-shot="top" title="A screenshot taken while a casket's rewards show: you say which kind of clue it was, and it's counted with its rewards">Read a screenshot</button></div>
        ${noteHtml('top')}${shotHtml('top')}` : ''}
        <div class="clue-kit"><span class="c-muted">Bring</span>${kit.map(([slugs, name, why]) => `<span class="kit-item" title="${esc(`${name}: ${why}`)}">${slugs.map(s => P.itemIcon(s, true)).join('')}<span>${esc(name)} <span class="c-faint small-note">${esc(why)}</span></span></span>`).join('')}</div>
      </div>
      <div class="bar wrap clue-views">${seg(VIEWS, VIEW_WORDS, U.view, 'clue-view')}</div>
      ${U.view === 'solve' ? solveHtml() : U.view === 'rewards' ? rewardsHtml(d, acct) : puzzleHtml()}`;
  }
  const seg = (list, words, cur, attr, any = null) => `<div class="seg" role="group">${any ? `<button type="button" data-${attr}="" class="${cur ? '' : 'on'}" aria-pressed="${!cur}">${any}</button>` : ''}${list.map(v => `<button type="button" data-${attr}="${v}" class="${v === cur ? 'on' : ''}" aria-pressed="${v === cur}">${words[v]}</button>`).join('')}</div>`;

  // ── Solve a clue ──
  function solveHtml() {
    const found = U.find.trim() ? findClues(U.find, { tier: U.tier, kind: U.kind, max: 15 }) : null;
    const list = found ? found.map(r => r.clue) : CLUES.filter(c => (!U.tier || c.tier === U.tier) && (!U.kind || kindGroup(c) === U.kind));
    const near = found?.length && found[0].near != null;
    const head = `<div class="bar wrap clue-find-bar"><input class="input clue-find" type="search" data-clue-find="1" value="${esc(U.find)}" placeholder="What your clue says: a few of its words, the anagram, or coordinates (22 35 N 19 18 E)" aria-label="Find your clue" spellcheck="false"></div>
      <div class="bar wrap">${seg(TIERS, TIER_NAMES, U.tier, 'clue-tier', 'Any')}${seg(KIND_GROUPS, KIND_NAMES, U.kind, 'clue-kind', 'All')}</div>`;
    let rows;
    if (found && !found.length) rows = `<div class="empty">No clue says that. Try fewer words, or just the unusual ones.</div>`;
    else if (!found && U.kind === 'map') rows = mapsHtml(list);
    else rows = `${near ? '<p class="c-muted small-note">No clue says exactly those coordinates; these dig nearest where they point.</p>' : ''}
      <div class="clue-list">${list.map((c, n) => rowHtml(c, found && (n === 0 || U.open === c.id) && U.open !== `-${c.id}`)).join('')}</div>`;
    return `<div class="card clue-solve">${head}${rows}
      <p class="note">Every clue the server hands out (${fmt(CLUES.length)}: what's in each one's words, and where it leads, are read from the server's scripts and map). Click one for its answer and a minimap: a red cross is where to dig or search (a square off is near enough to dig), a yellow dot who to talk to. Map clues: pick the picture you have. More on each kind of clue: <a ${out('https://2004.losthq.rs/?p=clueguides')}>LostHQ's clue guides ↗</a></p></div>`;
  }
  function mapsHtml(list) {
    return `<div class="clue-maps">${list.filter(c => c.pic != null).map(c => `<button type="button" class="clue-pic-btn${U.open === c.id ? ' on' : ''}" data-clue-open="${c.id}" title="${esc(`${TIER_NAMES[c.tier]} map: ${c.where || ''}`)}">${picHtml(c, 0.6)}<span class="tier-tag t-${c.tier}">${TIER_NAMES[c.tier]}</span></button>`).join('')}</div>
      ${U.open && CLUE_BY_ID.get(U.open)?.kind === 'map' ? cardHtml(CLUE_BY_ID.get(U.open)) : ''}`;
  }
  const picHtml = (c, z = 1) => `<span class="clue-pic" role="img" aria-label="The map" style="--z:${z};--ps:${CLUE_PICS.size};--pr:${CLUE_PICS.perRow};--px:${c.pic % CLUE_PICS.perRow};--py:${Math.floor(c.pic / CLUE_PICS.perRow)};background-image:url('${CLUE_PICS.sheet}')"></span>`;
  const firstLine = c => (c.coords ? coordsText(c.coords) : c.kind === 'map' ? 'A map' : (c.text || '').split('\n').filter(Boolean).slice(c.kind === 'anagram' && /speak to next/i.test(c.text) ? -1 : 0)[0] || '');
  function doText(c) {
    if (c.do === 'talk') return `Talk to ${c.npc}`;
    if (c.do === 'search') return `${c.op || 'Search'} the ${String(c.loc || '').toLowerCase().replace(/^closed /, '')}`;
    return 'Dig';
  }
  function rowHtml(c, open) {
    const o = open || U.open === c.id;
    return `<div class="clue-row${o ? ' is-open' : ''}" data-clue="${c.id}">
      <button type="button" class="clue-row-head" data-clue-open="${o ? `-${c.id}` : c.id}" aria-expanded="${o}">
        <span class="tier-tag t-${c.tier}">${TIER_NAMES[c.tier]}</span>
        <span class="cr-text">${esc(firstLine(c))}</span>
        <span class="cr-ans">${esc(doText(c))}${c.where ? ` <span class="c-faint">· ${esc(c.where)}</span>` : ''}${c.challenge ? ` <span class="c-faint">· answer ${c.challenge.a}</span>` : ''}</span>
      </button>${o ? cardHtml(c) : ''}</div>`;
  }
  function mapHtml(n, tip) {
    if (n == null) return '';
    return `<div class="clue-map npc-map"><div class="npc-map-img" role="img" aria-label="${esc(tip)}" title="${esc(tip)}" style="--z:1.5;--sheet:url('${CLUE_MAPS.sheet}');--mw:${CLUE_MAPS.w};--mh:${CLUE_MAPS.h};--sw:${CLUE_MAPS.perRow * CLUE_MAPS.w};--mx:${(n % CLUE_MAPS.perRow) * CLUE_MAPS.w};--my:${Math.floor(n / CLUE_MAPS.perRow) * CLUE_MAPS.h}"></div></div>`;
  }
  function cardHtml(c) {
    const lines = [];
    const wild = wildOf(c);
    if (c.coords) lines.push(`Dig at ${esc(coordsText(c.coords))}: the sextant (with the watch and chart) says where you stand.`);
    if (c.guardian) lines.push(`Digging brings a ${esc(c.guardian.who)}${c.guardian.level ? ` (level ${c.guardian.level})` : ''}: kill it, then dig again.`);
    if (c.key) lines.push(`It's locked: kill ${esc(c.key.any ? c.key.who.toLowerCase().replace(/^any /, 'any ') : c.key.who)}${c.key.level ? ` (level ${c.key.level})` : ''} while you have this clue for its key${c.key.where ? ` (${esc(c.key.where)})` : ''}.`);
    if (c.challenge) lines.push(`${esc(c.npc)} gives you a challenge scroll: "${esc(c.challenge.q)}" The answer is <b>${c.challenge.a}</b>${c.challenge.server != null ? ` <span class="c-faint">(what worked in the game; the server's files say ${c.challenge.server})</span>` : ''}.`);
    if (c.puzzle) lines.push(`${esc(c.npc)} gives you a puzzle box first. <button type="button" class="linkish" data-clue-puzzle="${c.puzzle}">Solve it here</button>, then talk to ${esc(c.npc)} again.`);
    if (wild) lines.push(`<span class="c-lose">Wilderness level ${wild}</span>: bring a knife or a slash weapon for webs, and nothing you'd hate to lose.`);
    const tip = c.do === 'talk' ? `Where ${c.npc} is: a yellow dot, as on the game's minimap` : `Where to ${c.do}: the red cross, on the game's minimap`;
    return `<div class="clue-card">
      <div class="cc-body">
        ${c.kind === 'map' ? picHtml(c, 1) : c.text ? `<div class="cc-text">${esc(c.text)}</div>` : ''}
        <div class="cc-answer"><b>${esc(doText(c))}</b>${c.where ? ` <span class="c-muted">${esc(c.where)}</span>` : ''}</div>
        ${lines.length ? `<ul class="cc-notes">${lines.map(l => `<li>${l}</li>`).join('')}</ul>` : ''}
        ${c.key?.map != null ? `<div class="cc-key"><span class="c-muted small-note">Where ${esc(c.key.who)} is:</span>${mapHtml(c.key.map, `Where ${c.key.who} is`)}</div>` : ''}
      </div>
      ${mapHtml(c.map, tip)}
    </div>`;
  }

  // ── Rewards ──
  function rewardsHtml(d, acct) {
    const t = U.rtier, R = rewardsOf(t), n = d.done[t], got = d.got[t];
    const rolls = R.rolls[0] === R.rolls[1] ? `${R.rolls[0]}` : `${R.rolls[0]} to ${R.rolls[1]}`;
    const rares = R.items.filter(i => i.rare), commons = R.items.filter(i => !i.rare).sort((a, b) => b.p - a.p);
    const rareCasket = anyOf(rares, R.rolls);
    const trials = Math.round(n * R.meanRolls);
    const groups = GROUPS.map(g => ({ ...g, list: R.items.filter(g.test) })).filter(g => g.list.length);
    const sum = (list, f) => list.reduce((t, i) => t + f(i), 0);
    const expect = x => (x >= 10 ? fmt(Math.round(x)) : x.toFixed(1).replace(/\.0$/, ''));
    const chips = groups.map(g => {
      const e = sum(g.list, i => i.perCasket * n), have = sum(g.list, i => got[i.slug] || 0);
      return `<span class="rw-chip" title="${esc(`${g.name}: ${g.list.map(i => nameOf(i)).join(', ')}`)}">${esc(g.name)} <b>${n ? `≈ ${expect(e)}` : `${expect(sum(g.list, i => i.perCasket))} a casket`}</b>${n && have ? ` <span class="c-faint">(you've ${fmt(have)})</span>` : ''}</span>`;
    }).join('');
    const coins = R.items.find(i => i.slug === 'coins');
    const gotRares = rares.filter(i => got[i.slug] > 0).length;
    return `<div class="card clue-rewards">
      <div class="bar wrap">${seg(TIERS, TIER_NAMES, t, 'clue-rtier')}<span class="c-muted">${TIER_NAMES[t]} clues done: <b>${fmt(n)}</b></span></div>
      ${acct ? `<div class="bar wrap clue-shot-bar"><button type="button" class="btn small" data-clue-shot="bottom">Read a screenshot</button><span class="c-faint small-note">of a casket's rewards, taken while they show: when they can only be from one kind of clue, it's counted with them by itself. Or drop or paste one here.</span></div>
        ${noteHtml('bottom')}${shotHtml('bottom')}` : ''}
      <p class="note">A ${t} casket has ${rolls} rewards (${R.meanRolls} on average), each one rare 1 in ${R.rare}: a rare one in ${chanceText(rareCasket)} of caskets. Every chance here is the server's (trail_clue_${t}_reward), the items equally likely within the common and the rare table.</p>
      <h5>${n ? `After your ${fmt(n)} ${t} clues you'd have about` : 'A casket gives on average'}</h5>
      <div class="rw-chips">${chips}${coins ? `<span class="rw-chip">Coins <b>${n ? `≈ ${fmt(Math.round(coins.perCasket * n))}` : `${fmt(Math.round(coins.perCasket))} a casket`}</b></span>` : ''}</div>
      ${n && acct ? `<div class="bar wrap"><button type="button" class="btn small" data-clue-fill="${t}" title="Your Got column for the common armour, weapons, bows and pages set to how many you'd have after ${fmt(n)} clues, rounded: change any you remember">Fill in what's expected</button>
        ${U.undo?.what === 'fill' && U.undo.tier === t ? `<button type="button" class="linkish" data-clue-undo="1">Undo</button>` : ''}
        <span class="c-faint small-note">Then tick off the rares you've had below, and change what you remember.</span></div>` : ''}
      <h5>Rare rewards <span class="c-faint small-note">${acct ? `${gotRares} of ${rares.length}: click one you've had` : `${rares.length} of them`}</span></h5>
      <div class="rw-rares">${rares.map(i => `<button type="button" class="rw-rare${got[i.slug] > 0 ? ' on' : ''}" data-clue-rare="${i.slug}" aria-pressed="${got[i.slug] > 0}"${acct ? '' : ' disabled'} title="${esc(`${nameOf(i)}${i.lo > 1 ? ` (${i.lo}${i.noted ? ', noted' : ''})` : ''}: 1 in ${fmt(Math.round(1 / i.p))} a reward, ${chanceText(i.casket)} a casket${got[i.slug] > 0 ? `. You've had ${got[i.slug]}` : ''}`)}">${ITEMS[i.slug] ? P.itemIcon(i.slug) : `<span class="rw-noicon">${esc(nameOf(i))}</span>`}${got[i.slug] > 1 ? `<span class="rw-n">${got[i.slug]}</span>` : ''}</button>`).join('')}</div>
      <div class="table-wrap"><table class="grid loot-t clue-t"><thead><tr><th class="l">Item</th><th title="How many one reward is">Each</th><th title="The chance a reward is this one">A reward</th><th title="The chance a casket has at least one">A casket</th>
        ${n ? `<th class="wrap sep-l" title="How many on average after the clues you've done">Expected<br>after ${fmt(n)}</th>` : ''}${acct ? `<th class="${n ? '' : 'sep-l'}" title="What you've had: type it in, or − and +">Got</th>` : ''}${n ? '<th class="l" title="How what you\'ve had compares with other players\' after as many clues: green, the share of them who\'d have fewer; red, the share who\'d have more; dry, so many times the clues it takes on average">Luck</th>' : ''}</tr></thead>
        <tbody>${[...commons, ...rares].map((i, k) => rewardRow(i, n, trials, got[i.slug], k === commons.length, acct, U.fresh?.tier === t && U.fresh.slugs.has(i.slug))).join('')}</tbody></table></div>
    </div>`;
  }
  const nameOf = i => ITEMS[i.slug]?.name || i.name || i.slug;
  // (g: what's typed in for it, undefined if nothing is)
  function rewardRow(i, n, trials, typed, firstRare, acct, fresh) {
    const g = typed || 0;
    const each = i.lo === i.hi ? fmt(i.lo) : `${fmt(i.lo)}–${fmt(i.hi)}`;
    const name = `${ITEMS[i.slug] ? P.itemIcon(i.slug, true) : ''} ${esc(nameOf(i))}${i.noted ? ' <span class="c-faint small-note">(noted)</span>' : ''}${i.rare ? ' <span class="alch-tag">rare</span>' : ''}`;
    const step = i.lo === i.hi ? i.lo : 1;
    const box = `<span class="got-box"><button type="button" class="mv" data-clue-got-step="-${step}" data-slug="${i.slug}" aria-label="Fewer"${g > 0 ? '' : ' disabled'}>−</button><input class="input small num" data-clue-got="${i.slug}" inputmode="numeric" value="${typed != null ? fmt(g) : ''}" placeholder="–" aria-label="${esc(nameOf(i))} had"><button type="button" class="mv" data-clue-got-step="${step}" data-slug="${i.slug}" aria-label="More">+</button></span>`;
    const exp = i.perCasket * n;
    const one = 1 / i.p;
    const cls = [firstRare && 'rw-first-rare', fresh && 'is-new'].filter(Boolean).join(' ');
    return `<tr data-reward="${i.slug}${i.noted ? '@noted' : ''}"${cls ? ` class="${cls}"` : ''}${fresh ? ' title="Just added from a screenshot"' : ''}><td class="l"><span class="sk-cell">${name}</span></td><td>${each}</td><td>1/${one >= 100 ? fmt(Math.round(one)) : one.toFixed(1).replace(/\.0$/, '')}</td><td>${chanceText(i.casket)}</td>
      ${n ? `<td class="sep-l">${exp >= 10 ? fmt(Math.round(exp)) : exp >= 0.01 ? exp.toFixed(2).replace(/\.?0+$/, '') : exp > 0 ? exp.toPrecision(1) : '0'}</td>` : ''}${acct ? `<td class="got${n ? '' : ' sep-l'}">${box}</td>` : ''}${n ? `<td class="l small-note luck">${typed != null && acct ? luckText(i, trials, g, n) : ''}</td>` : ''}</tr>`;
  }
  // How lucky what you've had is, after so many rewards (a casket's average count times the clues)
  function luckText(i, trials, g, n) {
    if (!trials) return '';
    if (!g) {
      const x = trials * i.p, dry = dryChance(i.p, trials);
      const one = oneIn(dry);
      const tip = `${nameOf(i)}: none in ${fmt(n)} clues, about ${fmt(trials)} rewards: ${x.toFixed(2).replace(/\.?0+$/, '')} × the average it takes. Going this dry happens to ${chanceText(dry)} of players${one ? ` (${one})` : ''}.`;
      if (x < 1) return `<span class="c-faint" title="${esc(tip)}">none yet</span>`;
      return `<span class="${dry < 0.1 ? 'c-lose' : ''}" title="${esc(tip)}">dry ${x >= 10 ? Math.round(x) : x.toFixed(2).replace(/\.?0+$/, '')}×</span>`;
    }
    const l = luck(i.d, trials, g);
    const tip = `${fmt(g)} after ${fmt(n)} clues (${(l.drops ? l.expectedDrops * (i.d.one || 1) : l.expected).toFixed(1)} expected). ${chanceText(l.fewer)} of players would have fewer, ${chanceText(l.more)} more.`;
    if (l.fewer > 0.5) return `<span class="c-win" title="${esc(tip)}">${chanceText(l.fewer)}</span>`;
    if (l.more > 0.5) return `<span class="c-lose" title="${esc(tip)}">${chanceText(l.more)}</span>`;
    return `<span title="${esc(tip)}">as expected</span>`;
  }

  // ── The puzzle box ──
  const pieceHtml = (letter, piece, z = 1) => (piece ? `<span class="pz-piece" style="--z:${z};--ps:${PUZZLES.size};background-image:url('${PUZZLES.sheet}');--px:${piece - 1};--py:${LETTERS.indexOf(letter)}"></span>` : '<span class="pz-gap"></span>');
  const solvedPic = (letter, z) => `<span class="pz-board pz-mini" style="--z:${z}">${SOLVED.map(p => pieceHtml(letter, p, z)).join('')}</span>`;
  function puzzleHtml() {
    const pz = U.pz, L = pz.letter;
    const givers = l => [...new Set(CLUES.filter(c => c.puzzle === l).map(c => c.npc))];
    const pick = `<div class="pz-pick">${LETTERS.map(l => `<button type="button" class="pz-pick-btn${l === L ? ' on' : ''}" data-pz-letter="${l}" aria-pressed="${l === L}" title="${esc(`From ${givers(l).join(', ')}`)}">${solvedPic(l, 0.36)}<span class="c-faint small-note">${esc(givers(l).join(', '))}</span></button>`).join('')}</div>
      <div class="bar wrap pz-shot-bar"><button type="button" class="btn small" data-clue-shot="puzzle"${pz.reading ? ' disabled' : ''}>${pz.reading ? 'Reading…' : 'Read a screenshot'}</button><span class="c-faint small-note">of the puzzle as the game shows it: its picture and pieces are read, and it's solved from there. Or drop or paste one here.</span></div>
      ${pz.note ? `<div class="msg ${pz.note.error ? 'error' : 'ok'} pz-note">${pz.note.html}</div>` : ''}`;
    if (pz.moves) {
      const state = playTo(pz.step);
      const next = pz.moves[pz.step];
      const done = pz.step >= pz.moves.length;
      const board = `<div class="pz-board" role="grid" aria-label="The puzzle, ${done ? 'solved' : `after ${pz.step} moves`}">${state.map((p, at) => `<button type="button" class="pz-cell${at === next ? ' pz-next' : ''}" data-pz-play="${at}" ${at === next ? `title="Click this one: it slides ${direction(state, at)}"` : 'tabindex="-1"'}>${pieceHtml(L, p)}${at === next ? `<span class="pz-arrow">${ARROW[direction(state, at)]}</span>` : ''}</button>`).join('')}</div>`;
      const list = pz.moves.map((m, k) => `<span class="${k < pz.step ? 'pz-done' : k === pz.step ? 'pz-now' : ''}">${ARROW[direction(playTo(k), m)]}</span>`).join(' ');
      return `<div class="card pz">${pick}
        <div class="pz-solve">${board}<div class="pz-side">
          <p>${done ? '<b>Solved.</b> Talk to whoever gave you the box.' : `<b>Move ${pz.step + 1} of ${pz.moves.length}:</b> click the piece with the arrow, in the game and here.`}</p>
          <div class="bar"><button type="button" class="btn small" data-pz-step="-1"${pz.step ? '' : ' disabled'}>◀ Back</button><button type="button" class="btn small" data-pz-step="1"${done ? ' disabled' : ''}>Next ▶</button><button type="button" class="linkish" data-pz-edit="1">Change the pieces</button></div>
          <p class="pz-moves" aria-label="Each move: the way the piece you click slides">${list}</p>
        </div></div></div>`;
    }
    const cells = pz.cells, placed = new Set(cells.filter(v => v != null));
    const full = cells.every(v => v != null);
    const unsure = new Set(pz.unsure || []);
    const board = `<div class="pz-board" role="grid" aria-label="Your puzzle as it is">${cells.map((p, at) => `<button type="button" class="pz-cell${p == null ? ' pz-empty' : ''}${unsure.has(at) ? ' pz-unsure' : ''}" data-pz-cell="${at}" title="${p == null ? 'Empty: click a piece below' : `${unsure.has(at) ? 'Read from the screenshot, but not for sure: check it. ' : ''}Click to take it back off`}">${p == null ? '' : pieceHtml(L, p)}</button>`).join('')}</div>`;
    const palette = `<div class="pz-palette">${SOLVED.map(p => `<button type="button" class="pz-cell${placed.has(p) ? ' used' : ''}" data-pz-put="${p}"${placed.has(p) ? ' disabled' : ''} title="${p ? `Piece ${p}` : 'The gap'}">${pieceHtml(L, p)}</button>`).join('')}</div>`;
    const bad = full && !solvable(cells);
    return `<div class="card pz">${pick}
      <p class="note">Pick the picture your box has. Then click the pieces in the order you see them in the game, left to right and top to bottom (the gap too): the board fills as you go. Click one on the board to take it back.</p>
      <div class="pz-solve">${board}<div class="pz-side">${palette}
        <div class="bar"><button type="button" class="btn small" data-pz-solve="1"${full && !bad && !pz.busy ? '' : ' disabled'}>${pz.busy ? 'Solving…' : 'Solve'}</button><button type="button" class="linkish" data-pz-clear="1">Clear</button></div>
        ${bad ? '<p class="c-lose small-note">That can\'t be the game\'s: two pieces must be the other way round.</p>' : pz.msg ? `<p class="small-note">${esc(pz.msg)}</p>` : ''}
      </div></div></div>`;
  }
  function playTo(k) {
    let s = U.pz.start;
    for (let j = 0; j < k; j++) s = slide(s, U.pz.moves[j]);
    return s;
  }
  function puzzleClick(t) {
    const pz = U.pz, d = t.dataset;
    if (d.pzLetter) { if (pz.letter !== d.pzLetter) { pz.letter = d.pzLetter; pz.note = null; saveUi(); } return true; }
    if (d.pzPut != null) { const at = pz.cells.indexOf(null); if (at >= 0) { pz.cells[at] = Number(d.pzPut); pz.unsure = pz.unsure.filter(x => x !== at); } pz.msg = ''; return true; }
    if (d.pzCell != null) { pz.cells[Number(d.pzCell)] = null; pz.unsure = pz.unsure.filter(x => x !== Number(d.pzCell)); pz.msg = ''; return true; }
    if (d.pzClear) { pz.cells = Array(25).fill(null); pz.unsure = []; pz.note = null; pz.msg = ''; return true; }
    if (d.pzEdit) { pz.moves = null; pz.step = 0; return true; }
    if (d.pzStep) { pz.step = Math.max(0, Math.min(pz.moves.length, pz.step + Number(d.pzStep))); return true; }
    if (d.pzPlay != null) { if (Number(d.pzPlay) === pz.moves[pz.step]) pz.step++; return true; }
    if (d.pzSolve) {
      pz.busy = true; P.redraw();
      setTimeout(() => {
        const start = pz.cells.slice(), moves = solve(start);
        pz.busy = false;
        if (!moves) pz.msg = 'That can\'t be solved: check the pieces.';
        else if (!moves.length) pz.msg = 'That\'s solved already.';
        else Object.assign(pz, { start, moves, step: 0 });
        P.redraw();
      }, 20);
      return true;
    }
    return false;
  }

  // ── Screenshots of a casket's rewards (v3.6.1) ──
  // The reader (cluereader.js, the rewards' icons and the stack numbers' font) loads the first time it's used.
  let reader = null, puzzleReader = null;
  const loadSheet = src => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(P.pixelsOf(img, img.naturalWidth, img.naturalHeight));
    img.onerror = () => reject(new Error('The icons for reading screenshots didn\'t load. Reload the page and try again.'));
    img.src = src;
  });
  async function getReader() {
    if (reader) return reader;
    const [R, B, D] = await Promise.all([import('./cluereader.js'), import('./bankread.js'), import('./bankread-data.js')]);
    const atlas = await loadSheet(CLUE_READ.sheet);
    reader = { R, icons: B.prepareIcons(atlas, CLUE_READ.icons, CLUE_READ.perRow), font: D.STACK_FONT };
    return reader;
  }
  // (v3.6.2) the puzzles' pieces, as icons
  async function getPuzzleReader() {
    if (puzzleReader) return puzzleReader;
    const [R, B] = await Promise.all([import('./cluereader.js'), import('./bankread.js')]);
    const atlas = await loadSheet(PUZZLES.sheet);
    puzzleReader = { R, icons: B.prepareIcons(atlas, R.PUZZLE_PIECES, 24) };
    return puzzleReader;
  }
  // The screenshot button: the newer file picker where there is one, else the plain file button (whose change
  // event brings the files to onFiles)
  async function pick(from) {
    U.pickFrom = from;
    const files = await P.pickFiles();
    if (Array.isArray(files) && files.length) gotFiles(files, from);
  }
  // Screenshots to read: a casket's (from the top, or Rewards) or (v3.6.2) a puzzle's
  function gotFiles(files, from) {
    if (from === 'puzzle') readPuzzleShot(files); else readFiles(files, from === 'top' ? 'top' : 'bottom');
  }
  // (v3.6.2) A puzzle from a screenshot (the latest, of several): its picture and pieces, then solved. One that
  // couldn't all be read waits for you to click in what's missing.
  async function readPuzzleShot(files) {
    const pz = U.pz;
    const list = [...files].filter(f => f && (/^image\//.test(f.type) || /\.png$/i.test(f.name || ''))).sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
    if (U.view !== 'puzzle') { U.view = 'puzzle'; saveUi(); }
    if (!list.length) { pz.note = { error: true, html: 'That isn\'t a picture. Use the PNG screenshots LostKit saves.' }; P.redraw(); return; }
    const f = list[0], name = `<b>${esc(f.name || 'the pasted picture')}</b>`;
    pz.reading = true;
    pz.note = null;
    P.redraw();
    let r;
    try {
      const { R, icons } = await getPuzzleReader();
      let img = null;
      try { const bmp = await createImageBitmap(f); img = P.pixelsOf(bmp, bmp.width, bmp.height); bmp.close?.(); } catch { /* not a picture it can open */ }
      r = img ? R.readPuzzle(img, icons, PUZZLES.window) : { ok: false, why: 'unreadable' };
    } catch (e) {
      r = { ok: false, why: 'error', message: e?.message || String(e) };
    }
    pz.reading = false;
    if (!r.ok) {
      pz.note = { error: true, html: r.why === 'no-puzzle' ? `No puzzle in ${name}: take the screenshot while the puzzle shows.` : r.why === 'unreadable' ? `Couldn't open ${name}.` : esc(r.message) };
      P.redraw();
      return;
    }
    Object.assign(pz, { letter: r.letter, cells: r.cells, unsure: r.unsure, moves: null, step: 0, msg: '' });
    saveUi();
    const missing = r.cells.filter(v => v == null).length;
    const check = r.unsure.length ? ` ${r.unsure.length === 1 ? 'One piece was' : `${r.unsure.length} pieces were`} hard to be sure of: if the arrows don't match the game, change the pieces (marked).` : '';
    if (missing) pz.note = { html: `Read from ${name}: ${missing === 1 ? 'one slot' : `${missing} slots`} couldn't be read. Click in the piece${missing === 1 ? ' it holds' : 's they hold'} (or the gap), then Solve.` };
    else {
      const moves = solve(r.cells);
      if (!moves) pz.note = { error: true, html: `Read from ${name}, but it can't be solved as read: check the pieces.` };
      else if (!moves.length) pz.note = { html: `Read from ${name}: it's solved already.` };
      else { Object.assign(pz, { start: r.cells.slice(), moves, step: 0 }); pz.note = { html: `Read from ${name}: ${moves.length} moves to solve it.${check}` }; }
    }
    P.redraw();
  }
  // Each screenshot read: { name, ok, why } or { name, ok, items, unknown, tiers, w, i, pick: { slot: slug } }.
  // From the top, every one waits for you to say which clue it was; from Rewards, one whose rewards can only be
  // from one kind of clue, all read for sure and none counted before, is counted there and then.
  async function readFiles(files, from) {
    if (!P.safe()) return;
    const seen = new Set();
    const list = [...files].filter(f => f && (/^image\//.test(f.type) || /\.png$/i.test(f.name || ''))).filter(f => {
      const k = `${f.name}|${f.size}|${f.lastModified}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (from === 'bottom' && U.view !== 'rewards') { U.view = 'rewards'; saveUi(); }
    if (!list.length) { U.note = { where: from, error: true, html: 'That isn\'t a picture. Use the PNG screenshots LostKit saves.' }; P.redraw(); return; }
    // (any still to check there wait behind these)
    const waiting = U.shots[from]?.queue || [];
    U.shots[from] = { busy: list.length };
    U.note = null;
    U.fresh = null;
    P.redraw();
    const reads = [];
    try {
      const { R, icons, font } = await getReader();
      list.sort((a, b) => (a.lastModified || 0) - (b.lastModified || 0));     // in the order they were taken
      for (const f of list) {
        const name = f.name || 'Pasted picture';
        try {
          const bmp = await createImageBitmap(f);
          const img = P.pixelsOf(bmp, bmp.width, bmp.height);
          bmp.close?.();
          const r = R.readReward(img, icons, font, CLUE_READ.window);
          if (!r.ok) { reads.push({ name, ok: false, why: r.why }); continue; }
          const { items, unknown } = R.rewardItems(r);
          reads.push({ name, ok: true, items, unknown, tiers: R.tiersOf(items), w: r.hash, i: r.image, pick: {} });
        } catch (e) {
          reads.push({ name, ok: false, why: 'unreadable' });
        }
      }
    } catch (e) {
      U.shots[from] = waiting.length ? { queue: waiting } : null;
      U.note = { where: from, error: true, html: esc(e?.message || String(e)) };
      P.redraw();
      return;
    }
    const added = [], check = [];
    for (const rd of reads.filter(r => r.ok)) {
      if (from === 'bottom' && sureOf(rd)) added.push(addCasket(rd, rd.tiers[0], from));
      else check.push(rd);
    }
    if (added.length) U.undo = { what: 'shot', adds: added };
    const queue = [...waiting, ...check];
    U.shots[from] = queue.length ? { queue } : null;
    const bad = reads.filter(r => !r.ok);
    const html = [addedText(added), badText(bad), check.length && added.length ? `${check.length === 1 ? 'One' : check.length} to check below.` : ''].filter(Boolean).join(' ');
    U.note = html ? { where: from, undo: added.length > 0, error: !added.length && !check.length, html } : null;
    if (added.length) showAdded(added);
    P.redraw();
  }
  // Sure enough to count by itself: everything in it read (its numbers too), one kind of clue it can be from, and
  // no casket counted before that looked just like it
  const sureOf = rd => rd.items.length > 0 && !rd.unknown && rd.tiers.length === 1 && rd.items.every(it => it.min === it.max) && !dupOf(rd);
  // A screenshot counted before (this very picture: same), or a casket with just the same rewards (like)
  function dupOf(rd) {
    const shots = data().shots.slice().reverse();
    const same = shots.find(x => x.i === rd.i);
    if (same) return { how: 'same', ...same };
    const like = shots.find(x => x.w === rd.w);
    return like ? { how: 'like', ...like } : null;
  }
  // A casket counted: one more clue of its kind, its rewards added to what you've had (what isn't one of that
  // kind's rewards left out), and the screenshot remembered. A page that looks like the others of its book waits
  // for you to say which (pending). -> what undoes it: { id, tier, items: { slug: [n, new] }, w, i, left, pages }
  function addCasket(rd, tier, from) {
    const d = data(), R = CLUE_REWARDS[tier];
    const add = { id: ++addId, tier, items: {}, w: rd.w, i: rd.i, left: [], pages: 0, count: 0 };
    for (const it of rd.items) {
      const n = Math.max(0, Math.min(1e9, Math.floor(Number(it.count)) || 0));
      if (!n) continue;
      const isReward = slug => R.items.some(i => i.slug === slug && !!i.noted === !!it.noted);
      if (it.alts && !rd.pick[it.slot]) {
        const alts = it.alts.filter(isReward);
        if (alts.length) { U.pending.push({ id: add.id, key: `${add.id}:${it.slot}`, where: from, tier, alts, count: n }); add.pages++; add.count++; } else add.left.push(it);
        continue;
      }
      const slug = it.alts ? rd.pick[it.slot] : it.slug;
      if (!isReward(slug)) { add.left.push(it); continue; }
      gotAdd(d, add, tier, slug, n);
      add.count++;
    }
    d.done[tier] = Math.min(1e6, d.done[tier] + 1);
    d.shots.push({ w: rd.w, i: rd.i, t: tier, at: Date.now() });
    if (d.shots.length > SHOTS_KEPT) d.shots.splice(0, d.shots.length - SHOTS_KEPT);
    save(d);
    return add;
  }
  function gotAdd(d, add, tier, slug, n) {
    const had = d.got[tier][slug];
    d.got[tier][slug] = Math.min(1e9, (had || 0) + n);
    const was = add.items[slug];
    add.items[slug] = [(was?.[0] || 0) + n, was ? was[1] : had == null];
  }
  // Undone: each casket's clue and rewards taken off again (what was never there before, gone again), and its
  // screenshot forgotten
  function undoShots(adds) {
    const d = data();
    for (const a of adds) {
      d.done[a.tier] = Math.max(0, d.done[a.tier] - 1);
      for (const [slug, [n, fresh]] of Object.entries(a.items)) {
        const left = (d.got[a.tier][slug] || 0) - n;
        if (fresh && left <= 0) delete d.got[a.tier][slug]; else d.got[a.tier][slug] = Math.max(0, left);
      }
      for (let k = d.shots.length - 1; k >= 0; k--) if (d.shots[k].w === a.w && d.shots[k].i === a.i && d.shots[k].t === a.tier) { d.shots.splice(k, 1); break; }
    }
    save(d);
    const ids = new Set(adds.map(a => a.id));
    U.pending = U.pending.filter(p => !ids.has(p.id));
    U.fresh = null;
  }
  // A page said: added to its casket's rewards (and undone with it)
  function sayPage(key, slug) {
    const p = U.pending.find(x => x.key === key);
    if (!p) return;
    U.pending = U.pending.filter(x => x !== p);
    if (!slug || !P.safe()) return;
    const d = data();
    const add = U.undo?.what === 'shot' ? U.undo.adds.find(a => a.id === p.id) : null;
    gotAdd(d, add || { items: {} }, p.tier, slug, p.count);
    save(d);
    if (U.fresh?.tier === p.tier) U.fresh.slugs.add(slug);
  }
  // The rows just added to, marked; the rewards shown are the last casket's kind
  function showAdded(added) {
    const last = added[added.length - 1].tier;
    U.rtier = last;
    saveUi();
    U.fresh = { tier: last, slugs: new Set(added.filter(a => a.tier === last).flatMap(a => Object.keys(a.items))) };
  }
  function addedText(added) {
    if (!added.length) return '';
    if (added.length === 1) {
      const a = added[0];
      const left = a.left.length ? ` (${a.left.length === 1 ? 'one isn\'t' : `${a.left.length} aren't`} ${an(a.tier)} ${a.tier} casket's: left out)` : '';
      return `Counted ${an(a.tier)} <b>${a.tier}</b> casket${a.count ? ` and ${a.count === 1 ? 'its reward' : `its ${a.count} rewards`}` : ''}${left}.`;
    }
    const by = TIERS.map(t => [t, added.filter(a => a.tier === t).length]).filter(([, n]) => n);
    return `Counted ${added.length} caskets: ${by.map(([t, n]) => `<b>${n}</b> ${t}`).join(', ')}, and their rewards.`;
  }
  function badText(bad) {
    if (!bad.length) return '';
    const names = bad.map(r => `<b>${esc(r.name)}</b>`).join(', ');
    if (bad.every(r => r.why === 'unreadable')) return `${names}: couldn't open ${bad.length === 1 ? 'this picture' : 'these pictures'}.`;
    return `No casket's rewards in ${names}: take the screenshot while the rewards show, before you close them.`;
  }
  const nameOfSlug = slug => ITEMS[slug]?.name || TIERS.map(t => CLUE_REWARDS[t].items.find(i => i.slug === slug)?.name).find(Boolean) || slug;
  const pageNo = slug => `Page ${slug.match(/page(\d+)$/)?.[1] || '?'}`;
  // (a torn page: whose book it's from, its colour tells; which of the four, nothing in a screenshot does)
  const GODS = { s: 'Saradomin', z: 'Zamorak', g: 'Guthix' };
  const bookOf = slug => GODS[slug.match(/^holy_book_(\w)_page/)?.[1]] || '';
  const pageWord = slug => (bookOf(slug) ? `torn page (${bookOf(slug)})` : nameOfSlug(slug).replace(/\s*\d+\b/, '').toLowerCase());
  const when = at => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  // A screenshot to check: what was read (numbers and a page's number yours to change), and which clue it was
  function shotHtml(from) {
    const sh = U.shots[from];
    if (!sh) return '';
    if (sh.busy) return `<div class="clue-shot"><span class="busy">Reading ${sh.busy === 1 ? 'the screenshot' : `${sh.busy} screenshots`}…</span></div>`;
    const rd = sh.queue[0];
    const fits = rd.tiers, dup = dupOf(rd);
    const unsure = rd.items.some(it => it.min !== it.max);
    const or = list => { const w = list.map(t => `${an(t)} ${t}`); return w.length > 1 ? `${w.slice(0, -1).join(', ')} or ${w[w.length - 1]}` : w[0]; };
    let fitText = fits.length ? `Its rewards ${fits.length === 1 ? 'fit' : 'could be from'} ${or(fits)} casket.` : 'Its rewards aren\'t all one kind of casket\'s: check what was read.';
    const why = [];
    if (from === 'bottom' && !dup) {
      if (fits.length > 1) why.push('it could be more than one kind of clue');
      if (!fits.length) { why.push('its rewards aren\'t all one kind of casket\'s'); fitText = 'Check what was read.'; }
      if (rd.unknown) why.push(`${rd.unknown === 1 ? 'something in it isn\'t' : `${rd.unknown} things in it aren't`} a reward it knows`);
      if (unsure) why.push('a number wasn\'t read for sure');
    }
    const items = rd.items.map(it => shotItemHtml(rd, it, from)).join('') + (rd.unknown ? `<span class="cs-item cs-unknown" title="Not one of a casket's rewards, or not read: left out">${'?'.repeat(Math.min(rd.unknown, 6))}</span>` : '');
    const dupLine = !dup ? '' : dup.how === 'same'
      ? `<p class="c-lose small-note">This screenshot is counted already: ${an(dup.t)} ${dup.t} casket, ${when(dup.at)}.</p>`
      : `<p class="small-note">${an(dup.t) === 'an' ? 'An' : 'A'} ${dup.t} casket with just these rewards is counted already (${when(dup.at)}): count this one only if it's another casket.</p>`;
    const more = sh.queue.length > 1;
    const lead = from === 'bottom' && fits.length === 1 && !dup;
    return `<div class="clue-shot">
      <div class="cs-head"><b>${more ? `The screenshot, and ${sh.queue.length - 1} more` : 'The screenshot'}</b> <span class="c-faint small-note">${esc(rd.name)}</span></div>
      <div class="cs-items">${items}</div>
      ${dupLine}
      <p class="small-note">${why.length ? `Not counted by itself: ${why.join(', and ')}. ` : ''}${fitText}${unsure ? ' <span class="c-lose">Check the numbers marked.</span>' : ''}</p>
      <div class="bar wrap cs-add"><span class="c-muted">Which clue was it?</span>${TIERS.map(t => `<button type="button" class="btn small${fits.includes(t) ? ' fits' : ''}${lead && fits[0] === t ? ' lead' : ''}" data-clue-shot-add="${t}" data-from="${from}" title="${esc(`Count ${an(t)} ${t} casket and its rewards${fits.includes(t) ? '' : `: not all of them are ${an(t)} ${t} casket's, and those are left out`}`)}">${P.itemIcon(`clue_scroll_${t}`, true)} ${TIER_NAMES[t]}</button>`).join('')}
        <button type="button" class="linkish" data-clue-shot-skip="${from}">${more ? 'Skip this one' : 'Leave it'}</button></div>
    </div>`;
  }
  function shotItemHtml(rd, it, from) {
    const chosen = it.alts ? rd.pick[it.slot] || '' : it.slug;
    const shown = chosen || it.alts[0];
    const name = it.alts
      ? `<select class="input small" data-clue-shot-alt="${it.slot}" data-from="${from}" aria-label="Which page" title="A book's pages look the same: which one is it? Left unsaid, you're asked once it's counted"><option value="">${esc(pageWord(it.alts[0]).replace(/^./, c => c.toUpperCase()))}: which?</option>${it.alts.map(a => `<option value="${a}"${chosen === a ? ' selected' : ''}>${pageNo(a)}</option>`).join('')}</select>`
      : `<span>${esc(nameOfSlug(it.slug))}${it.noted ? ' <span class="c-faint">(noted)</span>' : ''}</span>`;
    const unsure = it.min !== it.max;
    const n = it.count > 1 || unsure ? `<input class="input small num${unsure ? ' unsure' : ''}" data-clue-shot-n="${it.slot}" data-from="${from}" inputmode="numeric" value="${fmt(it.count)}" aria-label="How many"${unsure ? ' title="Not read for sure: check it"' : ''}>` : '';
    return `<span class="cs-item">${ITEMS[shown] ? P.itemIcon(shown, true) : ''}${name}${n}</span>`;
  }
  // What was done, and pages to say which
  function noteHtml(where) {
    const n = U.note?.where === where ? U.note : null;
    const pend = U.pending.filter(p => p.where === where);
    if (!n && !pend.length) return '';
    return `<div class="clue-note">${n ? `<div class="msg ${n.error ? 'error' : 'ok'}">${n.html}${n.undo && U.undo?.what === 'shot' ? ' <button type="button" class="linkish" data-clue-undo="1">Undo</button>' : ''}</div>` : ''}
      ${pend.map(p => `<div class="cs-page">${ITEMS[p.alts[0]] ? P.itemIcon(p.alts[0], true) : ''}<span>Which ${esc(pageWord(p.alts[0]))} was it? <span class="c-faint small-note">(${an(p.tier)} ${p.tier} casket's: a book's pages look the same in a screenshot)</span></span>
        ${p.alts.map(a => `<button type="button" class="btn small" data-clue-page="${p.key}" data-slug="${a}">${pageNo(a)}</button>`).join('')}<button type="button" class="linkish" data-clue-page="${p.key}" data-slug="">Leave it out</button></div>`).join('')}</div>`;
  }
  function shotAdd(tier, from) {
    const rd = U.shots[from]?.queue?.[0];
    if (!rd || !P.safe()) return;
    const add = addCasket(rd, tier, from);
    U.undo = { what: 'shot', adds: [add] };
    U.note = { where: from, undo: true, html: addedText([add]) };
    showAdded([add]);
    nextShot(from);
  }
  function nextShot(from) {
    const sh = U.shots[from];
    if (!sh?.queue) return;
    sh.queue.shift();
    if (!sh.queue.length) U.shots[from] = null;
  }

  // ── Changes ──
  function setDone(t, n) { if (!P.safe()) return; const d = data(); d.done[t] = Math.max(0, Math.min(1e6, Math.floor(n) || 0)); save(d); }
  function setGot(t, slug, n) { if (!P.safe()) return; const d = data(); d.got[t][slug] = Math.max(0, Math.min(1e9, Math.floor(n) || 0)); save(d); }
  function fillExpected(t) {
    if (!P.safe()) return;
    const d = data(), R = rewardsOf(t), n = d.done[t];
    U.undo = { what: 'fill', tier: t, got: { ...d.got[t] } };
    for (const i of R.items) if (!i.rare && i.lo === 1 && i.hi === 1) d.got[t][i.slug] = Math.round(i.perCasket * n);
    save(d);
  }

  return {
    render,
    onClick(e) {
      const t = e.target.closest('button, [data-clue-open]');
      if (!t || !t.closest('#view-clues')) return false;
      const d = t.dataset;
      if (d.clueView) { U.view = d.clueView; saveUi(); P.redraw(); return true; }
      if (d.clueTier != null) { U.tier = d.clueTier || null; saveUi(); P.redraw(); return true; }
      if (d.clueKind != null) { U.kind = d.clueKind || null; U.open = null; saveUi(); P.redraw(); return true; }
      if (d.clueRtier) { U.rtier = d.clueRtier; saveUi(); P.redraw(); return true; }
      if (d.clueOpen) { U.open = d.clueOpen.startsWith('-') ? d.clueOpen : U.open === d.clueOpen ? null : d.clueOpen; P.redraw(); return true; }
      if (d.clueStep) { const t2 = d.tier; setDone(t2, data().done[t2] + Number(d.clueStep)); P.redraw(); return true; }
      if (d.clueGotStep) { const g = data().got[U.rtier][d.slug] || 0; setGot(U.rtier, d.slug, g + Number(d.clueGotStep)); P.redraw(); return true; }
      if (d.clueRare) { const g = data().got[U.rtier][d.clueRare] || 0; setGot(U.rtier, d.clueRare, g ? 0 : 1); P.redraw(); return true; }
      if (d.clueFill) { fillExpected(d.clueFill); P.redraw(); return true; }
      if (d.clueUndo && U.undo) {
        if (U.undo.what === 'shot') { undoShots(U.undo.adds); if (U.note) U.note = { where: U.note.where, html: 'Undone.' }; }
        else { const dd = data(); dd.got[U.undo.tier] = U.undo.got; save(dd); }
        U.undo = null; P.redraw(); return true;
      }
      // (v3.6.1) screenshots
      if (d.clueShot) { pick(d.clueShot); return true; }
      if (d.clueShotAdd) { shotAdd(d.clueShotAdd, d.from === 'top' ? 'top' : 'bottom'); P.redraw(); return true; }
      if (d.clueShotSkip) { nextShot(d.clueShotSkip === 'top' ? 'top' : 'bottom'); P.redraw(); return true; }
      if (d.cluePage) { sayPage(d.cluePage, d.slug); P.redraw(); return true; }
      if (d.cluePuzzle) { U.view = 'puzzle'; U.pz.letter = d.cluePuzzle; U.pz.moves = null; saveUi(); P.redraw(); window.scrollTo({ top: 0 }); return true; }
      if (puzzleClick(t)) { P.redraw(); return true; }
      return false;
    },
    onChange(e) {
      const t = e.target, d = t.dataset || {};
      if (d.clueN) { setDone(d.clueN, Number(String(t.value).replace(/[^\d]/g, ''))); P.redraw(); return true; }
      if (d.clueGot) { setGot(U.rtier, d.clueGot, Number(String(t.value).replace(/[^\d]/g, ''))); P.redraw(); return true; }
      // (the screenshot being checked: kept without a redraw, which would lose a click on Easy, Medium or Hard
      // that ends the typing)
      const rd = d.from ? U.shots[d.from === 'top' ? 'top' : 'bottom']?.queue?.[0] : null;
      if (rd && d.clueShotAlt != null) { rd.pick[d.clueShotAlt] = t.value || undefined; return true; }
      if (rd && d.clueShotN != null) {
        const it = rd.items.find(x => x.slot === Number(d.clueShotN));
        if (it) { const n = Math.floor(Number(String(t.value).replace(/[^\d]/g, ''))) || 0; Object.assign(it, { count: n, min: n, max: n }); t.classList.remove('unsure'); }
        return true;
      }
      return false;
    },
    onInput(e) {
      const t = e.target;
      if (t.dataset?.clueFind) { U.find = t.value; U.open = null; P.redraw(); return true; }
      return false;
    },
    // (v3.6.1) screenshots from the plain file button, or dropped (on the counts at the top: you say which clue)
    // or pasted (as if on Rewards)
    onFiles(files) { gotFiles(files, U.pickFrom); },
    // (dropped on the counts at the top: a casket you say the kind of; elsewhere, (v3.6.2) on the puzzle box a
    // puzzle, else a casket on Rewards)
    readShots(files, from) { gotFiles(files, from === 'top' ? 'top' : U.view === 'puzzle' ? 'puzzle' : 'bottom'); },
    // (for the tests and the README's pictures)
    _state: () => U,
  };
}
