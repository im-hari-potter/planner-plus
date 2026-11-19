// The Quests tab (v3.6): every quest on the server's quest list, free and members, with its quest points, and
// the two miniquests. You tick what you've done (it's kept with the account: the hiscores don't say); what a
// quest takes is checked against your levels from the hiscores, the quests it needs against your ticks, and its
// quest points against the ones you've ticked. A quest opens to where it starts, what it takes, what it gives,
// a few short steps, and LostHQ's full guide.
import { QUESTS, QUEST_POINTS } from './questdata.js';
import { SKILL_BY_KEY } from './skills.js';
import { ITEMS } from './gamedata.js';

export const QUEST_BY_KEY = new Map(QUESTS.map(q => [q.key, q]));
export const guideUrl = q => `https://2004.losthq.rs/?p=questguides&quest=${encodeURIComponent(q.lhq)}`;
const SHOWS = ['all', 'free', 'members', 'mini'], STATUSES = ['any', 'todo', 'ready', 'done'];
const SHOW_WORDS = { all: 'All', free: 'Free', members: 'Members', mini: 'Miniquests' };
const STATUS_WORDS = { any: 'Any', todo: 'To do', ready: 'Can start', done: 'Done' };

// The quest points of what's ticked
export const questPoints = done => QUESTS.reduce((t, q) => t + (done.has(q.key) ? q.qp : 0), 0);

// What a quest takes, against what you have. level(skill): { level, ranked, range } or null (no XP yet).
// Each need's state: 'ok', 'no', or 'maybe' (a skill not on the hiscores, which might be either), null (unknown).
// -> { skills: [{ sk, need, have, state }], qp: { need, have, state } | null, quests: [{ key, state }], state }
export function needsOf(q, { level, done }) {
  const skills = Object.entries(q.skills).map(([sk, need]) => {
    const l = level(sk);
    if (!l) return { sk, need, have: null, state: null };
    if (l.ranked || !l.range) return { sk, need, have: l.level, state: l.level >= need ? 'ok' : 'no' };
    const { min, max } = l.range;
    return { sk, need, have: min === max ? min : null, lo: min, hi: max, state: min >= need ? 'ok' : max < need ? 'no' : 'maybe' };
  });
  const have = questPoints(done);
  const qp = q.needQp ? { need: q.needQp, have, state: have >= q.needQp ? 'ok' : 'no' } : null;
  const quests = q.quests.map(key => ({ key, state: done.has(key) ? 'ok' : 'no' }));
  const all = [...skills, ...(qp ? [qp] : []), ...quests];
  const state = all.some(x => x.state === 'no') ? 'no' : all.some(x => x.state !== 'ok') ? 'maybe' : 'ok';
  return { skills, qp, quests, state };
}

// P: { esc, fmt, $, iconImg, itemIcon, store, safe, account, profile, currentOf, renderAccount, redraw, inLostKit }
export function createQuestUi(P) {
  const { esc, fmt, $ } = P;
  const ui = P.store.get('questUi', {});
  const U = {
    show: SHOWS.includes(ui.show) ? ui.show : 'all',
    status: STATUSES.includes(ui.status) ? ui.status : 'any',
    open: QUEST_BY_KEY.has(ui.open) ? ui.open : null,
    find: '',
  };
  const saveUi = () => P.store.set('questUi', { show: U.show, status: U.status, open: U.open });
  const key = () => 'quests.' + P.safe();
  const doneSet = () => {
    const v = P.safe() ? P.store.get(key(), null) : null;
    return new Set((Array.isArray(v?.done) ? v.done : []).filter(k => QUEST_BY_KEY.has(k)));
  };
  const saveDone = set => P.store.set(key(), { done: QUESTS.map(q => q.key).filter(k => set.has(k)), updated: Date.now() });
  const level = sk => (P.profile() ? P.currentOf(sk) : null);
  // (a link out: in LostKit the tool's own tab, ◀ comes back; in a browser a new tab, as the market's)
  const out = url => `href="${esc(url)}"${P.inLostKit ? '' : ' target="_blank" rel="noopener"'}`;
  const mark = st => (st === 'ok' ? '<span class="q-ok" aria-label="done">✓</span>' : st === 'no' ? '<span class="q-no" aria-label="not yet">✗</span>' : '<span class="q-maybe" aria-label="not known">?</span>');
  const skillName = sk => SKILL_BY_KEY.get(sk)?.name || sk;

  function needWords(n) {
    const parts = [];
    for (const s of n.skills) if (s.state !== 'ok') parts.push(`${s.need} ${skillName(s.sk)}`);
    if (n.qp?.state === 'no') parts.push(`${n.qp.need} QP`);
    for (const x of n.quests) if (x.state === 'no') parts.push(QUEST_BY_KEY.get(x.key).name);
    return parts;
  }

  function render() {
    P.renderAccount('quests-account', 'quests');
    const body = $('quests-body');
    if (!P.account()) { body.innerHTML = ''; return; }
    const done = doneSet();
    const quests = QUESTS.filter(q => !q.mini), minis = QUESTS.filter(q => q.mini);
    const qp = questPoints(done);
    const rows = QUESTS.map(q => ({ q, done: done.has(q.key), n: needsOf(q, { level, done }) }));
    const ready = rows.filter(r => !r.done && r.n.state === 'ok').length;
    const terms = U.find.toLowerCase().split(/\s+/).filter(Boolean);
    const shown = rows.filter(({ q, done: d, n }) => (U.show === 'all' || (U.show === 'mini' ? q.mini : !q.mini && (U.show === 'members') === !!q.members))
      && (U.status === 'any' || (U.status === 'done' ? d : U.status === 'todo' ? !d : !d && n.state === 'ok'))
      && terms.every(t => q.name.toLowerCase().includes(t)));
    const pct = Math.round((qp / QUEST_POINTS) * 100);
    const noXp = !P.profile();
    const seg = (list, words, cur, attr) => `<div class="seg" role="group">${list.map(v => `<button type="button" data-${attr}="${v}" class="${v === cur ? 'on' : ''}" aria-pressed="${v === cur}">${words[v]}</button>`).join('')}</div>`;
    body.innerHTML = `<div class="card quest-sum">
        <div class="qs-line"><span class="qs-qp">Quest points <b>${qp}</b> of ${QUEST_POINTS}</span>
          <span class="c-muted">${quests.filter(q => done.has(q.key)).length} of ${quests.length} quests done${minis.length ? `, ${minis.filter(q => done.has(q.key)).length} of ${minis.length} miniquests` : ''} · <b>${ready}</b> you can start now</span></div>
        <div class="qs-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${QUEST_POINTS}" aria-valuenow="${qp}"><span style="width:${pct}%"></span></div>
        <p class="note">Tick the quests you've done (the hiscores don't show quests, so it's up to you; they stay with this account). What each one takes is checked against your levels from the hiscores${noXp ? ' once your XP is in' : ''}, the quests it needs against your ticks.</p>
      </div>
      <div class="bar wrap quest-filters">${seg(SHOWS, SHOW_WORDS, U.show, 'quest-show')}${seg(STATUSES, STATUS_WORDS, U.status, 'quest-status')}
        <input class="input small" type="search" data-quest-find="1" value="${esc(U.find)}" placeholder="Find a quest" aria-label="Find a quest" spellcheck="false"></div>
      ${shown.length ? `<div class="table-wrap"><table class="quests-t">
        <thead><tr><th class="q-done-h" title="Done">Done</th><th>Quest</th><th class="num" title="Quest points">QP</th><th>Difficulty</th><th>Length</th><th>What it takes</th></tr></thead>
        <tbody>${shown.map(rowHtml).join('')}</tbody></table></div>` : `<div class="empty">No quests like that.</div>`}`;
  }

  function rowHtml({ q, done: d, n }) {
    const open = U.open === q.key;
    const missing = needWords(n);
    const status = d ? '<span class="c-faint">Done</span>'
      : n.state === 'ok' ? '<span class="q-ok">✓ You can start it</span>'
      : n.state === 'no' ? `<span class="q-no">✗</span> ${esc(missing.join(', '))}`
      : `<span class="q-maybe">?</span> ${esc(missing.join(', ')) || 'Your levels aren\'t in yet'}`;
    return `<tr class="q-row${d ? ' is-done' : ''}${open ? ' is-open' : ''}" data-quest="${q.key}">
      <td class="q-done"><input type="checkbox" data-quest-done="${q.key}"${d ? ' checked' : ''} aria-label="${esc(q.name)} done"></td>
      <td><button type="button" class="linkish q-name" data-quest-open="${q.key}" aria-expanded="${open}">${esc(q.name)}</button>${q.mini ? ' <span class="c-faint small-note">miniquest</span>' : q.members ? '' : ' <span class="tag-free">Free</span>'}</td>
      <td class="num">${q.qp || '–'}</td><td>${esc(q.difficulty || '')}</td><td>${esc(q.length || '')}</td>
      <td class="q-status">${status}</td></tr>
      ${open ? `<tr class="q-card-row"><td colspan="6">${cardHtml(q, n, d)}</td></tr>` : ''}`;
  }

  function cardHtml(q, n, d) {
    const done = doneSet();
    const skillChip = s => {
      const sk = SKILL_BY_KEY.get(s.sk);
      const have = s.have != null ? `you have ${s.have}` : s.lo != null ? `you have ${s.lo}–${s.hi} (not on the hiscores)` : 'no XP yet';
      return `<span class="q-need q-${s.state || 'maybe'}" title="${esc(`${s.need} ${skillName(s.sk)}: ${have}`)}">${sk ? P.iconImg(sk, 'sm') : ''}${s.need} ${esc(skillName(s.sk))} ${mark(s.state)}</span>`;
    };
    const needs = [
      ...n.skills.map(skillChip),
      ...(n.qp ? [`<span class="q-need q-${n.qp.state}" title="${esc(`You have ${n.qp.have} quest points`)}">${n.qp.need} quest points ${mark(n.qp.state)}</span>`] : []),
      ...n.quests.map(x => `<button type="button" class="q-need q-${x.state} linkish" data-quest-open="${x.key}">${esc(QUEST_BY_KEY.get(x.key).name)} ${mark(x.state)}</button>`),
    ];
    // and the quests that need this one
    const unlocks = QUESTS.filter(o => o.quests.includes(q.key));
    const items = q.items.map(([slug, text, more, name]) => {
      const it = ITEMS[slug];
      const label = text || it?.name || name || slug;
      return `<li>${it ? P.itemIcon(slug, true) : ''}<span>${esc(label)}${more ? ` <span class="c-faint">(${esc(more)})</span>` : ''}</span></li>`;
    });
    const xp = Object.entries(q.xp).map(([sk, x]) => `<span class="q-xp">${SKILL_BY_KEY.get(sk) ? P.iconImg(SKILL_BY_KEY.get(sk), 'sm') : ''}${fmt(Math.round(x * 10) / 10)} ${esc(skillName(sk))} XP</span>`);
    const gives = [q.qp ? `<b>${q.qp}</b> quest point${q.qp === 1 ? '' : 's'}` : null, ...xp, q.xpNote ? esc(q.xpNote) : null].filter(Boolean);
    return `<div class="quest-card">
      <div class="qc-head"><b>${esc(q.name)}</b> <span class="c-muted">${q.mini ? 'Miniquest' : q.members ? 'Members' : 'Free'} · ${esc(q.difficulty || '')} · ${esc(q.length || '')}</span>
        <a class="qc-guide" ${out(guideUrl(q))}>Full guide on LostHQ ↗</a></div>
      <div class="qc-grid">
        <div><h5>Starts</h5><p>${esc(q.start || '')}</p>
          <h5>It takes</h5>${needs.length ? `<div class="q-needs">${needs.join('')}</div>` : '<p class="c-faint">No skills or quests.</p>'}
          ${q.needs.length ? `<ul class="q-also">${q.needs.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
          ${items.length ? `<h5>Bring</h5><ul class="q-items">${items.join('')}</ul>` : ''}
          <h5>It gives</h5><p class="q-gives">${gives.map(g => `<span>${g}</span>`).join('') || '<span class="c-faint">No XP</span>'}</p>
          ${q.unlocks ? `<p class="q-unlocks">${esc(q.unlocks)}</p>` : ''}
          ${unlocks.length ? `<p class="c-muted small-note">Needed for ${unlocks.map(o => `<button type="button" class="linkish" data-quest-open="${o.key}">${esc(o.name)}</button>${done.has(o.key) ? ' ✓' : ''}`).join(', ')}</p>` : ''}</div>
        <div><h5>Steps</h5><ol class="q-steps">${q.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
          <p class="c-faint small-note">The short version: LostHQ's guide has every detail.</p></div>
      </div>
      <label class="check qc-tick"><input type="checkbox" data-quest-done="${q.key}"${d ? ' checked' : ''}> I've done ${esc(q.name)}</label>
    </div>`;
  }

  function setDone(k, on) {
    const set = doneSet();
    if (on) set.add(k); else set.delete(k);
    saveDone(set);
  }

  return {
    render,
    onClick(e) {
      const t = e.target.closest('[data-quest-open], [data-quest-show], [data-quest-status]');
      if (!t || !t.closest('#view-quests')) return false;
      const d = t.dataset;
      if (d.questOpen) {
        U.open = U.open === d.questOpen ? null : d.questOpen;
        // (a quest opened from another one's card: make sure the list shows it)
        if (U.open && !$('view-quests').querySelector(`tr[data-quest="${U.open}"]`)) { U.show = 'all'; U.status = 'any'; U.find = ''; }
        saveUi(); P.redraw();
        if (U.open) requestAnimationFrame(() => $('view-quests').querySelector(`tr[data-quest="${U.open}"]`)?.scrollIntoView({ block: 'nearest' }));
        return true;
      }
      if (d.questShow) { U.show = d.questShow; saveUi(); P.redraw(); return true; }
      if (d.questStatus) { U.status = d.questStatus; saveUi(); P.redraw(); return true; }
      return false;
    },
    onChange(e) {
      const t = e.target;
      if (t.dataset?.questDone) { setDone(t.dataset.questDone, t.checked); P.redraw(); return true; }
      return false;
    },
    onInput(e) {
      const t = e.target;
      if (t.dataset?.questFind) { U.find = t.value; P.redraw(); return true; }
      return false;
    },
  };
}
