(() => {

  // ---------- This week ----------
  const aaPrio = document.getElementById('aa-prio'), aaQ = document.getElementById('aa-q'), aaPick = document.getElementById('aa-pick'), caQ = document.getElementById('ca-q');
  aaPrio.addEventListener('change', () => { MS.state.aaPrio = aaPrio.value; MS.redraw(); });
  aaQ.addEventListener('input', () => MS.redraw());
  caQ.addEventListener('input', () => MS.redraw());
  aaPick.addEventListener('click', () => { MS.state.aaPick = null; MS.redraw(); });

  MS.tip = (box) => { let t = box.querySelector('.ms-tip'); if (!t) { t = MS.el('div', 'ms-tip'); t.hidden = true; box.append(t); } return t; };
  MS.placeTip = (t, box, px, py) => {
    t.style.left = Math.max(0, Math.min(px + 14, box.clientWidth - t.offsetWidth - 4)) + 'px';
    t.style.top = Math.max(0, py - t.offsetHeight - 8) + 'px';
  };

  const drawOpps = (rows) => {
    const box = document.getElementById('chart-opps');
    const d = dash.data('article_actions');
    if (d.status !== 'ok') { if (d.status === 'error') MS.failed(box); return; }
    box.classList.remove('dash-skeleton');
    const W = Math.max(300, box.clientWidth), H = 320, m = { t: 22, r: 16, b: 34, l: 52 };
    const x = d3.scaleLinear([1, Math.min(40, Math.max(20, d3.max(rows, (r) => r.pos_28d) || 20))], [m.l, W - m.r]).clamp(true);
    const y = d3.scaleLog([300, Math.max(1000, d3.max(rows, (r) => r.impr_28d) || 1000)], [H - m.b, m.t]).clamp(true);
    const rad = d3.scaleSqrt([0, d3.max(d.data, (r) => r.est_extra_clicks) || 1], [2.5, 16]);
    const svg = d3.create('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Articles by position and impressions');
    svg.append('rect').attr('x', x(3.5)).attr('width', x(10) - x(3.5)).attr('y', m.t).attr('height', H - m.t - m.b).attr('fill', 'var(--cds-chart-reference)').attr('opacity', 0.12);
    svg.append('text').attr('x', (x(3.5) + x(10)) / 2).attr('y', m.t + 12).attr('text-anchor', 'middle').attr('fill', 'var(--color-fg-muted)').attr('font-size', 11).text(W < 480 ? 'Quick-win zone' : 'Quick-win zone: page 1, not top 3');
    const yt = [300, 1000, 3000, 10000, 30000, 100000, 300000, 1000000].filter((v) => v >= y.domain()[0] && v <= y.domain()[1]);
    svg.append('g').selectAll('line').data(yt).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
    svg.append('g').selectAll('text').data(yt).join('text').attr('x', m.l - 6).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').attr('fill', 'var(--color-fg-muted)').attr('font-size', 11).text((v) => MS.compact(v));
    const xt = [1, 3, 10, 20, 30, 40].filter((v) => v <= x.domain()[1]);
    svg.append('g').selectAll('text').data(xt).join('text').attr('x', x).attr('y', H - m.b + 16).attr('text-anchor', 'middle').attr('fill', 'var(--color-fg-muted)').attr('font-size', 11).text((v) => '#' + v);
    svg.append('text').attr('x', W - m.r).attr('y', H - 2).attr('text-anchor', 'end').attr('fill', 'var(--color-fg-muted)').attr('font-size', 11).text('Average position, 28 days →');
    svg.append('text').attr('x', m.l).attr('y', 10).attr('fill', 'var(--color-fg-muted)').attr('font-size', 11).text('Impressions ↑');
    const t = MS.tip(box);
    svg.append('g').selectAll('circle').data(rows.slice().sort((a, b) => b.est_extra_clicks - a.est_extra_clicks)).join('circle')
      .attr('cx', (r) => x(r.pos_28d)).attr('cy', (r) => y(Math.max(300, r.impr_28d))).attr('r', (r) => rad(r.est_extra_clicks))
      .attr('fill', (r) => MS.bucketColor[r.bucket] || dash.colors[5]).attr('fill-opacity', (r) => (MS.state.aaPick && MS.state.aaPick !== r.page ? 0.15 : 0.7))
      .attr('stroke', (r) => (MS.state.aaPick === r.page ? 'var(--color-fg)' : 'var(--color-panel)')).attr('stroke-width', 1)
      .style('cursor', 'pointer')
      .on('mousemove', (ev, r) => {
        t.hidden = false;
        t.replaceChildren(MS.el('div', 'ms-tip-d', r.bucket + ' · ' + r.priority), MS.el('div', null, r.title),
          MS.el('div', 'ms-tip-d', '#' + r.pos_28d + ' · ' + MS.n(r.impr_28d) + ' impr. · +' + MS.n(r.est_extra_clicks) + ' clicks if fixed'));
        const [px, py] = d3.pointer(ev, box); MS.placeTip(t, box, px, py);
      })
      .on('mouseleave', () => { t.hidden = true; })
      .on('click', (ev, r) => { MS.state.aaPick = MS.state.aaPick === r.page ? null : r.page; MS.redraw(); });
    box.querySelector('svg')?.remove();
    box.prepend(svg.node());
  };

  // Compact funnel: four steps in a row, the share lost between steps in small type, biggest loss in red.
  const drawFunnel = () => {
    const box = document.getElementById('funnel');
    const d = dash.data('qa_funnel');
    if (d.status !== 'ok') { if (d.status === 'error') MS.failed(box); else box.replaceChildren(MS.el('div', 'dash-skeleton', '')); return; }
    const L = MS.state.lang || 'All';
    const steps = d.data.filter((r) => r.language === L).sort((a, b) => a.step - b.step);
    if (!steps.length) { box.replaceChildren(MS.el('p', 'ms-note', 'No curated pages in this language.')); return; }
    const top = steps[0].value || 1;
    const partial = steps[1].base < steps[0].value;
    const chain = steps.filter((s, i) => !(i === 1 && partial));
    const drops = new Map();
    chain.slice(1).forEach((s, i) => drops.set(s.stage, { from: chain[i], drop: chain[i].value - s.value }));
    const worst = [...drops].sort((a, b) => b[1].drop - a[1].drop)[0]?.[0];
    const out = [];
    steps.forEach((s, i) => {
      const dropInfo = drops.get(s.stage);
      if (dropInfo) {
        const share = dropInfo.from.value ? dropInfo.drop / dropInfo.from.value : 0;
        const dl = MS.el('div', 'ms-fdrop' + (s.stage === worst ? ' ms-worst' : ''), '→ −' + d3.format('.0%')(share));
        dl.title = MS.n(dropInfo.drop) + ' drop out between ' + dropInfo.from.stage.toLowerCase() + ' and ' + s.stage.toLowerCase();
        out.push(dl);
      }
      const step = MS.el('div', 'ms-fstep');
      const bar = MS.el('div', 'ms-fbar');
      const fill = MS.el('i');
      fill.style.width = Math.max(1, (i === 1 && partial ? (s.base ? s.value / s.base : 0) : s.value / top) * 100) + '%';
      if (s.stage === worst) fill.style.background = 'var(--cds-chart-status-critical)';
      bar.append(fill);
      step.append(MS.el('b', null, MS.n(s.value)), MS.el('span', null, s.stage + (i === 1 && partial ? ' (of ' + MS.n(s.base) + ' checked)' : '')), bar);
      out.push(step);
    });
    box.replaceChildren(...out);
  };

  const apPrio = document.getElementById('ap-prio'), apQ = document.getElementById('ap-q'), apPick = document.getElementById('ap-pick');
  apPrio.addEventListener('change', () => { MS.state.apPrio = apPrio.value; MS.state.apPick = null; MS.redraw(); });
  apQ.addEventListener('input', () => MS.redraw());
  apPick.addEventListener('click', () => { MS.state.apPick = null; MS.redraw(); });
  MS.apColor = { 'Create web version': dash.colors[2], 'Fix the card': dash.colors[0], 'Do SEO': dash.colors[1], 'Check the drop': dash.colors[3] };
  document.querySelectorAll('[data-ap-go]').forEach((b) => b.addEventListener('click', () => {
    Object.assign(MS.state, { apAction: b.dataset.apGo, apPrio: '', apPick: null }); MS.state.more.ap = false; MS.redraw(); document.getElementById('app-actions').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  const drawAppOpps = (rows, med) => {
    const box = document.getElementById('chart-app-opps');
    box.classList.remove('dash-skeleton');
    const pts = rows.filter((r) => r.impr_4w > 0);
    const W = Math.max(300, box.clientWidth), H = 320, m = { t: 22, r: 16, b: 34, l: 52 };
    const x = d3.scaleLog([100, Math.max(10000, d3.max(pts, (r) => r.impr_4w) || 10000)], [m.l, W - m.r]).clamp(true);
    const yMax = Math.max(2, Math.min(10, d3.max(pts, (r) => r.ctr_4w) || 2));
    const y = d3.scaleLinear([0, yMax], [H - m.b, m.t]).clamp(true);
    const rad = d3.scaleSqrt([0, d3.max(pts, (r) => r.views_4w) || 1], [2.5, 16]);
    const svg = d3.create('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'App articles by card impressions and CTR');
    if (med) {
      svg.append('rect').attr('x', x(2000)).attr('width', Math.max(0, W - m.r - x(2000))).attr('y', y(med / 2)).attr('height', Math.max(0, H - m.b - y(med / 2))).attr('fill', 'var(--cds-chart-reference)').attr('opacity', 0.12);
      svg.append('text').attr('x', W - m.r - 4).attr('y', y(med / 2) - 4).attr('text-anchor', 'end').attr('fill', 'var(--color-fg-muted)').attr('font-size', 11).text('Fix-the-card zone');
      svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(med)).attr('y2', y(med)).attr('stroke', 'var(--cds-chart-axis)').attr('stroke-dasharray', '3 3');
      svg.append('text').attr('x', m.l + 4).attr('y', y(med) - 4).attr('fill', 'var(--color-fg-muted)').attr('font-size', 10).text('Typical CTR ' + med.toFixed(2) + '%');
    }
    const yt = y.ticks(4);
    svg.append('g').selectAll('line').data(yt).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
    svg.append('g').selectAll('text').data(yt).join('text').attr('x', m.l - 6).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').attr('fill', 'var(--color-fg-muted)').attr('font-size', 11).text((v) => v + '%');
    const xt = [100, 300, 1000, 3000, 10000, 30000, 100000, 300000].filter((v) => v >= x.domain()[0] && v <= x.domain()[1]);
    svg.append('g').selectAll('text').data(xt).join('text').attr('x', x).attr('y', H - m.b + 16).attr('text-anchor', 'middle').attr('fill', 'var(--color-fg-muted)').attr('font-size', 11).text((v) => MS.compact(v));
    svg.append('text').attr('x', W - m.r).attr('y', H - 2).attr('text-anchor', 'end').attr('fill', 'var(--color-fg-muted)').attr('font-size', 11).text('Card impressions, 4 weeks →');
    svg.append('text').attr('x', m.l).attr('y', 10).attr('fill', 'var(--color-fg-muted)').attr('font-size', 11).text('Card CTR ↑');
    const t = MS.tip(box);
    svg.append('g').selectAll('circle').data(pts.slice().sort((a, b) => b.views_4w - a.views_4w)).join('circle')
      .attr('cx', (r) => x(Math.max(100, r.impr_4w))).attr('cy', (r) => y(r.ctr_4w || 0)).attr('r', (r) => rad(r.views_4w))
      .attr('fill', (r) => MS.apColor[r.action]).attr('fill-opacity', (r) => (MS.state.apPick && MS.state.apPick !== r.key ? 0.15 : 0.7))
      .attr('stroke', (r) => (MS.state.apPick === r.key ? 'var(--color-fg)' : 'var(--color-panel)')).attr('stroke-width', 1).style('cursor', 'pointer')
      .on('mousemove', (ev, r) => {
        t.hidden = false;
        t.replaceChildren(MS.el('div', 'ms-tip-d', r.action + ' · ' + r.priority + ' · ' + (r.kind === 'Web article' ? 'Web' : 'App only')), MS.el('div', null, r.title),
          MS.el('div', 'ms-tip-d', MS.n(r.impr_4w) + ' card impr. · ' + (r.ctr_4w ?? 0) + '% CTR · ' + MS.n(r.views_4w) + ' views'));
        const [px, py] = d3.pointer(ev, box); MS.placeTip(t, box, px, py);
      })
      .on('mouseleave', () => { t.hidden = true; })
      .on('click', (ev, r) => { MS.state.apPick = MS.state.apPick === r.key ? null : r.key; MS.redraw(); });
    box.querySelector('svg')?.remove();
    box.prepend(svg.node());
  };
  const drawWeekApp = () => {
    const d = dash.data('app_actions');
    for (const el of document.querySelectorAll('[data-ap-count]')) {
      if (d.status !== 'ok') { if (d.status === 'error') { el.classList.remove('dash-skeleton'); el.textContent = '—'; } continue; }
      el.classList.remove('dash-skeleton');
      el.textContent = MS.n(MS.byLang(d.data).filter((r) => r.action === el.dataset.apCount).length);
    }
    const tb = document.getElementById('ap-table');
    if (!MS.tableState(tb, 'app_actions')) { if (d.status === 'error') MS.failed(document.getElementById('chart-app-opps')); return; }
    const all = MS.byLang(d.data);
    const counts = d3.rollup(all, (v) => v.length, (r) => r.action);
    MS.chips(document.getElementById('ap-chips'), [['', 'All ideas', all.length], ...['Create web version', 'Fix the card', 'Do SEO', 'Check the drop'].filter((k) => counts.get(k)).map((k) => [k, k, counts.get(k)])],
      MS.state.apAction || '', (v) => { MS.state.apAction = v; MS.state.apPick = null; MS.redraw(); }, MS.apColor);
    apPrio.value = MS.state.apPrio || '';
    const q = apQ.value.trim().toLowerCase();
    const filtered = all.filter((r) => (!MS.state.apAction || r.action === MS.state.apAction) && (!MS.state.apPrio || r.priority === MS.state.apPrio) && (!q || r.title.toLowerCase().includes(q)));
    const withImpr = d.data.filter((r) => r.impr_4w >= 2000 && r.ctr_4w != null).map((r) => r.ctr_4w).sort((a, b) => a - b);
    drawAppOpps(filtered, withImpr.length ? withImpr[withImpr.length >> 1] : null);
    const picked = MS.state.apPick ? filtered.filter((r) => r.key === MS.state.apPick) : filtered;
    apPick.hidden = !MS.state.apPick;
    apPick.textContent = MS.state.apPick && picked[0] ? 'Showing one article: ' + picked[0].title.slice(0, 40) + ' ×' : '';
    const shown = MS.limit('ap', picked);
    MS.table(tb, shown, [
      { render: (r) => MS.pill(r.priority) },
      { cls: 'ms-wide', render: (r) => { const w = MS.link(r.title, r.link, r.kind === 'App-only article' ? 'App only' : r.language !== 'English' ? r.language : ''); return w; } },
      { render: (r) => MS.chip(r.action) },
      { cls: 'ms-wide', render: (r) => {
        const c = MS.fixCell(r.fix, r.why);
        if (r.similar_url) { const a = MS.el('a', 'ms-pstat', 'Open the similar web article'); a.href = r.similar_url; a.target = '_blank'; a.rel = 'noopener'; c.append(a); }
        if (r.caution && r.action !== 'Create web version') c.append(MS.el('span', 'ms-caution', '⚠ ' + r.caution));
        return c;
      } },
      { cls: 'num', render: (r) => MS.n(r.views_4w) },
      { cls: 'num', render: (r) => MS.n(r.impr_4w) },
      { cls: 'num', render: (r) => (r.ctr_4w == null ? '—' : r.ctr_4w + '%') },
    ], 'key');
    MS.moreBtn('ap', picked.length);
    document.getElementById('ap-count').textContent = 'Showing ' + shown.length + ' of ' + picked.length + (picked.length !== all.length ? ' matching (' + all.length + ' in all)' : '');
  };

  const nmPrio = document.getElementById('nm-prio'), nmQ = document.getElementById('nm-q');
  nmPrio.addEventListener('change', () => { MS.state.nmPrio = nmPrio.value; MS.redraw(); });
  nmQ.addEventListener('input', () => MS.redraw());
  document.getElementById('go-nometa').addEventListener('click', () => {
    MS.state.nmPrio = ''; MS.state.more.nm = false; MS.show('merge'); document.getElementById('nometa-actions').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  const drawNometa = MS.drawNometa = () => {
    const d = dash.data('nometa_articles');
    const big = document.getElementById('nometa-count');
    if (d.status === 'ok') { big.classList.remove('dash-skeleton'); big.textContent = MS.n(MS.byLang(d.data).length); }
    else if (d.status === 'error') { big.classList.remove('dash-skeleton'); big.textContent = '—'; }
    const tb = document.getElementById('nm-table');
    if (!MS.tableState(tb, 'nometa_articles')) return;
    const all = MS.byLang(d.data);
    nmPrio.value = MS.state.nmPrio || '';
    const q = nmQ.value.trim().toLowerCase();
    const rows = all.filter((r) => (!MS.state.nmPrio || r.priority === MS.state.nmPrio) && (!q || r.title.toLowerCase().includes(q)));
    const shown = MS.limit('nm', rows);
    MS.table(tb, shown, [
      { render: (r) => MS.pill(r.priority) },
      { cls: 'ms-wide', render: (r) => { const w = MS.link(r.title, r.link, r.language !== 'English' ? r.language : ''); if (r.caution) w.append(MS.el('span', 'ms-caution', '⚠ ' + r.caution)); return w; } },
      { cls: 'num', render: (r) => MS.n(r.impr_28d) }, { cls: 'num', render: (r) => MS.n(r.clicks_28d) },
      { cls: 'num', render: (r) => (r.app_views_4w == null ? '—' : MS.n(r.app_views_4w)) },
      { cls: 'ms-wide', f: 'suggested' },
    ], 'id');
    MS.moreBtn('nm', rows.length);
    const seen = all.filter((r) => r.impr_28d > 0);
    document.getElementById('nm-count').textContent = 'Showing ' + shown.length + ' of ' + rows.length + ' · ' + seen.length + ' of ' + all.length
      + ' already get Google impressions (' + MS.n(d3.sum(seen, (r) => r.impr_28d)) + ' in 28 days)';
  };

  MS.drawWeek = () => {
    if (MS.state.channel === 'app') return drawWeekApp();
    drawNometa();
    // Articles: chips, chart, table
    const aaT = document.getElementById('aa-table');
    if (MS.tableState(aaT, 'article_actions')) {
      const all = MS.byLang(dash.data('article_actions').data);
      const counts = d3.rollup(all, (v) => v.length, (r) => r.bucket);
      MS.chips(document.getElementById('aa-chips'), [['', 'All fixes', all.length], ...[...counts].sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, k, n])],
        MS.state.aaBucket, (v) => { MS.state.aaBucket = v; MS.state.aaPick = null; MS.redraw(); }, MS.bucketColor);
      aaPrio.value = MS.state.aaPrio;
      const q = aaQ.value.trim().toLowerCase();
      const filtered = all.filter((r) => (!MS.state.aaBucket || r.bucket === MS.state.aaBucket) && (!MS.state.aaPrio || r.priority === MS.state.aaPrio)
        && (!q || (r.title + ' ' + (r.top_query || '')).toLowerCase().includes(q)));
      drawOpps(filtered);
      const picked = MS.state.aaPick ? filtered.filter((r) => r.page === MS.state.aaPick) : filtered;
      aaPick.hidden = !MS.state.aaPick;
      aaPick.textContent = MS.state.aaPick && picked[0] ? 'Showing one article: ' + picked[0].title.slice(0, 40) + ' ×' : '';
      const shown = MS.limit('aa', picked);
      const max = d3.max(filtered, (r) => r.est_extra_clicks) || 1;
      MS.table(aaT, shown, [
        { render: (r) => MS.pill(r.priority) },
        { cls: 'ms-wide', render: (r) => MS.link(r.title, r.link, r.top_query ? 'Top search: ' + r.top_query : '') },
        { render: (r) => MS.chip(r.bucket) },
        { cls: 'ms-wide', render: (r) => MS.fixCell(r.fix, r.why) },
        { cls: 'num', render: (r) => MS.n(r.impr_28d) },
        { cls: 'num', f: 'pos_28d' },
        { cls: 'num', render: (r) => MS.bar(r.est_extra_clicks, max, MS.n(r.est_extra_clicks)) },
      ], 'page');
      MS.moreBtn('aa', picked.length);
      document.getElementById('aa-count').textContent = 'Showing ' + shown.length + ' of ' + picked.length + (picked.length !== all.length ? ' matching (' + all.length + ' in all)' : '');
    } else if (dash.data('article_actions').status === 'error') MS.failed(document.getElementById('chart-opps'));

    // Q&A: funnel, chips, table
    drawFunnel();
    const caT = document.getElementById('ca-table');
    if (MS.tableState(caT, 'qa_actions')) {
      const all = MS.byLang(dash.data('qa_actions').data);
      const counts = d3.rollup(all, (v) => v.length, (r) => r.bucket);
      MS.chips(document.getElementById('ca-chips'), [['', 'All', all.length], ...[...counts].sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, k, n])],
        MS.state.caBucket, (v) => { MS.state.caBucket = v; MS.redraw(); });
      const q = caQ.value.trim().toLowerCase();
      const filtered = all.filter((r) => (!MS.state.caBucket || r.bucket === MS.state.caBucket) && (!q || (r.title + ' ' + (r.target_keyword || '')).toLowerCase().includes(q)));
      const shown = MS.limit('ca', filtered);
      MS.table(caT, shown, [
        { render: (r) => MS.pill(r.priority) },
        { cls: 'ms-wide', render: (r) => MS.link(r.title, r.link, r.target_keyword ? 'Target: ' + r.target_keyword : r.curated ? '' : 'Not a curated page') },
        { render: (r) => MS.chip(r.bucket) },
        { cls: 'ms-wide', render: (r) => MS.fixCell(r.fix, r.why) },
        { cls: 'num', render: (r) => MS.n(r.impr_28d) },
        { cls: 'num', f: 'pos_28d' },
        { cls: 'num', f: 'age_days' },
      ], 'page');
      MS.moreBtn('ca', filtered.length);
      document.getElementById('ca-count').textContent = 'Showing ' + shown.length + ' of ' + filtered.length;
    }

    // Trending searches
    const kaT = document.getElementById('ka-table');
    if (MS.tableState(kaT, 'keyword_actions')) {
      const all = dash.data('keyword_actions').data;
      const counts = d3.rollup(all, (v) => v.length, (r) => r.action);
      MS.chips(document.getElementById('ka-chips'), [['', 'All', all.length], ...[...counts].sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, k, n])],
        MS.state.kaAction, (v) => { MS.state.kaAction = v; MS.redraw(); });
      const filtered = all.filter((r) => !MS.state.kaAction || r.action === MS.state.kaAction);
      const shown = MS.limit('ka', filtered);
      MS.table(kaT, shown, [
        { render: (r) => { const s = MS.el('span', null, r.query); if (r.variants) s.append(MS.el('span', 'ms-sub', 'Also: ' + r.variants)); return s; } },
        { render: (r) => MS.chip(r.action) },
        { cls: 'ms-wide', render: (r) => { const s = MS.el('span', null, r.fix); if (r.link) { const pth = MS.path(r.link); const a = MS.el('a', 'ms-sub'); a.href = r.link; a.target = '_blank'; a.rel = 'noopener'; a.append(pth || 'Open page'); s.append(a); } return s; } },
        { cls: 'num', render: (r) => MS.n(r.impr_last_week) },
        { cls: 'num', render: (r) => { const s = MS.el('span'); MS.fmtChange(s, r.growth_pct); return s; } },
        { cls: 'num', f: 'pos_last_week' },
      ], 'query');
      MS.moreBtn('ka', filtered.length);
      document.getElementById('ka-count').textContent = 'Showing ' + shown.length + ' of ' + filtered.length;
    }
  };

})();
