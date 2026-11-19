// The Clues tab (v3.6): how many clues of each kind you've done, what you bring, every clue the server hands
// out and its answer (found from what's on your scroll: words, an anagram, coordinates or a map's picture), the
// rewards a casket gives (the server's tables) against what you've had, and a solver for the puzzle box.
import { CLUES, CLUE_MAPS, CLUE_PICS, PUZZLES } from './cluedata.js';
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

// P: { esc, fmt, $, itemIcon, store, safe, account, renderAccount, redraw, gpShort }
export function createClueUi(P) {
  const { esc, fmt, $ } = P;
  const ui = P.store.get('clueUi', {});
  const U = {
    view: VIEWS.includes(ui.view) ? ui.view : 'solve',
    tier: TIERS.includes(ui.tier) ? ui.tier : null,
    kind: KIND_GROUPS.includes(ui.kind) ? ui.kind : null,
    rtier: TIERS.includes(ui.rtier) ? ui.rtier : 'hard',
    find: '', open: null,
    pz: { letter: LETTERS.includes(ui.pz) ? ui.pz : 'b', cells: Array(25).fill(null), moves: null, step: 0, busy: false, msg: '' },
    undo: null,
  };
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
    return { done, got };
  };
  const save = d => P.store.set(key(), { ...d, updated: Date.now() });

  // ── The tab ──
  function render() {
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
        ${acct ? `<div class="clue-counts"><span class="c-muted">Clues done</span>${TIERS.map(count).join('')}<span class="c-faint small-note">${fmt(total)} in all. Count one when you open its casket.</span></div>` : ''}
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
      <p class="note">A ${t} casket has ${rolls} rewards (${R.meanRolls} on average), each one rare 1 in ${R.rare}: a rare one in ${chanceText(rareCasket)} of caskets. Every chance here is the server's (trail_clue_${t}_reward), the items equally likely within the common and the rare table.</p>
      <h5>${n ? `After your ${fmt(n)} ${t} clues you'd have about` : 'A casket gives on average'}</h5>
      <div class="rw-chips">${chips}${coins ? `<span class="rw-chip">Coins <b>${n ? `≈ ${fmt(Math.round(coins.perCasket * n))}` : `${fmt(Math.round(coins.perCasket))} a casket`}</b></span>` : ''}</div>
      ${n && acct ? `<div class="bar wrap"><button type="button" class="btn small" data-clue-fill="${t}" title="Your Got column for the common armour, weapons, bows and pages set to how many you'd have after ${fmt(n)} clues, rounded: change any you remember">Fill in what's expected</button>
        ${U.undo?.tier === t ? `<button type="button" class="linkish" data-clue-undo="1">Undo</button>` : ''}
        <span class="c-faint small-note">Then tick off the rares you've had below, and change what you remember.</span></div>` : ''}
      <h5>Rare rewards <span class="c-faint small-note">${acct ? `${gotRares} of ${rares.length}: click one you've had` : `${rares.length} of them`}</span></h5>
      <div class="rw-rares">${rares.map(i => `<button type="button" class="rw-rare${got[i.slug] > 0 ? ' on' : ''}" data-clue-rare="${i.slug}" aria-pressed="${got[i.slug] > 0}"${acct ? '' : ' disabled'} title="${esc(`${nameOf(i)}${i.lo > 1 ? ` (${i.lo}${i.noted ? ', noted' : ''})` : ''}: 1 in ${fmt(Math.round(1 / i.p))} a reward, ${chanceText(i.casket)} a casket${got[i.slug] > 0 ? `. You've had ${got[i.slug]}` : ''}`)}">${ITEMS[i.slug] ? P.itemIcon(i.slug) : `<span class="rw-noicon">${esc(nameOf(i))}</span>`}${got[i.slug] > 1 ? `<span class="rw-n">${got[i.slug]}</span>` : ''}</button>`).join('')}</div>
      <div class="table-wrap"><table class="grid loot-t clue-t"><thead><tr><th class="l">Item</th><th title="How many one reward is">Each</th><th title="The chance a reward is this one">A reward</th><th title="The chance a casket has at least one">A casket</th>
        ${n ? `<th class="wrap sep-l" title="How many on average after the clues you've done">Expected<br>after ${fmt(n)}</th>` : ''}${acct ? `<th class="${n ? '' : 'sep-l'}" title="What you've had: type it in, or − and +">Got</th>` : ''}${n ? '<th class="l" title="How what you\'ve had compares with other players\' after as many clues: green, the share of them who\'d have fewer; red, the share who\'d have more; dry, so many times the clues it takes on average">Luck</th>' : ''}</tr></thead>
        <tbody>${[...commons, ...rares].map((i, k) => rewardRow(i, n, trials, got[i.slug], k === commons.length, acct)).join('')}</tbody></table></div>
    </div>`;
  }
  const nameOf = i => ITEMS[i.slug]?.name || i.name || i.slug;
  // (g: what's typed in for it, undefined if nothing is)
  function rewardRow(i, n, trials, typed, firstRare, acct) {
    const g = typed || 0;
    const each = i.lo === i.hi ? fmt(i.lo) : `${fmt(i.lo)}–${fmt(i.hi)}`;
    const name = `${ITEMS[i.slug] ? P.itemIcon(i.slug, true) : ''} ${esc(nameOf(i))}${i.noted ? ' <span class="c-faint small-note">(noted)</span>' : ''}${i.rare ? ' <span class="alch-tag">rare</span>' : ''}`;
    const step = i.lo === i.hi ? i.lo : 1;
    const box = `<span class="got-box"><button type="button" class="mv" data-clue-got-step="-${step}" data-slug="${i.slug}" aria-label="Fewer"${g > 0 ? '' : ' disabled'}>−</button><input class="input small num" data-clue-got="${i.slug}" inputmode="numeric" value="${typed != null ? fmt(g) : ''}" placeholder="–" aria-label="${esc(nameOf(i))} had"><button type="button" class="mv" data-clue-got-step="${step}" data-slug="${i.slug}" aria-label="More">+</button></span>`;
    const exp = i.perCasket * n;
    const one = 1 / i.p;
    return `<tr data-reward="${i.slug}${i.noted ? '@noted' : ''}"${firstRare ? ' class="rw-first-rare"' : ''}><td class="l"><span class="sk-cell">${name}</span></td><td>${each}</td><td>1/${one >= 100 ? fmt(Math.round(one)) : one.toFixed(1).replace(/\.0$/, '')}</td><td>${chanceText(i.casket)}</td>
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
    const pick = `<div class="pz-pick">${LETTERS.map(l => `<button type="button" class="pz-pick-btn${l === L ? ' on' : ''}" data-pz-letter="${l}" aria-pressed="${l === L}" title="${esc(`From ${givers(l).join(', ')}`)}">${solvedPic(l, 0.36)}<span class="c-faint small-note">${esc(givers(l).join(', '))}</span></button>`).join('')}</div>`;
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
    const board = `<div class="pz-board" role="grid" aria-label="Your puzzle as it is">${cells.map((p, at) => `<button type="button" class="pz-cell${p == null ? ' pz-empty' : ''}" data-pz-cell="${at}" title="${p == null ? 'Empty: click a piece below' : 'Click to take it back off'}">${p == null ? '' : pieceHtml(L, p)}</button>`).join('')}</div>`;
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
    if (d.pzLetter) { if (pz.letter !== d.pzLetter) { pz.letter = d.pzLetter; saveUi(); } return true; }
    if (d.pzPut != null) { const at = pz.cells.indexOf(null); if (at >= 0) pz.cells[at] = Number(d.pzPut); pz.msg = ''; return true; }
    if (d.pzCell != null) { pz.cells[Number(d.pzCell)] = null; pz.msg = ''; return true; }
    if (d.pzClear) { pz.cells = Array(25).fill(null); pz.msg = ''; return true; }
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

  // ── Changes ──
  function setDone(t, n) { if (!P.safe()) return; const d = data(); d.done[t] = Math.max(0, Math.min(1e6, Math.floor(n) || 0)); save(d); }
  function setGot(t, slug, n) { if (!P.safe()) return; const d = data(); d.got[t][slug] = Math.max(0, Math.min(1e9, Math.floor(n) || 0)); save(d); }
  function fillExpected(t) {
    if (!P.safe()) return;
    const d = data(), R = rewardsOf(t), n = d.done[t];
    U.undo = { tier: t, got: { ...d.got[t] } };
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
      if (d.clueUndo && U.undo) { const dd = data(); dd.got[U.undo.tier] = U.undo.got; save(dd); U.undo = null; P.redraw(); return true; }
      if (d.cluePuzzle) { U.view = 'puzzle'; U.pz.letter = d.cluePuzzle; U.pz.moves = null; saveUi(); P.redraw(); window.scrollTo({ top: 0 }); return true; }
      if (puzzleClick(t)) { P.redraw(); return true; }
      return false;
    },
    onChange(e) {
      const t = e.target, d = t.dataset || {};
      if (d.clueN) { setDone(d.clueN, Number(String(t.value).replace(/[^\d]/g, ''))); P.redraw(); return true; }
      if (d.clueGot) { setGot(U.rtier, d.clueGot, Number(String(t.value).replace(/[^\d]/g, ''))); P.redraw(); return true; }
      return false;
    },
    onInput(e) {
      const t = e.target;
      if (t.dataset?.clueFind) { U.find = t.value; U.open = null; P.redraw(); return true; }
      return false;
    },
    // (for the tests and the README's pictures)
    _state: () => U,
  };
}
