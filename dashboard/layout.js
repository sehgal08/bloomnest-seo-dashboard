(() => {
  // ---------- 4-tab layout: Key points, page-type switch, Clean-up and Keywords tiles, per-week chart switch ----------
  const MS = window.MS;

  dash.calc('key_points', {
    title: 'Key points this week (web)',
    description: 'Picks four short lines for the Summary: the 7-day Google clicks change (always), then the three biggest of: last week’s publishing and how recent updates did, a bulk edit, the biggest quick win, pages not indexed, and the biggest keyword move.',
    inputs: ['kpis', 'content_summary', 'update_impact', 'article_actions', 'index_summary', 'tracker_heat', 'changelog_app_view'],
    fn: (kpis, content_summary, update_impact, article_actions, index_summary, tracker_heat, changelog_app_view) => {
      const n = (x) => Math.round(Number(x) || 0).toLocaleString('en-US');
      const pct = (x) => (x == null ? 'no earlier data' : (x >= 0 ? 'up ' : 'down ') + Math.abs(Math.round(x * 1000) / 10) + '%');
      const tone = (x) => (x == null ? '' : x <= -0.03 ? 'bad' : x >= 0.03 ? 'good' : '');
      const out = [];
      const k = (seg) => kpis.find((r) => r.key === seg + '|clicks|7');
      const w = k('Whole site'), a = k('Articles'), c = k('Community Q&A');
      if (w) out.push({ key: 'traffic', score: 1000, tab: 'overview', tone: tone(w.change_pct),
        text: 'Google clicks ' + n(w.value) + ' in the last 7 days, ' + pct(w.change_pct) + ' on the 7 days before (articles ' + pct(a && a.change_pct) + ', Q&A pages ' + pct(c && c.change_pct) + ')' });
      const cs = (t, kind) => (content_summary.find((r) => r.content_type === t && r.kind === kind) || {}).last_week || 0;
      const done = update_impact.filter((r) => r.days_after >= 3);
      const up = done.filter((r) => r.change_pct > 0.05).length;
      out.push({ key: 'work', score: 40, tab: 'last-week', tone: done.length && up < done.length / 2 ? 'bad' : '',
        text: 'Last week we published ' + n(cs('Article', 'created')) + ' articles and ' + n(cs('Community Q&A', 'created')) + ' Q&A pages and updated ' + n(cs('Article', 'updated') + cs('Community Q&A', 'updated')) + ' pages'
          + (done.length ? '; ' + up + ' of ' + done.length + ' recent updates got more clicks after the edit' : '') });
      const dates = changelog_app_view.map((r) => String(r.date)).sort();
      const lastDay = dates[dates.length - 1];
      const bulk = changelog_app_view.filter((r) => Number(r.bulk) >= 20 && lastDay && (Date.parse(lastDay) - Date.parse(r.date)) <= 13 * 864e5)
        .sort((x, y) => Number(y.bulk) - Number(x.bulk))[0];
      if (bulk) out.push({ key: 'bulk', score: 90, tab: 'changelog', tone: 'bad', text: 'Bulk edit: ' + n(bulk.bulk) + ' pages were saved at the same moment on ' + bulk.date + '. Check it was meant' });
      const win = article_actions.filter((r) => r.bucket === 'Fix title & meta' || r.bucket === 'Move up').sort((x, y) => y.est_extra_clicks - x.est_extra_clicks)[0];
      if (win && win.est_extra_clicks > 0) out.push({ key: 'win', score: 50, tab: 'this-week', tone: 'good',
        text: 'Biggest quick win: “' + win.title + '” could get about +' + n(win.est_extra_clicks) + ' clicks in 28 days (' + win.bucket.toLowerCase() + ')' });
      const ins = index_summary.reduce((t, r) => t + (r.inspected || 0), 0), ni = index_summary.reduce((t, r) => t + (r.not_indexed || 0), 0);
      if (ni) out.push({ key: 'index', score: 30 + Math.min(50, (ni / Math.max(1, ins)) * 200), tab: 'indexing', tone: 'bad',
        text: n(ni) + ' of ' + n(ins) + ' checked pages are not indexed by Google yet' });
      const lastPos = (r) => { for (let i = 8; i >= 1; i--) if (r['week_' + i] != null) return r['week_' + i]; return null; };
      const mv = tracker_heat.filter((r) => r.pos_change != null).sort((x, y) => Math.abs(y.pos_change) - Math.abs(x.pos_change))[0];
      if (mv && Math.abs(mv.pos_change) >= 1) out.push({ key: 'keyword', score: Math.min(80, Math.abs(mv.pos_change) * 6), tab: 'keywords', tone: mv.pos_change > 0 ? 'good' : 'bad',
        text: '“' + mv.query + '” moved ' + (mv.pos_change > 0 ? 'up ' : 'down ') + Math.abs(mv.pos_change) + ' places in 8 weeks, now #' + lastPos(mv) });
      const [first, ...rest] = out;
      return [first, ...rest.sort((x, y) => y.score - x.score).slice(0, 3)].filter(Boolean).map((r, i) => ({ ...r, rank: i + 1, score: Math.round(r.score) }));
    },
  });

  dash.calc('key_points_app', {
    title: 'Key points this week (app)',
    description: 'Picks four short lines for the Summary in App view: app views of app articles, last 7 days of app data against the 7 before (always), then the three biggest of: articles dropped from app recommendations after an edit, a bulk edit, app-only articles worth a web page, and cards to fix.',
    inputs: ['app_daily', 'changelog_app_view', 'app_actions'],
    fn: (app_daily, changelog_app_view, app_actions) => {
      const n = (x) => Math.round(Number(x) || 0).toLocaleString('en-US');
      const out = [];
      const all = app_daily.filter((r) => r.segment === 'All app articles').sort((x, y) => (x.date < y.date ? -1 : 1));
      const last7 = all.slice(-7), prev7 = all.slice(-14, -7);
      const v = last7.reduce((t, r) => t + Number(r.views), 0), pv = prev7.reduce((t, r) => t + Number(r.views), 0);
      const ch = pv ? (v - pv) / pv : null;
      if (last7.length) out.push({ key: 'views', score: 1000, tab: 'overview', tone: ch == null ? '' : ch <= -0.03 ? 'bad' : ch >= 0.03 ? 'good' : '',
        text: 'App articles got ' + n(v) + ' app views in the last 7 days of app data (to ' + last7[last7.length - 1].date + ')' + (ch == null ? '' : ', ' + (ch >= 0 ? 'up ' : 'down ') + Math.abs(Math.round(ch * 1000) / 10) + '% on the 7 days before') });
      const measured = changelog_app_view.filter((r) => r.impr_before != null);
      const dropped = measured.filter((r) => r.dropped === true || r.dropped === 'true');
      if (dropped.length) out.push({ key: 'dropped', score: 85, tab: 'changelog', tone: 'bad',
        text: n(dropped.length) + ' of ' + n(measured.length) + ' edited articles dropped out of app recommendations after the edit' });
      const dates = changelog_app_view.map((r) => String(r.date)).sort();
      const lastDay = dates[dates.length - 1];
      const bulk = changelog_app_view.filter((r) => Number(r.bulk) >= 20 && lastDay && (Date.parse(lastDay) - Date.parse(r.date)) <= 13 * 864e5)
        .sort((x, y) => Number(y.bulk) - Number(x.bulk))[0];
      if (bulk) out.push({ key: 'bulk', score: 70, tab: 'changelog', tone: 'bad', text: 'Bulk edit: ' + n(bulk.bulk) + ' pages were saved at the same moment on ' + bulk.date + '. Watch their app reach' });
      const cnt = (a) => new Set(app_actions.filter((r) => r.action === a).map((r) => r.id)).size;
      const web = cnt('Create web version'), card = cnt('Fix the card');
      if (web) out.push({ key: 'web', score: 50, tab: 'this-week', tone: 'good', text: n(web) + ' app-only articles have 100+ app views but no web page yet' });
      if (card) out.push({ key: 'card', score: 40, tab: 'this-week', tone: '', text: n(card) + ' articles are shown often in the app but rarely tapped: fix the card title or image' });
      const [first, ...rest] = out;
      return [first, ...rest.sort((x, y) => y.score - x.score).slice(0, 3)].filter(Boolean).map((r, i) => ({ ...r, rank: i + 1 }));
    },
  });

  dash.calc('tracker_summary', {
    title: 'Keyword tracker in numbers',
    description: 'Counts the tracked searches, how many moved up or down by a place or more over the 8 weeks, and how many are in the top 3 in the latest week.',
    inputs: ['tracker_heat'],
    fn: (tracker_heat) => {
      const lastPos = (r) => { for (let i = 8; i >= 1; i--) if (r['week_' + i] != null) return r['week_' + i]; return null; };
      return [
        { key: 'tracked', label: 'Searches tracked', value: tracker_heat.length, sub: 'Top 25 by impressions, last 4 weeks' },
        { key: 'up', label: 'Moved up in 8 weeks', value: tracker_heat.filter((r) => r.pos_change >= 1).length, sub: 'One place or more' },
        { key: 'down', label: 'Moved down in 8 weeks', value: tracker_heat.filter((r) => r.pos_change <= -1).length, sub: 'One place or more' },
        { key: 'top3', label: 'In the top 3 now', value: tracker_heat.filter((r) => lastPos(r) != null && lastPos(r) <= 3).length, sub: 'Latest week' },
      ];
    },
  });

  // ---------- Summary: page-type switch drives the scorecard cards and the daily trend ----------
  const WEB_SEGS = [['Whole site', 'Whole site'], ['Articles', 'Articles'], ['Community Q&A', 'Q&A']];
  const APP_SEGS = [['All app articles', 'All app articles'], ['Web articles in app', 'Web articles in app'], ['App-only articles', 'App-only']];
  MS.state.ovPick = MS.state.ovPick || 'Whole site';
  MS.state.ovPickApp = MS.state.ovPickApp || 'All app articles';
  const segSel = document.getElementById('ov-seg'), appSegSel = document.getElementById('ov-app-seg');
  segSel.addEventListener('change', () => { MS.state.ovPick = segSel.value; MS.redraw(); });
  appSegSel.addEventListener('change', () => { MS.state.ovPickApp = appSegSel.value; MS.redraw(); });
  const pickChips = (box, segs, cur, onPick) => {
    box.replaceChildren(...segs.map(([v, label]) => {
      const b = MS.el('button', 'ms-fchip', label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(v === cur));
      b.addEventListener('click', () => onPick(v));
      return b;
    }));
  };
  // The scorecard is drawn as a table (one row per page type); show the picked row as cards and the others' change as a hint line.
  const toCards = (box, pick, segs, hintCol) => {
    const table = box.querySelector('table.ms-score');
    if (!table) return;
    const heads = [...table.tHead.rows[0].cells].slice(1).map((c) => c.textContent);
    const rows = [...table.tBodies[0].rows];
    const hint = document.getElementById('ov-seghint');
    hint.replaceChildren(MS.el('span', null, heads[hintCol] + ' vs the period before: '));
    rows.forEach((tr, i) => {
      const name = tr.cells[0].textContent, d = tr.cells[hintCol + 1].querySelector('.d');
      const label = (segs.find(([v]) => v === name) || [name, name])[1];
      if (i) hint.append(' · ');
      const sp = MS.el('span', d ? d.className.replace(/\bd\b/, '').trim() : null, label + ' ' + (d ? d.textContent : '—'));
      hint.append(sp);
    });
    const row = rows.find((tr) => tr.cells[0].textContent === pick) || rows[0];
    const cards = MS.el('div', 'ms-cards');
    [...row.cells].slice(1).forEach((td, i) => {
      const c = MS.el('div', 'ms-cardv');
      c.append(MS.el('span', 'ms-tile-label', heads[i]), ...td.childNodes);
      cards.append(c);
    });
    box.replaceChildren(cards);
  };

  // ---------- Results → Last week: All / Articles / Q&A for the per-week charts ----------
  MS.state.lwType = MS.state.lwType || '';
  const lwType = document.getElementById('lw-chartpick');
  const applyLwType = () => {
    const app = MS.state.channel === 'app';
    const opts = app ? [['', 'All'], ['0', 'Web articles'], ['1', 'App-only']] : [['', 'All'], ['0', 'Articles'], ['1', 'Q&A']];
    pickChips(lwType, opts, MS.state.lwType, (v) => { MS.state.lwType = v; MS.redraw(); });
    for (const first of ['weekly-articles', 'app-weekly-web']) {
      const grid = document.getElementById(first).parentElement;
      [...grid.children].forEach((card, i) => { card.hidden = MS.state.lwType !== '' && String(i) !== MS.state.lwType; });
      grid.style.gridTemplateColumns = MS.state.lwType === '' ? '' : '1fr';
    }
  };

  // ---------- Key points ----------
  const drawKeyPoints = () => {
    for (const [id, src] of [['kp-web', 'key_points'], ['kp-app', 'key_points_app']]) {
      const ul = document.getElementById(id), d = dash.data(src);
      if (d.status !== 'ok') { ul.replaceChildren(MS.el('li', d.status === 'error' ? 'ms-note' : 'dash-skeleton', d.status === 'error' ? 'Key points did not load.' : '—')); continue; }
      ul.replaceChildren(...d.data.map((r) => {
        const li = MS.el('li', r.tone ? 'ms-' + r.tone : null);
        const b = MS.el('button', null, r.text);
        b.type = 'button';
        b.addEventListener('click', () => { MS.show(r.tab); document.getElementById(r.tab).scrollIntoView({ behavior: 'smooth', block: 'start' }); });
        li.append(b);
        return li;
      }));
    }
  };

  // ---------- Clean-up: meta title tile; Keywords: tiles ----------
  document.getElementById('cu-nometa').addEventListener('click', () => document.getElementById('nometa-actions').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  const drawCleanupTile = () => {
    const d = dash.data('nometa_articles'), big = document.getElementById('cu-nometa-count');
    if (d.status === 'ok') { big.classList.remove('dash-skeleton'); big.textContent = MS.n(MS.byLang(d.data).length); }
    else if (d.status === 'error') { big.classList.remove('dash-skeleton'); big.textContent = '—'; }
  };
  const drawTrackerTiles = () => {
    const box = document.getElementById('kt-tiles'), d = dash.data('tracker_summary');
    if (d.status !== 'ok') { if (d.status === 'error') MS.failed(box); else box.replaceChildren(MS.el('div', 'ms-tile dash-skeleton', '')); return; }
    box.replaceChildren(...d.data.map((r) => {
      const t = MS.el('div', 'ms-tile');
      t.append(MS.el('span', 'ms-tile-label', r.label), MS.el('span', 'ms-big' + (r.key === 'down' && r.value ? ' ms-bad' : ''), MS.n(r.value)), MS.el('span', 'ms-delta ms-flat', r.sub));
      return t;
    }));
  };

  // ---------- Results → All edits: switches for content type and period; Earlier edits folded ----------
  const clTypeSel = document.getElementById('cl-type');
  MS.state.clPeriod = MS.state.clPeriod || 'all';
  const drawClPicks = () => {
    pickChips(document.getElementById('cl-typepick'), [['', 'All'], ['Article', 'Articles'], ['Community Q&A', 'Q&A']], clTypeSel.value,
      (v) => { clTypeSel.value = v; MS.state.more.cl = false; MS.redraw(); });
    const cv = dash.data('changelog_view');
    const first = cv.status === 'ok' && cv.data.length ? cv.data.reduce((m, r) => (!m || r.date < m ? r.date : m), '') : '';
    pickChips(document.getElementById('cl-periodpick'), [['7', '7 days'], ['all', first ? 'Since ' + MS.fmtDay(first).replace(/,? \d{4}$/, '') : 'All']], MS.state.clPeriod,
      (v) => { MS.state.clPeriod = v; MS.state.more.cl = false; MS.redraw(); });
  };
  (() => {
    const card = document.getElementById('cl-older'), head = card.querySelector('.ms-sec-head');
    const body = MS.el('div', 'ms-fold-body'); body.hidden = true;
    [...card.children].filter((c) => c !== head).forEach((c) => body.append(c));
    card.append(body);
    const btn = MS.el('button', 'ms-linkbtn ms-fold-btn', '▸ Open'); btn.type = 'button'; btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', () => { body.hidden = !body.hidden; btn.textContent = body.hidden ? '▸ Open' : '▾ Close'; btn.setAttribute('aria-expanded', String(!body.hidden)); MS.redraw(); });
    head.append(btn);
  })();

  // Run before the page's own drawing (choices that change what it draws), and after it (reshape what it drew).
  const baseRedraw = MS.redraw;
  MS.redraw = () => {
    segSel.value = MS.state.ovPick;
    appSegSel.value = MS.state.ovPickApp;
    if (MS.current === 'last-week') applyLwType();
    if (MS.current === 'changelog' && MS.state.channel !== 'app') drawClPicks();
    baseRedraw();
    if (MS.current === 'overview') {
      const app = MS.state.channel === 'app';
      pickChips(document.getElementById('ov-pick-web'), WEB_SEGS, MS.state.ovPick, (v) => { MS.state.ovPick = v; MS.redraw(); });
      pickChips(document.getElementById('ov-pick-app'), APP_SEGS, MS.state.ovPickApp, (v) => { MS.state.ovPickApp = v; MS.redraw(); });
      if (app) toCards(document.getElementById('ov-app-kpis'), MS.state.ovPickApp, APP_SEGS, 3);
      else toCards(document.getElementById('ov-kpis'), MS.state.ovPick, WEB_SEGS, 0);
      drawKeyPoints();
    }
    if (MS.current === 'merge') drawCleanupTile();
    if (MS.current === 'keywords') drawTrackerTiles();
  };
  MS.redraw();

})();
