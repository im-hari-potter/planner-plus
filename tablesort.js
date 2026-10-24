// Tables sorted by their columns' names (v3.3; up to v3.2 each had Sort buttons of its own), and (v3.3.1) kept
// where they were scrolled to when they're drawn again (tableScrolls, restoreTableScrolls, at the end). A click on a
// column's name sorts by it, first the way that's of most use (the most XP or gp first, the lowest level or
// cost first, A to Z), and a click again the other way. The arrow is the order now: ▲ the smallest (or A)
// first, ▼ the biggest first. A row with nothing in that column (a ?, a –) goes last either way, and rows
// that are level keep the order they had.

// (a th's own attributes, quoted values and all, then what's in it)
const TH = /^<th((?:\s+[\w-]+(?:="[^"]*")?)*)\s*>([\s\S]*)<\/th>$/;

// A column's <th> with its name a button that sorts by it. attr: the button's data attribute (without
// "data-"); spec: { key, desc } (desc: the biggest first, the first time); now: the table's order { key, desc },
// or null for its own; after: more in the th, after the button (a button of its own: not in this one).
export function sortTh(th, attr, spec, now, after = '') {
  const m = TH.exec(th.trim());
  if (!m) return th;
  const on = now?.key === spec.key;
  const dir = on ? (now.desc ? 'desc' : 'asc') : '';
  // (the arrow is drawn by style.css, so the column's name is all the text there is)
  return `<th${m[1]} aria-sort="${on ? (now.desc ? 'descending' : 'ascending') : 'none'}"><button type="button" class="th-sort${on ? ` on ${dir}` : ''}" data-${attr}="${spec.key}"${on ? ` data-sort-now="${dir}"` : ''}${spec.desc ? ' data-desc-first="1"' : ''}>${m[2]}<span class="arrow" aria-hidden="true"></span></button>${after}</th>`;
}

// The order a click on such a button asks for: the other way round if it's the order now, else its first way.
export function sortFrom(btn, key) {
  const now = btn.dataset.sortNow;
  return { key, desc: now ? now === 'asc' : btn.dataset.descFirst === '1' };
}

// The order kept between visits: { key, desc } as saved, or an old version's name for one (up to v3.2, a
// button's: its first way), or the first of keys.
export function savedSort(saved, keys, descFirst = []) {
  if (typeof saved === 'string') return keys.includes(saved) ? { key: saved, desc: descFirst.includes(saved) } : { key: keys[0], desc: descFirst.includes(keys[0]) };
  if (saved && typeof saved.key === 'string' && keys.includes(saved.key)) return { key: saved.key, desc: !!saved.desc };
  return { key: keys[0], desc: descFirst.includes(keys[0]) };
}

// A list sorted by value(item): a number or a string (A to Z, numbers in them as numbers). null, undefined,
// NaN and ±Infinity are nothing to sort by: those go last, either way. Ties keep their order.
export function sortedBy(list, value, desc = false) {
  const none = x => x == null || (typeof x === 'number' && !Number.isFinite(x));
  return list.map((item, i) => ({ item, i, x: value(item) })).sort((a, b) => {
    const an = none(a.x), bn = none(b.x);
    if (an || bn) return (an - bn) || a.i - b.i;
    const c = typeof a.x === 'string' || typeof b.x === 'string'
      ? String(a.x).localeCompare(String(b.x), 'en', { numeric: true, sensitivity: 'base' })
      : a.x - b.x;
    return (desc ? -c : c) || a.i - b.i;
  }).map(v => v.item);
}

// (v3.3.1) A view drawn again keeps each of its tables where it was scrolled to, sideways and down: up to
// v3.3.0 a redraw (prices coming in, a click) put a table scrolled sideways back at its left. A table is
// known by the goal or monster page it's in, its kind, the name of its first column, and how many such
// tables come before it; one that isn't there any more is let go.
const scrollKeys = root => {
  const seen = new Map();
  return [...root.querySelectorAll('.table-wrap')].map(w => {
    const owner = w.closest('[data-goal]')?.dataset.goal ?? w.closest('[data-npc-page]')?.dataset.npcPage ?? '';
    const k = `${owner}|${w.querySelector('table')?.className ?? ''}|${w.querySelector('thead th')?.textContent.trim() ?? ''}`;
    const n = seen.get(k) || 0;
    seen.set(k, n + 1);
    return [`${k}|${n}`, w];
  });
};
// Where root's tables are scrolled to: key -> [left, top] (only the ones scrolled at all)
export function tableScrolls(root) {
  const out = new Map();
  if (root) for (const [k, w] of scrollKeys(root)) if (w.scrollLeft || w.scrollTop) out.set(k, [w.scrollLeft, w.scrollTop]);
  return out;
}
// ...and back there, once root is drawn again
export function restoreTableScrolls(root, saved) {
  if (!root || !saved?.size) return;
  for (const [k, w] of scrollKeys(root)) {
    const v = saved.get(k);
    if (v) { w.scrollLeft = v[0]; w.scrollTop = v[1]; }
  }
}
