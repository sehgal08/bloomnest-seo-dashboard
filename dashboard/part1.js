(() => {

  window.MS = { state: { lang: '', aaBucket: '', aaPrio: '', aaPick: null, caBucket: '', kaAction: '', more: {} } };
  const MS = window.MS;
  MS.n = d3.format(',');
  MS.compact = (v) => v >= 10000 ? new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v) : MS.n(v);
  MS.pct = (v) => v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : '') + d3.format('.0%')(v);
  MS.status = (...ids) => {
    const s = ids.map((id) => dash.data(id).status);
    if (s.every((x) => x === 'ok')) return 'ok';
    if (s.some((x) => x === 'error' || x === 'missing')) return 'error';
    return 'loading';
  };
  MS.el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  // Full page URL under a title: readable (decoded), one click selects it all for copying.
  MS.path = (href) => {
    if (!href) return null;
    if (href.startsWith('https://search.google.com/')) return MS.el('span', 'ms-path ms-path-cut', 'URL cut off by Search Console · link opens Search Console');
    if (!href.startsWith('https://bloomnest.example')) return null;
    let p = href.slice('https://bloomnest.example'.length) || '/';
    try { p = decodeURIComponent(p); } catch (e) { /* keep as is */ }
    const el = MS.el('span', 'ms-path', 'https://bloomnest.example' + p);
    el.dataset.url = encodeURI('https://bloomnest.example' + p); // what lands on the clipboard
    return el;
  };
  // Copying a URL puts the encoded web address on the clipboard, so non-English URLs paste and open correctly.
  document.addEventListener('copy', (e) => {
    const sel = window.getSelection();
    const node = sel && sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
    const el = node && node.closest && node.closest('.ms-path[data-url]');
    if (!el || !e.clipboardData || sel.toString().trim() !== el.textContent.trim()) return;
    e.clipboardData.setData('text/plain', el.dataset.url);
    e.preventDefault();
  });
  MS.link = (text, href, sub) => {
    const wrap = MS.el('span', 'ms-title');
    if (href) { const a = MS.el('a', null, text); a.href = href; a.target = '_blank'; a.rel = 'noopener'; wrap.append(a); } else wrap.append(text);
    const path = MS.path(href);
    if (path && path.textContent !== 'https://bloomnest.example' + text) wrap.append(path);
    if (sub) wrap.append(MS.el('span', 'ms-sub', sub));
    return wrap;
  };
  MS.pill = (p) => MS.el('span', 'ms-pill ms-p-' + p, p);
  MS.chip = (t) => MS.el('span', 'ms-chip', t);
  MS.failed = (box, msg) => { box.classList.remove('dash-skeleton'); box.replaceChildren(MS.el('div', 'ms-failed', msg || 'Failed to load')); };
  MS.fixCell = (fix, why) => {
    const s = MS.el('span', null, fix);
    if (why) { const d = MS.el('details'); d.append(MS.el('summary', null, 'Why'), MS.el('p', null, why)); s.append(d); }
    return s;
  };
  MS.bar = (v, max, text) => {
    const w = MS.el('span', 'ms-cellbar');
    const i = MS.el('i'); i.style.width = Math.max(2, Math.round((v / (max || 1)) * 64)) + 'px';
    w.append(i, MS.el('span', null, text));
    return w;
  };
  MS.byLang = (rows) => MS.state.lang ? rows.filter((r) => r.language === MS.state.lang) : rows;
  // Fill a marked table body: words only, one <tr data-key> per row.
  MS.table = (table, rows, cols, key) => {
    table.tBodies[0].replaceChildren(...rows.map((r) => {
      const tr = document.createElement('tr');
      tr.dataset.key = r[key];
      for (const c of cols) {
        const td = document.createElement('td');
        if (c.cls) td.className = c.cls;
        const v = c.render ? c.render(r) : r[c.f];
        if (v instanceof Node) td.append(v); else td.textContent = v == null || v === '' ? '—' : v;
        tr.append(td);
      }
      return tr;
    }));
  };
  MS.tableState = (table, ...ids) => {
    const st = MS.status(...ids);
    if (st === 'ok') return true;
    const td = document.createElement('td');
    td.colSpan = table.tHead.rows[0].cells.length;
    const inner = st === 'error' ? MS.el('div', 'ms-failed', 'Failed to load') : MS.el('div', 'dash-skeleton', '');
    if (st !== 'error') inner.style.minHeight = '3rem';
    td.append(inner);
    const tr = document.createElement('tr'); tr.append(td); table.tBodies[0].replaceChildren(tr);
    return false;
  };
  // Top 5 unless "Show all" is on for that table.
  MS.TOP = 5;
  MS.limit = (key, rows) => (MS.state.more[key] ? rows : rows.slice(0, MS.TOP));
  MS.moreBtn = (key, total) => {
    const b = document.querySelector(`[data-more="${key}"]`);
    b.hidden = total <= MS.TOP;
    b.textContent = MS.state.more[key] ? 'Show top ' + MS.TOP : 'Show all ' + MS.n(total);
  };
  document.querySelectorAll('[data-more]').forEach((b) => b.addEventListener('click', () => {
    MS.state.more[b.dataset.more] = !MS.state.more[b.dataset.more];
    MS.redraw();
  }));
  // Filter chips with counts.
  MS.chips = (box, items, current, onPick, colors) => {
    box.replaceChildren(...items.map(([value, label, count]) => {
      const b = MS.el('button', 'ms-fchip');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(value === current));
      if (colors && colors[value]) { const s = MS.el('span', 'ms-sw'); s.style.background = colors[value]; b.append(s); }
      b.append(label + ' · ' + MS.n(count));
      b.addEventListener('click', () => onPick(value));
      return b;
    }));
  };
  const root = document.querySelector('.ms');
  dash.colors.slice(0, 6).forEach((c, i) => root.style.setProperty('--ms-c' + i, c));
  MS.bucketColor = { 'Fix title & meta': dash.colors[0], 'Move up': dash.colors[1], 'Losing clicks': dash.colors[2], 'Rework for intent': dash.colors[3], 'Not indexed': dash.colors[4] };

})();
