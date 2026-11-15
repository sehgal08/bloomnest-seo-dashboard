(() => {

  // ---------- tabs (4 main tabs, each with sub-tabs), language filter, summary tiles ----------
  const tabs = [...document.querySelectorAll('.ms-subtab')];
  const mains = [...document.querySelectorAll('.ms-main')];
  MS.lastSub = { summary: 'overview', results: 'last-week', plan: 'this-week', health: 'keywords' };
  MS.show = (id) => {
    if (!document.getElementById(id)) return;
    const group = (tabs.find((b) => b.dataset.tab === id) || {}).dataset?.group || 'summary';
    MS.lastSub[group] = id;
    const subs = tabs.filter((b) => b.dataset.group === group);
    for (const b of tabs) {
      const on = b.dataset.tab === id;
      b.setAttribute('aria-selected', on);
      b.hidden = b.dataset.group !== group || subs.length < 2;
      document.getElementById(b.dataset.tab).hidden = !on;
    }
    for (const m of mains) m.setAttribute('aria-pressed', String(m.dataset.group === group));
    document.getElementById('subtabs').hidden = subs.length < 2;
    MS.current = id;
    dash.setLink(id);
    MS.redraw();
  };
  tabs.forEach((b) => b.addEventListener('click', () => MS.show(b.dataset.tab)));
  mains.forEach((m) => m.addEventListener('click', () => MS.show(MS.lastSub[m.dataset.group])));
  MS.current = 'overview';
  document.getElementById('subtabs').hidden = true;

  const langSel = document.getElementById('lang');
  langSel.addEventListener('change', () => { MS.state.lang = langSel.value; MS.state.aaPick = null; MS.redraw(); });

  const jump = (id) => document.getElementById(id).scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('go-high').addEventListener('click', () => { Object.assign(MS.state, { aaPrio: 'High', aaBucket: '', aaPick: null }); MS.redraw(); jump('article-actions'); });
  document.getElementById('go-silent').addEventListener('click', () => { MS.state.caBucket = 'No impressions yet'; MS.redraw(); jump('qa-actions'); });
  document.getElementById('go-new').addEventListener('click', () => { MS.state.kaAction = 'Create new'; MS.redraw(); jump('keyword-actions'); });
  document.getElementById('go-index').addEventListener('click', () => MS.show('indexing'));

  MS.fmtChange = (el, v, goodUp = true) => {
    el.classList.remove('ms-good', 'ms-bad', 'ms-flat');
    if (v == null) { el.textContent = '—'; el.classList.add('ms-flat'); return; }
    el.textContent = MS.pct(v);
    el.classList.add(Math.abs(v) < 0.005 ? 'ms-flat' : (v > 0) === goodUp ? 'ms-good' : 'ms-bad');
  };

  MS.drawHeader = () => {
    const d = dash.data('kpis');
    for (const b of document.querySelectorAll('[data-source="kpis"][data-where]:not(#ov-period-text)')) {
      if (d.status !== 'ok') { if (d.status === 'error') b.classList.remove('dash-skeleton'); continue; }
      b.classList.remove('dash-skeleton');
      const row = d.data.find((r) => r.key === decodeURIComponent(b.dataset.where.slice(4)));
      if (!row) continue;
      if (b.dataset.field === 'value') b.textContent = MS.n(Math.round(row.value));
      else if (b.dataset.field === 'change_pct') MS.fmtChange(b, row.change_pct);
      else b.textContent = row.period;
    }
    const ap = dash.data('articles_pages');
    if (ap.status === 'ok') {
      const langs = [...new Set(ap.data.map((r) => r.language))].sort((a, b) => (a === 'English' ? -1 : b === 'English' ? 1 : a.localeCompare(b)));
      if (langSel.options.length !== langs.length + 1) langSel.replaceChildren(new Option('All languages', ''), ...langs.map((l) => new Option(l)));
      langSel.value = MS.state.lang;
    }
    const ws = dash.data('week_summary');
    for (const el of document.querySelectorAll('[data-source="week_summary"]')) {
      const key = new URLSearchParams(el.dataset.where).get('key');
      el.dataset.where = 'key=' + key + '&language=' + encodeURIComponent(MS.state.lang || 'All');
      if (ws.status !== 'ok') { if (ws.status === 'error') { el.classList.remove('dash-skeleton'); el.textContent = '—'; } continue; }
      el.classList.remove('dash-skeleton');
      const row = ws.data.find((r) => r.key === key && r.language === (MS.state.lang || 'All'));
      el.textContent = row ? MS.n(row.value) : '0';
    }
  };

})();
