(() => {

  // ---------- Last week review, Overview, Keywords, Indexing ----------
  // Compact scorecard: one row per page group, one column per measure, change under each value.
  const kpiTiles = (box, segs, days = 7) => {
    const d = dash.data('kpis');
    if (d.status !== 'ok') { if (d.status === 'error') MS.failed(box); else box.replaceChildren(MS.el('div', 'dash-skeleton', '')); return; }
    const metrics = [['clicks', 'Clicks'], ['impressions', 'Impressions'], ['ctr', 'CTR'], ['position', 'Avg. position']];
    const table = MS.el('table', 'ms-score');
    const hr = document.createElement('tr');
    hr.append(MS.el('th', null, ''), ...metrics.map(([, l]) => MS.el('th', 'num', l)));
    const thead = document.createElement('thead'); thead.append(hr);
    const tbody = document.createElement('tbody');
    for (const seg of segs) {
      const tr = document.createElement('tr');
      const th = MS.el('th', null, seg); th.scope = 'row'; tr.append(th);
      for (const [m] of metrics) {
        const r = d.data.find((x) => x.key === seg + '|' + m + '|' + days);
        const td = MS.el('td', 'num');
        const v = !r || r.value == null ? '—' : m === 'ctr' ? r.value.toFixed(2) + '%' : m === 'position' ? r.value.toFixed(1) : MS.compact(Math.round(r.value));
        const delta = MS.el('span', 'd');
        if (r && m === 'position' && r.change_abs != null) {
          const ch = r.change_abs;
          delta.classList.add(Math.abs(ch) < 0.05 ? 'ms-flat' : ch < 0 ? 'ms-good' : 'ms-bad');
          delta.textContent = Math.abs(ch) < 0.05 ? 'no change' : (ch < 0 ? '▲ ' : '▼ ') + Math.abs(ch).toFixed(1) + (ch < 0 ? ' better' : ' worse');
        } else if (r) MS.fmtChange(delta, r.change_pct, true);
        td.append(MS.el('span', 'v', v), delta);
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.append(thead, tbody);
    box.replaceChildren(table);
  };

  const weeklyBars = (box, type, source = 'content_weekly') => {
    const d = dash.data(source);
    if (d.status !== 'ok') { if (d.status === 'error') MS.failed(box); return; }
    box.classList.remove('dash-skeleton');
    const pick = MS.state.lwWeek;
    const rows = d.data.filter((r) => r.content_type === type && (!pick || r.week <= pick)).map((r) => ({ ...r, created: Number(r.created), updated: Number(r.updated) })).sort((a, b) => d3.ascending(a.week, b.week)).slice(-8);
    const W = Math.max(280, box.clientWidth), H = 200, m = { t: 8, r: 8, b: 24, l: 34 };
    const x0 = d3.scaleBand(rows.map((r) => r.week), [m.l, W - m.r]).padding(0.25);
    const x1 = d3.scaleBand(['created', 'updated'], [0, x0.bandwidth()]).padding(0.1);
    const y = d3.scaleLinear([0, d3.max(rows, (r) => Math.max(r.created, r.updated)) || 1], [H - m.b, m.t]).nice();
    const svg = d3.create('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    svg.append('g').selectAll('line').data(y.ticks(4)).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
    svg.append('g').selectAll('text').data(y.ticks(4)).join('text').attr('x', m.l - 6).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').attr('fill', 'var(--color-fg-muted)').attr('font-size', 11).text(d3.format(','));
    const fmtW = d3.utcFormat('%b %-d');
    svg.append('g').selectAll('text').data(rows).join('text').attr('x', (r) => x0(r.week) + x0.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle')
      .attr('fill', 'var(--color-fg-muted)').attr('font-size', 11).text((r, i) => (W < 420 && i % 2) ? '' : fmtW(new Date(r.week)));
    const t = MS.tip(box);
    for (const [k, c] of [['created', dash.colors[0]], ['updated', dash.colors[1]]]) {
      svg.append('g').selectAll('rect').data(rows).join('rect').attr('x', (r) => x0(r.week) + x1(k)).attr('width', x1.bandwidth())
        .attr('y', (r) => y(r[k])).attr('height', (r) => Math.max(0, y(0) - y(r[k]))).attr('rx', 3).attr('fill', c).attr('fill-opacity', (r) => (!pick || r.week === pick ? 1 : 0.45))
        .on('mousemove', (ev, r) => {
          t.hidden = false; t.replaceChildren(MS.el('div', 'ms-tip-d', 'Week of ' + fmtW(new Date(r.week))), MS.el('div', null, 'Created ' + r.created + ' · Updated ' + r.updated));
          const [px, py] = d3.pointer(ev, box); MS.placeTip(t, box, px, py);
        }).on('mouseleave', () => { t.hidden = true; });
    }
    box.querySelector('svg')?.remove();
    box.prepend(svg.node());
  };

  // Date range for the Overview: a preset (days back from the latest day) or From/To dates.
  const ovFrom = document.getElementById('ov-from'), ovTo = document.getElementById('ov-to');
  const dayShift = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
  const dayCount = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;
  const fmtDay = (d) => d3.utcFormat('%b %-d, %Y')(new Date(d));
  MS.trendBounds = (id = 'daily_trend') => {
    const d = dash.data(id);
    if (d.status !== 'ok' || !d.data.length) return null;
    const dates = d.data.map((r) => r.date);
    return { first: d3.min(dates), last: d3.max(dates) };
  };
  MS.ovSource = () => (MS.state.channel === 'app' ? 'app_daily' : 'daily_trend');
  MS.range = (id = 'daily_trend') => {
    const b = MS.trendBounds(id);
    if (!b) return null;
    const p = MS.state.preset ?? '7';
    if (p === 'custom' && MS.state.from && MS.state.to) {
      // Picked dates outside this source's data are clamped to it (the app keeps fewer days than Google).
      const f = MS.state.from < b.first ? b.first : MS.state.from, t = MS.state.to > b.last ? b.last : MS.state.to;
      if (f <= t) return { from: f, to: t, bounds: b };
    }
    const to = b.last, from = p === 'all' ? b.first : (dayShift(to, 1 - +p) < b.first ? b.first : dayShift(to, 1 - +p));
    return { from, to, bounds: b };
  };
  document.querySelectorAll('#ov-presets [data-preset]').forEach((btn) => btn.addEventListener('click', () => { MS.state.preset = btn.dataset.preset; MS.redraw(); }));
  const takeDates = () => {
    const b = MS.trendBounds(MS.ovSource());
    if (!b || !ovFrom.value || !ovTo.value || !ovFrom.validity.valid || !ovTo.validity.valid) return;
    let f = ovFrom.value < b.first ? b.first : ovFrom.value, t = ovTo.value > b.last ? b.last : ovTo.value;
    if (f > t) [f, t] = [t, f];
    Object.assign(MS.state, { preset: 'custom', from: f, to: t });
    MS.redraw();
  };
  ovFrom.addEventListener('change', takeDates);
  ovTo.addEventListener('change', takeDates);
  // Sum one page group over a date range; null when the range has days with no data.
  MS.rangeSum = (rows, seg, from, to) => {
    const rs = rows.filter((r) => r.segment === seg && r.date >= from && r.date <= to);
    if (rs.length < dayCount(from, to)) return null;
    const c = d3.sum(rs, (r) => r.clicks), i = d3.sum(rs, (r) => r.impressions);
    const w = d3.sum(rs, (r) => (r.position || 0) * r.impressions);
    return { clicks: c, impressions: i, ctr: i ? (c / i) * 100 : null, position: i ? w / i : null };
  };
  const rangeScore = (box, segs, rng, textId = 'ov-range-text', note = '. Position: lower is better. All languages. Data from ') => {
    const d = dash.data('daily_trend');
    if (d.status !== 'ok' || !rng) { if (d.status === 'error') MS.failed(box); else box.replaceChildren(MS.el('div', 'dash-skeleton', '')); return; }
    const n = dayCount(rng.from, rng.to), pFrom = dayShift(rng.from, -n), pTo = dayShift(rng.from, -1);
    const metrics = [['clicks', 'Clicks'], ['impressions', 'Impressions'], ['ctr', 'CTR'], ['position', 'Avg. position']];
    const table = MS.el('table', 'ms-score');
    const hr = document.createElement('tr');
    hr.append(MS.el('th', null, ''), ...metrics.map(([, l]) => MS.el('th', 'num', l)));
    const thead = document.createElement('thead'); thead.append(hr);
    const tbody = document.createElement('tbody');
    for (const seg of segs) {
      const cur = MS.rangeSum(d.data, seg, rng.from, rng.to), prev = MS.rangeSum(d.data, seg, pFrom, pTo);
      const tr = document.createElement('tr');
      const th = MS.el('th', null, seg); th.scope = 'row'; tr.append(th);
      for (const [m] of metrics) {
        const td = MS.el('td', 'num');
        const v = cur ? cur[m] : null;
        const text = v == null ? '—' : m === 'ctr' ? v.toFixed(2) + '%' : m === 'position' ? v.toFixed(1) : MS.compact(Math.round(v));
        const delta = MS.el('span', 'd');
        const pv = prev ? prev[m] : null;
        if (v == null || pv == null) { delta.textContent = cur ? 'no earlier data' : 'no data'; delta.classList.add('ms-flat'); }
        else if (m === 'position') {
          const ch = v - pv;
          delta.classList.add(Math.abs(ch) < 0.05 ? 'ms-flat' : ch < 0 ? 'ms-good' : 'ms-bad');
          delta.textContent = Math.abs(ch) < 0.05 ? 'no change' : (ch < 0 ? '▲ ' : '▼ ') + Math.abs(ch).toFixed(1) + (ch < 0 ? ' better' : ' worse');
        } else MS.fmtChange(delta, pv ? (v - pv) / pv : null, true);
        td.append(MS.el('span', 'v', text), delta);
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.append(thead, tbody);
    box.replaceChildren(table);
    document.getElementById(textId).textContent = fmtDay(rng.from) + ' – ' + fmtDay(rng.to) + ' (' + MS.n(n) + ' days), against ' + fmtDay(pFrom) + ' – ' + fmtDay(pTo)
      + note + fmtDay(rng.bounds.first) + '.';
  };
  MS.rangeScore = rangeScore;
  MS.appRangeSum = (rows, seg, from, to) => {
    const rs = rows.filter((r) => r.segment === seg && r.date >= from && r.date <= to);
    if (rs.length < dayCount(from, to)) return null;
    const i = d3.sum(rs, (r) => Number(r.impressions)), c = d3.sum(rs, (r) => Number(r.clicks)), v = d3.sum(rs, (r) => Number(r.views));
    return { impressions: i, clicks: c, ctr: i ? (c / i) * 100 : null, views: v };
  };
  MS.appRangeScore = (box, rng, textId, note) => {
    const d = dash.data('app_daily');
    if (d.status !== 'ok' || !rng) { if (d.status === 'error') MS.failed(box); else box.replaceChildren(MS.el('div', 'dash-skeleton', '')); return; }
    const n = dayCount(rng.from, rng.to), pFrom = dayShift(rng.from, -n), pTo = dayShift(rng.from, -1);
    const metrics = [['impressions', 'Impressions'], ['clicks', 'Clicks'], ['ctr', 'CTR'], ['views', 'Views']];
    const table = MS.el('table', 'ms-score');
    const hr = document.createElement('tr');
    hr.append(MS.el('th', null, ''), ...metrics.map(([, l]) => MS.el('th', 'num', l)));
    const thead = document.createElement('thead'); thead.append(hr);
    const tbody = document.createElement('tbody');
    for (const seg of ['All app articles', 'Web articles in app', 'App-only articles']) {
      const cur = MS.appRangeSum(d.data, seg, rng.from, rng.to), prev = MS.appRangeSum(d.data, seg, pFrom, pTo);
      const tr = document.createElement('tr');
      const th = MS.el('th', null, seg); th.scope = 'row'; tr.append(th);
      for (const [m] of metrics) {
        const td = MS.el('td', 'num');
        const v = cur ? cur[m] : null, pv = prev ? prev[m] : null;
        const delta = MS.el('span', 'd');
        if (v == null || pv == null) { delta.textContent = cur ? 'no earlier data' : 'no data'; delta.classList.add('ms-flat'); }
        else MS.fmtChange(delta, pv ? (v - pv) / pv : null, true);
        td.append(MS.el('span', 'v', v == null ? '—' : m === 'ctr' ? v.toFixed(2) + '%' : MS.compact(Math.round(v))), delta);
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.append(thead, tbody);
    box.replaceChildren(table);
    document.getElementById(textId).textContent = fmtDay(rng.from) + ' – ' + fmtDay(rng.to) + ' (' + MS.n(n) + ' days), against ' + fmtDay(pFrom) + ' – ' + fmtDay(pTo)
      + note + fmtDay(rng.bounds.first) + '.';
  };
  const appSeg = document.getElementById('ov-app-seg'), appMet = document.getElementById('ov-app-metric');
  [appSeg, appMet].forEach((el) => el.addEventListener('change', () => MS.redraw()));
  const appDailyChart = () => {
    const box = document.getElementById('chart-app-daily');
    const d = dash.data('app_daily');
    if (d.status !== 'ok') { if (d.status === 'error') MS.failed(box); return; }
    box.classList.remove('dash-skeleton');
    const metric = appMet.value, seg = appSeg.value;
    const rng = MS.range('app_daily');
    const viewFrom = rng ? (dayCount(rng.from, rng.to) < 28 ? dayShift(rng.to, -27) : rng.from) : null;
    const rows = d.data.filter((r) => r.segment === seg && (!rng || (r.date >= viewFrom && r.date <= rng.to)))
      .map((r) => { const i = Number(r.impressions), c = Number(r.clicks); return { date: r.date, d: new Date(r.date), impressions: i, clicks: c, views: Number(r.views), ctr: i ? Math.round((c / i) * 10000) / 100 : 0 }; })
      .sort((a, b) => a.d - b.d);
    if (!rows.length) { box.querySelector('svg')?.remove(); return; }
    const W = Math.max(280, box.clientWidth), H = 290, m = { t: 12, r: 16, b: 66, l: 52 };
    const x = d3.scaleUtc(d3.extent(rows, (r) => r.d), [m.l, W - m.r]);
    const yB = H - m.b;
    const y = d3.scaleLinear([0, d3.max(rows, (r) => r[metric]) || 1], [yB, m.t]).nice();
    const fy = metric === 'ctr' ? (v) => v + '%' : (v) => MS.compact(v);
    const svg = d3.create('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    svg.append('g').selectAll('line').data(y.ticks(4)).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
    svg.append('g').selectAll('text').data(y.ticks(4)).join('text').attr('x', m.l - 6).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').attr('fill', 'var(--color-fg-muted)').attr('font-size', 11).text(fy);
    svg.append('g').selectAll('text').data(x.ticks(W < 500 ? 3 : 6)).join('text').attr('x', x).attr('y', H - 4).attr('text-anchor', 'middle').attr('fill', 'var(--color-fg-muted)').attr('font-size', 11).text(d3.utcFormat('%b %-d'));
    const g = svg.append('defs').append('linearGradient').attr('id', 'ms-grad-app').attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 1);
    [[0, .26], [.25, .16], [.5, .08], [.75, .03], [1, 0]].forEach(([o, a]) => g.append('stop').attr('offset', o).attr('style', `stop-color:${dash.colors[0]};stop-opacity:${a}`));
    svg.append('path').attr('d', d3.area().x((r) => x(r.d)).y0(yB).y1((r) => y(r[metric]))(rows)).attr('fill', 'url(#ms-grad-app)');
    svg.append('path').attr('d', d3.line().x((r) => x(r.d)).y((r) => y(r[metric]))(rows)).attr('fill', 'none').attr('stroke', dash.colors[0]).attr('stroke-width', 2).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round');
    const cd = dash.data('app_content_daily');
    const pub = new Map();
    if (cd.status === 'ok') {
      const types = seg === 'Web articles in app' ? ['Web article'] : seg === 'App-only articles' ? ['App-only article'] : ['Web article', 'App-only article'];
      for (const r of cd.data) {
        if (!types.includes(r.content_type)) continue;
        const day = String(r.day).slice(0, 10), p = pub.get(day) || { created: 0, updated: 0 };
        p.created += Number(r.created); p.updated += Number(r.updated); pub.set(day, p);
      }
    }
    const [dx0, dx1] = x.domain();
    const pubRows = [...pub].map(([day, v]) => ({ day, d: new Date(day), ...v })).filter((r) => r.d >= dx0 && r.d <= dx1);
    const pr = d3.scaleSqrt([0, d3.max(pubRows, (r) => Math.max(r.created, r.updated)) || 1], [0, 7]);
    const laneC = yB + 18, laneU = yB + 36;
    svg.append('text').attr('x', m.l - 6).attr('y', laneC).attr('dy', '0.32em').attr('text-anchor', 'end').attr('fill', 'var(--color-fg-muted)').attr('font-size', 10).text('New');
    svg.append('text').attr('x', m.l - 6).attr('y', laneU).attr('dy', '0.32em').attr('text-anchor', 'end').attr('fill', 'var(--color-fg-muted)').attr('font-size', 10).text('Edited');
    svg.append('g').selectAll('circle').data(pubRows.filter((r) => r.created)).join('circle').attr('cx', (r) => x(r.d)).attr('cy', laneC).attr('r', (r) => Math.max(1.5, pr(r.created))).attr('fill', dash.colors[2]).attr('fill-opacity', 0.8);
    svg.append('g').selectAll('circle').data(pubRows.filter((r) => r.updated)).join('circle').attr('cx', (r) => x(r.d)).attr('cy', laneU).attr('r', (r) => Math.max(1.5, pr(r.updated))).attr('fill', dash.colors[1]).attr('fill-opacity', 0.8);
    if (cd.status === 'error') svg.append('text').attr('x', m.l).attr('y', laneC).attr('dy', '0.32em').attr('fill', 'var(--color-fg-muted)').attr('font-size', 10).text('Publishing data failed to load');
    if (rng && viewFrom < rng.from) {
      const from = new Date(rng.from);
      svg.insert('rect', ':first-child').attr('x', x(from)).attr('width', Math.max(0, x(new Date(rng.to)) - x(from))).attr('y', m.t).attr('height', yB - m.t)
        .attr('fill', 'var(--cds-chart-reference)').attr('opacity', 0.1);
      svg.append('text').attr('x', x(from) + 4).attr('y', m.t + 10).attr('fill', 'var(--color-fg-muted)').attr('font-size', 10).text('Selected');
    }
    const dot = svg.append('circle').attr('r', 4).attr('fill', dash.colors[0]).attr('opacity', 0);
    const rule = svg.append('line').attr('y1', m.t).attr('y2', laneU + 8).attr('stroke', 'var(--cds-chart-axis)').attr('opacity', 0);
    const t = MS.tip(box);
    const label = { views: 'Views', impressions: 'Impressions', clicks: 'Clicks', ctr: 'CTR' }[metric];
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', laneU + 10 - m.t).attr('fill', 'transparent')
      .on('mousemove', (ev) => {
        const [px, py] = d3.pointer(ev); const i = d3.bisectCenter(rows.map((r) => +r.d), +x.invert(px)); const r = rows[i];
        dot.attr('cx', x(r.d)).attr('cy', y(r[metric])).attr('opacity', 1);
        rule.attr('x1', x(r.d)).attr('x2', x(r.d)).attr('opacity', 1);
        const p = pub.get(r.date);
        t.hidden = false;
        t.replaceChildren(MS.el('div', 'ms-tip-d', d3.utcFormat('%a %b %-d')(r.d)),
          MS.el('div', null, label + ': ' + (metric === 'ctr' ? r.ctr + '%' : MS.n(r[metric]))),
          MS.el('div', 'ms-tip-d', p ? p.created + ' created · ' + p.updated + ' edited' : 'Nothing published'));
        MS.placeTip(t, box, (x(r.d) / W) * box.clientWidth, (py / H) * box.clientHeight);
      }).on('mouseleave', () => { t.hidden = true; dot.attr('opacity', 0); rule.attr('opacity', 0); });
    box.querySelector('svg')?.remove();
    box.prepend(svg.node());
  };
  MS.dayShift = dayShift;
  MS.fmtDay = fmtDay;
  const segSel = document.getElementById('ov-seg'), metSel = document.getElementById('ov-metric');
  [segSel, metSel].forEach((s) => s.addEventListener('change', () => MS.redraw()));
  const dailyChart = () => {
    const box = document.getElementById('chart-daily');
    const d = dash.data('daily_trend');
    if (d.status !== 'ok') { if (d.status === 'error') MS.failed(box); return; }
    box.classList.remove('dash-skeleton');
    const metric = metSel.value, seg = segSel.value;
    const rng = MS.range();
    const viewFrom = rng ? (dayCount(rng.from, rng.to) < 28 ? dayShift(rng.to, -27) : rng.from) : null;
    let rows = d.data.filter((r) => r.segment === seg && (!rng || (r.date >= viewFrom && r.date <= rng.to))).map((r) => ({ ...r, d: new Date(r.date) })).sort((a, b) => a.d - b.d);
    const weekly = rows.length > 120;
    if (weekly) {
      rows = d3.rollups(rows, (v) => {
        const c = d3.sum(v, (r) => r.clicks), i = d3.sum(v, (r) => r.impressions);
        return { date: v[0].date, d: v[0].d, clicks: c, impressions: i, ctr: i ? Math.round((c / i) * 10000) / 100 : 0, position: i ? Math.round((d3.sum(v, (r) => (r.position || 0) * r.impressions) / i) * 10) / 10 : null };
      }, (r) => d3.utcMonday.floor(r.d).toISOString().slice(0, 10)).map(([k, v]) => ({ ...v, date: k, d: new Date(k) })).sort((a, b) => a.d - b.d);
    }
    if (!rows.length) { box.querySelector('svg')?.remove(); return; }
    const W = Math.max(280, box.clientWidth), H = 290, m = { t: 12, r: 16, b: 66, l: 52 };
    const x = d3.scaleUtc(d3.extent(rows, (r) => r.d), [m.l, W - m.r]);
    const ext = d3.extent(rows, (r) => r[metric]);
    const yB = H - m.b;
    const y = metric === 'position' ? d3.scaleLinear([ext[1], Math.max(0, ext[0] - 1)], [yB, m.t]).nice() : d3.scaleLinear([0, ext[1] || 1], [yB, m.t]).nice();
    const fy = metric === 'ctr' ? (v) => v + '%' : metric === 'position' ? d3.format('.0f') : (v) => MS.compact(v);
    const svg = d3.create('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    svg.append('g').selectAll('line').data(y.ticks(4)).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
    svg.append('g').selectAll('text').data(y.ticks(4)).join('text').attr('x', m.l - 6).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').attr('fill', 'var(--color-fg-muted)').attr('font-size', 11).text(fy);
    svg.append('g').selectAll('text').data(x.ticks(W < 500 ? 3 : 6)).join('text').attr('x', x).attr('y', H - 4).attr('text-anchor', 'middle').attr('fill', 'var(--color-fg-muted)').attr('font-size', 11).text(d3.utcFormat('%b %-d'));
    const g = svg.append('defs').append('linearGradient').attr('id', 'ms-grad').attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 1);
    [[0, .26], [.25, .16], [.5, .08], [.75, .03], [1, 0]].forEach(([o, a]) => g.append('stop').attr('offset', o).attr('style', `stop-color:${dash.colors[0]};stop-opacity:${a}`));
    if (metric !== 'position') svg.append('path').attr('d', d3.area().x((r) => x(r.d)).y0(yB).y1((r) => y(r[metric]))(rows)).attr('fill', 'url(#ms-grad)');
    svg.append('path').attr('d', d3.line().x((r) => x(r.d)).y((r) => y(r[metric]))(rows)).attr('fill', 'none').attr('stroke', dash.colors[0]).attr('stroke-width', 2).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round');
    // Publishing lanes: created and edited pages per day, from the CMS.
    const cd = dash.data('content_daily');
    const pub = new Map();
    if (cd.status === 'ok') {
      const types = seg === 'Articles' ? ['Article'] : seg === 'Community Q&A' ? ['Community Q&A'] : ['Article', 'Community Q&A'];
      for (const r of cd.data) {
        if (!types.includes(r.content_type)) continue;
        const day = weekly ? d3.utcMonday.floor(new Date(String(r.day).slice(0, 10))).toISOString().slice(0, 10) : String(r.day).slice(0, 10);
        const p = pub.get(day) || { created: 0, updated: 0 };
        p.created += r.created; p.updated += r.updated; pub.set(day, p);
      }
    }
    const [dx0, dx1] = x.domain();
    const pubRows = [...pub].map(([day, v]) => ({ day, d: new Date(day), ...v })).filter((r) => r.d >= dx0 && r.d <= dx1);
    const pr = d3.scaleSqrt([0, d3.max(pubRows, (r) => Math.max(r.created, r.updated)) || 1], [0, 7]);
    const laneC = yB + 18, laneU = yB + 36;
    svg.append('text').attr('x', m.l - 6).attr('y', laneC).attr('dy', '0.32em').attr('text-anchor', 'end').attr('fill', 'var(--color-fg-muted)').attr('font-size', 10).text('New');
    svg.append('text').attr('x', m.l - 6).attr('y', laneU).attr('dy', '0.32em').attr('text-anchor', 'end').attr('fill', 'var(--color-fg-muted)').attr('font-size', 10).text('Edited');
    svg.append('g').selectAll('circle').data(pubRows.filter((r) => r.created)).join('circle').attr('cx', (r) => x(r.d)).attr('cy', laneC).attr('r', (r) => Math.max(1.5, pr(r.created))).attr('fill', dash.colors[2]).attr('fill-opacity', 0.8);
    svg.append('g').selectAll('circle').data(pubRows.filter((r) => r.updated)).join('circle').attr('cx', (r) => x(r.d)).attr('cy', laneU).attr('r', (r) => Math.max(1.5, pr(r.updated))).attr('fill', dash.colors[1]).attr('fill-opacity', 0.8);
    if (cd.status === 'error') svg.append('text').attr('x', m.l).attr('y', laneC).attr('dy', '0.32em').attr('fill', 'var(--color-fg-muted)').attr('font-size', 10).text('Publishing data failed to load');
    if (rng && viewFrom < rng.from) {
      const from = new Date(rng.from);
      svg.insert('rect', ':first-child').attr('x', x(from)).attr('width', Math.max(0, x(new Date(rng.to)) - x(from))).attr('y', m.t).attr('height', yB - m.t)
        .attr('fill', 'var(--cds-chart-reference)').attr('opacity', 0.1);
      svg.append('text').attr('x', x(from) + 4).attr('y', m.t + 10).attr('fill', 'var(--color-fg-muted)').attr('font-size', 10).text('Selected');
    }
    if (weekly) svg.append('text').attr('x', W - m.r).attr('y', m.t + 10).attr('text-anchor', 'end').attr('fill', 'var(--color-fg-muted)').attr('font-size', 10).text('Weekly totals');
    const dot = svg.append('circle').attr('r', 4).attr('fill', dash.colors[0]).attr('opacity', 0);
    const rule = svg.append('line').attr('y1', m.t).attr('y2', laneU + 8).attr('stroke', 'var(--cds-chart-axis)').attr('opacity', 0);
    const t = MS.tip(box);
    const label = { clicks: 'Clicks', impressions: 'Impressions', ctr: 'CTR', position: 'Avg. position' }[metric];
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', laneU + 10 - m.t).attr('fill', 'transparent')
      .on('mousemove', (ev) => {
        const [px, py] = d3.pointer(ev); const i = d3.bisectCenter(rows.map((r) => +r.d), +x.invert(px)); const r = rows[i];
        dot.attr('cx', x(r.d)).attr('cy', y(r[metric])).attr('opacity', 1);
        rule.attr('x1', x(r.d)).attr('x2', x(r.d)).attr('opacity', 1);
        const p = pub.get(r.date);
        t.hidden = false;
        t.replaceChildren(MS.el('div', 'ms-tip-d', (weekly ? 'Week of ' : '') + d3.utcFormat(weekly ? '%b %-d, %Y' : '%a %b %-d')(r.d)),
          MS.el('div', null, label + ': ' + (metric === 'ctr' ? r.ctr + '%' : metric === 'position' ? r.position : MS.n(r[metric]))),
          MS.el('div', 'ms-tip-d', p ? p.created + ' created · ' + p.updated + ' edited' : 'Nothing published'));
        MS.placeTip(t, box, (x(r.d) / W) * box.clientWidth, (py / H) * box.clientHeight);
      }).on('mouseleave', () => { t.hidden = true; dot.attr('opacity', 0); rule.attr('opacity', 0); });
    box.querySelector('svg')?.remove();
    box.prepend(svg.node());
  };

  const lwType = document.getElementById('lw-type'), lwAction = document.getElementById('lw-action'), ktQ = document.getElementById('kt-q'), ixType = document.getElementById('ix-type');
  [lwType, lwAction, ixType, document.getElementById('lw-target')].forEach((s) => s.addEventListener('change', () => MS.redraw()));
  ktQ.addEventListener('input', () => MS.redraw());

  // Week picker for Last week review: weeks come from the weekly CMS counts (Mondays).
  const lwWeek = document.getElementById('lw-week');
  const lwWeeks = () => { const d = dash.data('content_weekly'); return d.status === 'ok' ? [...new Set(d.data.map((r) => String(r.week).slice(0, 10)))].sort() : []; };
  const pickWeek = (w) => {
    const weeks = lwWeeks();
    if (!weeks.length) return;
    MS.state.lwWeek = w;
    const latest = weeks[weeks.length - 1];
    dash.setParams({ week_start: w === latest ? null : w }); // re-runs the page-by-page list for that week
    MS.state.more.lw = false;
    MS.redraw();
  };
  lwWeek.addEventListener('change', () => pickWeek(lwWeek.value));
  document.getElementById('lw-prev').addEventListener('click', () => { const w = lwWeeks(); const i = w.indexOf(MS.state.lwWeek); if (i > 0) pickWeek(w[i - 1]); });
  document.getElementById('lw-next').addEventListener('click', () => { const w = lwWeeks(); const i = w.indexOf(MS.state.lwWeek); if (i >= 0 && i < w.length - 1) pickWeek(w[i + 1]); });
  document.getElementById('lw-latest').addEventListener('click', () => { const w = lwWeeks(); pickWeek(w[w.length - 1]); });
  const weekLabel = (w) => MS.fmtDay(w).replace(/, \d{4}$/, '') + ' – ' + MS.fmtDay(MS.dayShift(w, 6));

  const drawReview = () => {
    const weeks = lwWeeks();
    if (weeks.length && !weeks.includes(MS.state.lwWeek)) MS.state.lwWeek = weeks[weeks.length - 1];
    const wk = MS.state.lwWeek, latest = weeks[weeks.length - 1], isLatest = wk === latest;
    if (weeks.length && lwWeek.options.length !== weeks.length) lwWeek.replaceChildren(...weeks.slice().reverse().map((w) => new Option((w === latest ? 'Last week · ' : 'Week of ') + weekLabel(w), w)));
    if (wk) lwWeek.value = wk;
    document.getElementById('lw-prev').disabled = !wk || weeks.indexOf(wk) <= 0;
    document.getElementById('lw-next').disabled = !wk || isLatest;
    document.getElementById('lw-latest').hidden = !wk || isLatest;
    const label = wk ? (isLatest ? 'last week' : 'the week of ' + weekLabel(wk)) : 'last week';
    document.getElementById('lw-title').textContent = 'What we published ' + label;
    document.getElementById('lw-perf-title').textContent = 'How content performed ' + label;
    document.getElementById('lw-work-title').textContent = (isLatest || !wk ? "Last week's" : 'That week\u2019s') + ' work, page by page';
    if (MS.state.channel === 'app') return drawReviewApp(wk, weeks, isLatest);
    // Tiles straight from the weekly counts.
    const cw = dash.data('content_weekly');
    const before = wk ? weeks[weeks.indexOf(wk) - 1] : null;
    for (const el of document.querySelectorAll('#last-week [data-source="content_weekly"][data-week]')) {
      const type = new URLSearchParams(el.dataset.where.split('&week=')[0]).get('content_type');
      const w = el.dataset.week === 'this' ? wk : before;
      el.dataset.where = 'content_type=' + encodeURIComponent(type) + (w ? '&week=' + w : '');
      if (cw.status !== 'ok') { if (cw.status === 'error') { el.classList.remove('dash-skeleton'); el.textContent = '—'; } continue; }
      el.classList.remove('dash-skeleton');
      const row = w ? cw.data.find((r) => String(r.week).slice(0, 10) === w && r.content_type === type) : null;
      el.textContent = w ? MS.n(row ? row[el.dataset.field] : 0) : '—';
    }
    // Did our updates work?
    const uiT = document.getElementById('ui-table'), score = document.getElementById('ui-score');
    if (MS.tableState(uiT, 'update_impact')) {
      // Worked (▲, biggest gain first), then no clear change, then didn't work (▼, biggest drop first), then too soon to tell.
      const all = MS.byLang(dash.data('update_impact').data).slice();
      const outcome = (r) => (r.change_pct == null ? 3 : r.change_pct > 0.05 ? 0 : r.change_pct < -0.05 ? 2 : 1);
      all.sort((x, y) => outcome(x) - outcome(y) || (outcome(x) === 2 ? x.change_pct - y.change_pct : (y.change_pct ?? 0) - (x.change_pct ?? 0)));
      const up = all.filter((r) => r.change_pct != null && r.change_pct > 0.05).length;
      const down = all.filter((r) => r.change_pct != null && r.change_pct < -0.05).length;
      score.replaceChildren(MS.el('span', 'ms-good', '▲ ' + up), document.createTextNode('  '), MS.el('span', 'ms-bad', '▼ ' + down));
      score.title = up + ' edited pages gained clicks, ' + down + ' lost clicks (5% or more)';
      const shown = all.length <= 20 ? all : MS.limit('ui', all);
      MS.table(uiT, shown, [
        { cls: 'ms-wide', render: (r) => MS.link(r.title, r.link, r.language !== 'English' ? r.language : '') },
        { render: (r) => r.updated_at + ' (' + r.days_after + ' days after)' },
        { cls: 'num', f: 'clicks_before_per_day' },
        { cls: 'num', f: 'clicks_after_per_day' },
        { cls: 'num', render: (r) => { if (r.change_pct == null) return '—'; return MS.el('span', r.change_pct > 0.05 ? 'ms-good' : r.change_pct < -0.05 ? 'ms-bad' : 'ms-flat', (r.change_pct > 0.05 ? '▲ ' : r.change_pct < -0.05 ? '▼ ' : '') + MS.pct(r.change_pct)); } },
        { cls: 'num', render: (r) => (r.pos_before ?? '—') + ' → ' + (r.pos_after ?? '—') },
      ], 'page');
      MS.moreBtn('ui', all.length);
      if (all.length <= 20) document.querySelector('[data-more="ui"]').hidden = true;
      document.getElementById('ui-count').textContent = all.length + ' edited pages compared · ▲ / ▼ = 5% or more change in clicks a day';
    } else if (dash.data('update_impact').status === 'error') score.textContent = '—';

    weeklyBars(document.getElementById('chart-weekly-a'), 'Article');
    weeklyBars(document.getElementById('chart-weekly-c'), 'Community Q&A');
    const tb = MS.trendBounds();
    MS.rangeScore(document.getElementById('review-kpis'), ['Whole site', 'Articles', 'Community Q&A'],
      wk && tb ? { from: wk, to: MS.dayShift(wk, 6) > tb.last ? tb.last : MS.dayShift(wk, 6), bounds: tb } : null, 'lw-range-text', '. Google Search, all languages. Data from ');
    const lwT = document.getElementById('lw-table');
    if (MS.tableState(lwT, 'lastweek_work')) {
      const all = MS.byLang(dash.data('lastweek_work').data);
      const lwTarget = document.getElementById('lw-target').value;
      const rows = all.filter((r) => (!lwType.value || r.content_type === lwType.value) && (!lwAction.value || r.action === lwAction.value) && (!lwTarget || r.target_check === lwTarget));
      const shown = MS.limit('lw', rows);
      MS.table(lwT, shown, [
        { f: 'content_type' }, { render: (r) => MS.chip(r.action) },
        { cls: 'ms-wide', render: (r) => MS.link(r.title, r.url) }, { f: 'date' },
        { cls: 'num', render: (r) => (r.impr_last_week == null ? '—' : MS.n(r.impr_last_week)) }, { cls: 'num', render: (r) => (r.clicks_last_week == null ? '—' : MS.n(r.clicks_last_week)) }, { cls: 'num', f: 'pos_last_week' },
        { render: (r) => {
          if (!r.in_snapshot) return MS.el('span', 'ms-flat', '—');
          const list = Array.isArray(r.top_searches) ? r.top_searches : [];
          if (!list.length) return MS.el('span', 'ms-flat', r.impr_last_week > 0 ? 'Searches hidden by Google (too few)' : 'No searches yet');
          const w = MS.el('span');
          if (r.target && r.target_check) {
            const t = MS.el('span', 'ms-tgt');
            const kind = r.target_from === 'keyword' ? 'Target keyword' : r.target_from === 'H1' ? 'Target (from H1)' : 'Target (from meta title)';
            if (r.target_check === 'Not checked') {
              t.append(MS.el('span', 'ms-flat', kind + ': not checked (title not in English letters)'));
            } else {
              const c = r.target_check, ok = c === 'On target', off = c === 'Off target', rel = c === 'Related';
              const ts = r.target_search, strong = ts && ts.position <= 10;
              t.append(MS.el('i', ok ? 'ms-good' : off ? 'ms-warn' : rel ? 'ms-info' : 'ms-bad', (ok ? '✓ ' : off ? '⚠ ' : rel ? '● ' : '✗ ') + (rel ? 'Related searches' : c)), MS.el('span', 'ms-flat', ' · ' + kind + ': '), MS.el('b', null, r.target));
              if (off && ts) t.append(MS.el('span', 'ms-pstat', 'Shows for other searches first. The target search “' + ts.query + '” is lower: ' + MS.n(ts.impressions) + ' impr. · pos ' + ts.position + '.'));
              if (rel && ts) t.append(MS.el('span', 'ms-pstat', 'Ranks for the same topic in other words, e.g. “' + ts.query + '” at pos ' + ts.position + '. '
                + (strong ? 'Doing well: build on it with a section or H2 using those words.' : 'Still weak: strengthen the content for these searches or rework the page.')));
              if (c === 'Not ranking for it') t.append(MS.el('span', 'ms-pstat', 'None of its ' + MS.n(r.n_searches) + ' searches are about the target. Fix the title/H1 to the target, or retarget to the search Google prefers.'));
            }
            w.append(t);
          }
          list.forEach((q) => { const line = MS.el('span', 'ms-tsq'); line.append(MS.el('b', null, q.query), MS.el('span', null, ' · ' + MS.n(q.impressions) + ' impr. · pos ' + q.position + (q.clicks ? ' · ' + MS.n(q.clicks) + ' clicks' : ''))); w.append(line); });
          if (r.n_searches > 3) w.append(MS.el('span', 'ms-pstat', '+ ' + MS.n(r.n_searches - 3) + ' more searches'));
          return w;
        } },
        { render: (r) => MS.el('span', r.indexing === 'Indexed' ? 'ms-good' : r.indexing === 'Not checked' ? 'ms-flat' : 'ms-bad', r.indexing) },
      ], 'path');
      MS.moreBtn('lw', rows.length);
      const withImpr = rows.filter((r) => r.impr_last_week > 0).length, withSearch = rows.filter((r) => Array.isArray(r.top_searches) && r.top_searches.length).length;
      document.getElementById('lw-count').textContent = 'Showing ' + shown.length + ' of ' + rows.length
        + (rows.some((r) => r.in_snapshot) ? ' · ' + withImpr + ' already had Google impressions that week, ' + withSearch + ' with searches listed (' + ['On target', 'Off target', 'Related', 'Not ranking for it'].map((k) => MS.n(rows.filter((r) => r.target_check === k).length) + ' ' + k.toLowerCase()).join(', ') + ')' : ' · page-level Search Console numbers are kept for the latest week only');
    }
  };

  const appLwType = document.getElementById('app-lw-type'), appLwAction = document.getElementById('app-lw-action');
  [appLwType, appLwAction].forEach((el) => el.addEventListener('change', () => MS.redraw()));
  const drawReviewApp = (wk, weeks, isLatest) => {
    const before = wk ? weeks[weeks.indexOf(wk) - 1] : null;
    document.getElementById('app-lw-work-title').textContent = (isLatest || !wk ? "Last week's" : 'That week’s') + ' work in the app, page by page';
    const cw = dash.data('app_content_weekly');
    for (const el of document.querySelectorAll('#last-week [data-source="app_content_weekly"][data-week]')) {
      const type = new URLSearchParams(el.dataset.where.split('&week=')[0]).get('content_type');
      const w = el.dataset.week === 'this' ? wk : before;
      el.dataset.where = 'content_type=' + encodeURIComponent(type) + (w ? '&week=' + w : '');
      if (cw.status !== 'ok') { if (cw.status === 'error') { el.classList.remove('dash-skeleton'); el.textContent = '—'; } continue; }
      el.classList.remove('dash-skeleton');
      const row = w ? cw.data.find((r) => String(r.week).slice(0, 10) === w && r.content_type === type) : null;
      el.textContent = w ? MS.n(row ? Number(row[el.dataset.field]) : 0) : '—';
    }
    weeklyBars(document.getElementById('chart-app-weekly-w'), 'Web article', 'app_content_weekly');
    weeklyBars(document.getElementById('chart-app-weekly-a'), 'App-only article', 'app_content_weekly');
    const ab = MS.trendBounds('app_daily');
    MS.appRangeScore(document.getElementById('review-app-kpis'),
      wk && ab ? { from: wk, to: MS.dayShift(wk, 6) > ab.last ? ab.last : MS.dayShift(wk, 6), bounds: ab } : null, 'lw-range-text',
      '. Articles in the app, Android and iOS, all languages. App data from ');
    const t = document.getElementById('app-lw-table');
    if (MS.tableState(t, 'app_lastweek_work')) {
      const all = MS.byLang(dash.data('app_lastweek_work').data);
      const rows = all.filter((r) => (!appLwType.value || r.content_type === appLwType.value) && (!appLwAction.value || r.action === appLwAction.value));
      const shown = MS.limit('alw', rows);
      const num = (v) => (v == null ? '—' : MS.n(v));
      MS.table(t, shown, [
        { render: (r) => MS.el('span', 'ms-kind', r.content_type === 'Web article' ? 'Web' : 'App only') }, { render: (r) => MS.chip(r.action) },
        { cls: 'ms-wide', render: (r) => MS.link(r.title, r.link) }, { f: 'date' },
        { cls: 'num', render: (r) => num(r.impressions) }, { cls: 'num', render: (r) => num(r.clicks) },
        { cls: 'num', render: (r) => (r.ctr == null ? '—' : r.ctr + '%') }, { cls: 'num', render: (r) => num(r.views) },
      ], 'id');
      MS.moreBtn('alw', rows.length);
      const seen = rows.filter((r) => r.views > 0).length;
      document.getElementById('app-lw-count').textContent = 'Showing ' + shown.length + ' of ' + rows.length
        + (rows.some((r) => r.in_data) ? ' · ' + seen + ' were opened in the app that week' : ' · app numbers are kept for the last 12 weeks only');
    }
    const uiT = document.getElementById('app-ui-table'), score = document.getElementById('app-ui-score');
    if (MS.tableState(uiT, 'app_update_impact')) {
      // Worked (▲, biggest gain first), then no clear change, then didn't work (▼, biggest drop first), then too soon to tell.
      const all = MS.byLang(dash.data('app_update_impact').data).slice();
      const outcome = (r) => (r.change_pct == null ? 3 : r.change_pct > 0.05 ? 0 : r.change_pct < -0.05 ? 2 : 1);
      all.sort((x, y) => outcome(x) - outcome(y) || (outcome(x) === 2 ? x.change_pct - y.change_pct : (y.change_pct ?? 0) - (x.change_pct ?? 0)));
      const up = all.filter((r) => r.change_pct != null && r.change_pct > 0.05).length;
      const down = all.filter((r) => r.change_pct != null && r.change_pct < -0.05).length;
      score.replaceChildren(MS.el('span', 'ms-good', '▲ ' + up), document.createTextNode('  '), MS.el('span', 'ms-bad', '▼ ' + down));
      score.title = up + ' edited articles gained app views, ' + down + ' lost app views (5% or more)';
      const shown = all.length <= 20 ? all : MS.limit('aui', all);
      MS.table(uiT, shown, [
        { cls: 'ms-wide', render: (r) => MS.link(r.title, r.link, r.kind === 'App-only article' ? 'App only' : r.language !== 'English' ? r.language : '') },
        { render: (r) => r.updated_at + ' (' + r.days_after + ' days after)' },
        { cls: 'num', f: 'views_before_per_day' }, { cls: 'num', f: 'views_after_per_day' },
        { cls: 'num', render: (r) => { if (r.change_pct == null) return '—'; return MS.el('span', r.change_pct > 0.05 ? 'ms-good' : r.change_pct < -0.05 ? 'ms-bad' : 'ms-flat', (r.change_pct > 0.05 ? '▲ ' : r.change_pct < -0.05 ? '▼ ' : '') + MS.pct(r.change_pct)); } },
      ], 'id');
      MS.moreBtn('aui', all.length);
      if (all.length <= 20) document.querySelector('[data-more="aui"]').hidden = true;
      document.getElementById('app-ui-count').textContent = all.length + ' edited articles compared · ▲ / ▼ = 5% or more change in app views a day';
    } else if (dash.data('app_update_impact').status === 'error') score.textContent = '—';
  };

  const drawOverviewApp = () => {
    const rng = MS.range('app_daily');
    MS.appRangeScore(document.getElementById('ov-app-kpis'), rng, 'ov-range-text',
      '. Articles in the app, Android and iOS. Views count every way an article is opened; impressions and clicks count the recommended-article cards. All languages. App data from ');
    if (rng) {
      ovFrom.min = ovTo.min = rng.bounds.first; ovFrom.max = ovTo.max = rng.bounds.last;
      if (document.activeElement !== ovFrom) ovFrom.value = rng.from;
      if (document.activeElement !== ovTo) ovTo.value = rng.to;
    }
    document.querySelectorAll('#ov-presets [data-preset]').forEach((b) => b.setAttribute('aria-pressed', String((MS.state.preset ?? '7') === b.dataset.preset)));
    appDailyChart();
    const pm = dash.data('app_movers');
    for (const [id, up] of [['app-up-table', true], ['app-down-table', false]]) {
      const tb = document.getElementById(id);
      if (!MS.tableState(tb, 'app_movers')) continue;
      const all = MS.byLang(pm.data);
      const list = up ? all.filter((r) => r.views_change > 0) : all.filter((r) => r.views_change < 0).reverse();
      const rows = MS.limit(up ? 'amu' : 'amd', list);
      MS.moreBtn(up ? 'amu' : 'amd', list.length);
      MS.table(tb, rows, [
        { cls: 'ms-wide', render: (r) => MS.link(r.title, r.link, r.kind === 'App-only article' ? 'App only' : '') }, { cls: 'num', render: (r) => MS.n(r.views_last_week) },
        { cls: 'num', render: (r) => MS.el('span', r.views_change > 0 ? 'ms-good' : 'ms-bad', (r.views_change > 0 ? '+' : '') + MS.n(r.views_change)) },
        { cls: 'num', render: (r) => (r.ctr_last_week == null ? '—' : r.ctr_last_week + '%') },
      ], 'id');
    }
    if (pm.status === 'ok' && pm.data[0]) document.getElementById('app-movers-note').textContent = 'Week of ' + MS.fmtDay(pm.data[0].week) + ' against the week before. App articles with 30+ app views in either week.';
  };

  const drawOverview = () => {
    if (MS.state.channel === 'app') return drawOverviewApp();
    const rng = MS.range();
    MS.rangeScore(document.getElementById('ov-kpis'), ['Whole site', 'Articles', 'Community Q&A'], rng);
    if (rng) {
      ovFrom.min = ovTo.min = rng.bounds.first; ovFrom.max = ovTo.max = rng.bounds.last;
      if (document.activeElement !== ovFrom) ovFrom.value = rng.from;
      if (document.activeElement !== ovTo) ovTo.value = rng.to;
    }
    document.querySelectorAll('#ov-presets [data-preset]').forEach((b) => b.setAttribute('aria-pressed', String((MS.state.preset ?? '7') === b.dataset.preset)));
    dailyChart();
    const pm = dash.data('page_movers');
    for (const [id, up] of [['up-table', true], ['down-table', false]]) {
      const tb = document.getElementById(id);
      if (!MS.tableState(tb, 'page_movers')) continue;
      const all = MS.byLang(pm.data);
      const list = up ? all.filter((r) => r.clicks_change > 0) : all.filter((r) => r.clicks_change < 0).reverse();
      const rows = MS.limit(up ? 'mvu' : 'mvd', list);
      MS.moreBtn(up ? 'mvu' : 'mvd', list.length);
      MS.table(tb, rows, [
        { cls: 'ms-wide', render: (r) => MS.link(r.title, r.link) }, { cls: 'num', render: (r) => MS.n(r.clicks_last_week) },
        { cls: 'num', render: (r) => MS.el('span', r.clicks_change > 0 ? 'ms-good' : 'ms-bad', (r.clicks_change > 0 ? '+' : '') + MS.n(r.clicks_change)) },
        { cls: 'num', f: 'pos_last_week' },
      ], 'page');
    }
  };

  const heatClass = (p) => p == null ? '' : p <= 3 ? 'ms-h1' : p <= 6 ? 'ms-h2' : p <= 10 ? 'ms-h3' : p <= 20 ? 'ms-h4' : 'ms-h5';
  const drawKeywords = () => {
    const kt = document.getElementById('kt-table');
    if (MS.tableState(kt, 'tracker_heat')) {
      const all = dash.data('tracker_heat').data;
      const weeks = all[0] ? all[0].weeks : [];
      const ths = [...document.querySelectorAll('#kt-head th')];
      weeks.forEach((w, i) => { if (ths[i + 2]) ths[i + 2].textContent = d3.utcFormat('%b %-d')(new Date(w)); });
      const q = ktQ.value.trim().toLowerCase();
      // Pages per search: the whole-site pull first, the article/Q&A page pairs as a fallback.
      const sp = dash.data('site_query_pages'), qp = dash.data('query_pages');
      const pagesFor = new Map();
      if (sp.status === 'ok') for (const r of sp.data) {
        const k = String(r.query).toLowerCase();
        if (!pagesFor.has(k)) pagesFor.set(k, []);
        pagesFor.get(k).push({ title: r.title, url: r.url || null, gsc: r.gsc_link || null, type: r.type, impr: Number(r.impr_28d), pos: Number(r.position) });
      }
      const slugTitle = (u) => { try { const t = decodeURIComponent(String(u).split('/').pop()).replace(/-\d+$/, '').replace(/-/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); } catch (err) { return u; } };
      if (qp.status === 'ok') for (const r of qp.data) {
        const k = String(r.query).toLowerCase();
        if (sp.status === 'ok' && pagesFor.has(k) && !pagesFor.get(k)._fallback) continue;
        if (!pagesFor.has(k)) { const a = []; a._fallback = true; pagesFor.set(k, a); }
        pagesFor.get(k).push({ title: slugTitle(r.url || r.page), url: r.url || null, gsc: null, type: r.content_type === 'Community Q&A' ? 'Q&A' : 'Article', impr: Number(r.impr_28d), pos: Number(r.position) });
      }
      for (const a of pagesFor.values()) a.sort((x, y) => y.impr - x.impr);
      MS.state.ktOpen = MS.state.ktOpen || new Set();
      const pageCell = (r) => {
        const w = MS.el('div');
        const list = pagesFor.get(String(r.query).toLowerCase()) || [];
        if (!list.length) { w.append(MS.el('span', 'ms-sub', sp.status === 'ok' || qp.status === 'ok' ? 'Page not reported by Search Console' : '…')); return w; }
        const main = MS.link(list[0].title, list[0].url || list[0].gsc);
        main.querySelector('a, span')?.after(MS.el('span', 'ms-kind', list[0].type));
        w.append(main);
        if (list.length > 1) {
          const open = MS.state.ktOpen.has(r.query);
          const b = MS.el('button', 'ms-linkbtn', (open ? '▾ Hide ' : '▸ +') + (list.length - 1) + ' more page' + (list.length > 2 ? 's' : ''));
          b.type = 'button'; b.setAttribute('aria-expanded', String(open));
          b.addEventListener('click', () => { if (MS.state.ktOpen.has(r.query)) MS.state.ktOpen.delete(r.query); else MS.state.ktOpen.add(r.query); MS.redraw(); });
          w.append(b);
          if (open) {
            const ul = MS.el('ul', 'ms-ktmore');
            for (const pg of list.slice(1)) {
              const li = MS.el('li');
              const l = MS.link(pg.title, pg.url || pg.gsc);
              l.append(MS.el('span', 'ms-sub', pg.type + ' · position ' + pg.pos + ' · ' + MS.n(pg.impr) + ' impr. in 28 days'));
              li.append(l); ul.append(li);
            }
            w.append(ul);
          }
        }
        return w;
      };
      const cols = [{ f: 'query' }, { cls: 'ms-ktp', render: pageCell }];
      for (let i = 1; i <= 8; i++) cols.push({ cls: 'ms-hc', render: (r) => (r['week_' + i] == null ? '—' : String(r['week_' + i])) });
      cols.push({ cls: 'num', render: (r) => MS.el('span', r.pos_change > 0.2 ? 'ms-good' : r.pos_change < -0.2 ? 'ms-bad' : 'ms-flat', (r.pos_change > 0 ? '▲ ' : r.pos_change < 0 ? '▼ ' : '') + Math.abs(r.pos_change)) });
      cols.push({ cls: 'num', render: (r) => MS.n(r.impr_last_week) });
      const rows = all.filter((r) => !q || r.query.toLowerCase().includes(q));
      MS.table(kt, rows, cols, 'query');
      [...kt.tBodies[0].rows].forEach((tr, ri) => { for (let i = 1; i <= 8; i++) { const c = heatClass(rows[ri]['week_' + i]); if (c) tr.cells[i + 1].classList.add(c); } });
    }
  };

  const indexTiles = (box) => {
    const d = dash.data('index_summary');
    if (d.status !== 'ok') { if (d.status === 'error') MS.failed(box); else box.replaceChildren(MS.el('div', 'ms-tile dash-skeleton', '')); return; }
    if (!d.data.length) { box.replaceChildren(MS.el('p', 'ms-note', 'No URL inspection results yet. They appear after the next refresh.')); return; }
    box.replaceChildren(...d.data.map((r) => {
      const t = MS.el('div', 'ms-tile');
      t.append(MS.el('span', 'ms-tile-label', r.content_type));
      const big = MS.el('span', 'ms-big', r.not_indexed ? MS.n(r.not_indexed) + ' not indexed' : 'All indexed');
      if (r.not_indexed) big.classList.add('ms-bad');
      t.append(big, MS.el('span', 'ms-delta ms-flat', MS.n(r.indexed) + ' of ' + MS.n(r.inspected) + ' inspected are indexed' + (r.top_reason ? ' · ' + r.top_reason : '')));
      return t;
    }));
  };

  const covQ = document.getElementById('cov-q');
  covQ.addEventListener('input', () => MS.redraw());
  const covBar = (label, inG, un, no, total) => {
    const row = MS.el('div', 'ms-covrow');
    const bar = MS.el('div', 'ms-covbar');
    for (const [v, cls] of [[inG, 'ms-sw-in'], [un, 'ms-sw-un'], [no, 'ms-sw-no']]) { const i = MS.el('i', cls); i.style.width = (total ? (v / total) * 100 : 0) + '%'; bar.append(i); }
    bar.title = MS.n(inG) + ' in Google · ' + MS.n(un) + ' unclear · ' + MS.n(no) + ' no impressions';
    row.append(MS.el('span', null, label), bar, MS.el('span', 'ms-muted', MS.n(no) + ' of ' + MS.n(total)));
    return row;
  };
  const drawCoverage = () => {
    const L = MS.state.lang || 'All';
    const cs = dash.data('coverage_summary');
    const top = document.getElementById('cov-top'), byLang = document.getElementById('cov-lang'), byYear = document.getElementById('cov-year');
    if (cs.status !== 'ok') { if (cs.status === 'error') [top, byLang].forEach((b) => MS.failed(b)); }
    else {
      const a = cs.data.find((r) => r.language === L) || { total: 0, in_google: 0, unclear: 0, no_impressions: 0 };
      const stat = (v, label, cls) => { const d = MS.el('div'); const b = MS.el('b', cls, MS.n(v)); d.append(b, MS.el('span', 'ms-muted', label)); return d; };
      top.replaceChildren(stat(a.total, 'SEO articles' + (L === 'All' ? '' : ' in ' + L)), stat(a.in_google, 'got impressions (indexed)', 'ms-good'),
        stat(a.no_impressions, 'no impressions in 28 days', 'ms-bad'), stat(a.unclear, 'unclear (URL cut off)', 'ms-flat'));
      byLang.replaceChildren(...cs.data.filter((r) => r.language !== 'All').map((r) => covBar(r.language, r.in_google, r.unclear, r.no_impressions, r.total)));
    }
    const cy = dash.data('coverage_by_year');
    if (cy.status === 'ok') {
      const rows = cy.data.filter((r) => L === 'All' || r.language === L);
      const years = d3.rollups(rows, (v) => ({ total: d3.sum(v, (r) => r.total), no: d3.sum(v, (r) => r.no_impressions) }), (r) => r.year);
      byYear.replaceChildren(...years.map(([y, v]) => {
        const row = MS.el('div', 'ms-covrow');
        const bar = MS.el('div', 'ms-covbar');
        const i = MS.el('i', 'ms-sw-no'); i.style.width = (v.total ? (v.no / v.total) * 100 : 0) + '%'; bar.append(i);
        row.append(MS.el('span', null, y), bar, MS.el('span', 'ms-muted', MS.n(v.no) + ' of ' + MS.n(v.total)));
        return row;
      }));
    } else if (cy.status === 'error') MS.failed(byYear);
    const t = document.getElementById('cov-table');
    if (MS.tableState(t, 'article_coverage')) {
      const q = covQ.value.trim().toLowerCase();
      const rows = dash.data('article_coverage').data.filter((r) => r.search_status === 'No impressions' && (L === 'All' || r.language === L) && (!q || r.title.toLowerCase().includes(q)))
        .sort((a, b) => d3.descending(a.created_at, b.created_at));
      const shown = MS.limit('cov', rows);
      MS.table(t, shown, [
        { cls: 'ms-wide', render: (r) => MS.link(r.title || r.page, 'https://bloomnest.example' + r.page, r.new_last_week ? 'New last week' : '') }, { f: 'language' }, { f: 'created_at' }, { f: 'updated_at' },
      ], 'page');
      MS.moreBtn('cov', rows.length);
      document.getElementById('cov-count').textContent = 'Showing ' + shown.length + ' of ' + MS.n(rows.length) + ', newest first';
    }
  };

  const drawIndexing = () => {
    indexTiles(document.getElementById('index-tiles'));
    drawCoverage();
    const t = document.getElementById('ix-table');
    if (MS.tableState(t, 'indexing')) {
      const lang = (p) => ({ hi: 'Hindi', ta: 'Tamil', te: 'Telugu', mr: 'Marathi', bn: 'Bengali' })[p.split('/')[1]] || 'English';
      const all = dash.data('indexing').data.filter((r) => !MS.state.lang || lang(r.page) === MS.state.lang);
      const types = [...new Set(all.map((r) => r.content_type))].sort();
      const cur = ixType.value;
      ixType.replaceChildren(new Option('All inspected pages', ''), ...types.map((v) => new Option(v)));
      ixType.value = types.includes(cur) ? cur : '';
      const rows = all.filter((r) => !r.indexed && (!ixType.value || r.content_type === ixType.value));
      const dec = (u) => { try { return decodeURIComponent(u); } catch (e) { return u; } };
      MS.table(t, rows, [
        { f: 'content_type' }, { cls: 'ms-wide', render: (r) => MS.link(r.title || dec(r.page), r.url) }, { f: 'coverage' }, { f: 'last_crawl' },
      ], 'page');
      document.getElementById('ix-count').textContent = rows.length + ' not indexed out of ' + all.filter((r) => !ixType.value || r.content_type === ixType.value).length + ' inspected';
    }
  };

  const clType = document.getElementById('cl-type'), clFmt = document.getElementById('cl-fmt'), clQ = document.getElementById('cl-q');
  [clType, clFmt].forEach((el) => el.addEventListener('change', () => MS.redraw()));
  clQ.addEventListener('input', () => MS.redraw());
  const diffBlock = (r) => {
    const d = MS.el('details');
    d.append(MS.el('summary', null, 'Show before / after'));
    const box = MS.el('div', 'ms-diff');
    const pair = (label, was, now) => {
      if (!(label in { x: 1 }) && was === undefined && now === undefined) return;
      const row = MS.el('div');
      row.append(MS.el('b', null, label));
      row.append(was ? MS.el('span', 'was', was) : MS.el('span', 'was empty', '(empty)'));
      row.append(now ? MS.el('span', 'now', now) : MS.el('span', 'now empty', '(empty)'));
      box.append(row);
    };
    const ch = r.changed || [];
    if (ch.includes('Meta title')) pair('Meta title', r.meta_title_before, r.meta_title_after);
    if (ch.includes('Meta description')) pair('Meta description', r.meta_desc_before, r.meta_desc_after);
    if (ch.includes('Title')) pair('Title', r.title_before, r.title_after);
    if (ch.includes('Target keyword')) pair('Target keyword', r.title_before, r.title_after);
    if (ch.includes('H1')) pair('H1', r.h1_before, r.h1_after);
    if (ch.includes('Body') || ch.includes('Formatting')) {
      const row = MS.el('div');
      row.append(MS.el('b', null, 'Body'));
      const dw = r.words_after - r.words_before;
      row.append(MS.el('span', 'now', MS.n(r.words_before) + ' → ' + MS.n(r.words_after) + ' words' + (dw ? ' (' + (dw > 0 ? '+' : '') + MS.n(dw) + ')' : ' (same text, formatting only)')));
      if ((r.sections_added || []).length) row.append(MS.el('span', 'now ms-good', 'Sections added: ' + r.sections_added.join(' · ')));
      if ((r.sections_removed || []).length) row.append(MS.el('span', 'now ms-bad', 'Sections removed: ' + r.sections_removed.join(' · ')));
      box.append(row);
    }
    if (ch.includes('Footnote')) { const row = MS.el('div'); row.append(MS.el('b', null, 'Footnote'), MS.el('span', 'now', 'Changed')); box.append(row); }
    d.append(box);
    return d;
  };
  const asList = (v) => {
    if (Array.isArray(v)) return v;
    if (v == null || v === '') return [];
    const t = String(v).trim();
    if (t.startsWith('[')) { try { return JSON.parse(t); } catch (err) { /* fall through */ } }
    return t.split(/\s*,\s*/).filter(Boolean);
  };
  const chipClass = (c) => (c === 'Body' ? 'k-body' : c === 'Formatting' ? 'k-fmt' : c.startsWith('Meta') ? 'k-meta' : '');
  const drawChangelog = () => {
    const t = document.getElementById('cl-table');
    const tiles = document.getElementById('cl-tiles');
    if (!MS.tableState(t, 'changelog_view')) { if (dash.data('changelog_view').status === 'error') MS.failed(tiles); return; }
    const all = MS.byLang(dash.data('changelog_view').data).map((r) => ({ ...r, changed: asList(r.changed), flags: asList(r.flags), sections_added: asList(r.sections_added), sections_removed: asList(r.sections_removed) }));
    const latest = all.reduce((m, r) => (r.date > m ? r.date : m), '');
    const firstDay = all.reduce((m, r) => (!m || r.date < m ? r.date : m), '');
    const from = latest ? new Date(Date.parse(latest) - 6 * 864e5).toISOString().slice(0, 10) : '';
    const typed = all.filter((r) => !clType.value || r.kind === clType.value);
    const per = MS.state.clPeriod || 'all';
    const inPeriod = typed.filter((r) => per === 'all' || !from || r.date >= from); // the 7 days / since-start switch: tiles and list
    document.getElementById('cl-range').textContent = firstDay ? (per === 'all' ? 'Every saved edit since ' + MS.fmtDay(firstDay) : 'The last 7 days of edits (' + MS.fmtDay(from) + ' – ' + MS.fmtDay(latest) + ')') + ', tiles and list.' : '';
    // Tiles for the period (formatting-only edits counted separately).
    const has = (r, c) => (r.changed || []).includes(c);
    const real = inPeriod.filter((r) => (r.changed || []).some((c) => c !== 'Formatting'));
    const tile = (label, v, note, cls) => { const d = MS.el('div', 'ms-tile'); d.append(MS.el('span', 'ms-tile-label', label), MS.el('span', 'ms-big' + (cls ? ' ' + cls : ''), MS.n(v))); if (note) d.append(MS.el('span', 'ms-delta ms-flat', note)); return d; };
    const tileT = (label, text, note, cls) => { const d = MS.el('div', 'ms-tile'); d.append(MS.el('span', 'ms-tile-label', label), MS.el('span', 'ms-big' + (cls ? ' ' + cls : ''), text)); if (note) d.append(MS.el('span', 'ms-delta ms-flat', note)); return d; };
    const measured = inPeriod.filter((r) => r.effect_pct != null), wentUp = measured.filter((r) => r.effect_pct > 0.05).length;
    // A bulk edit: 20+ pages saved in the same second.
    const byMoment = d3.rollup(all.filter((r) => r.edited_at && (per === 'all' || r.date >= from)), (v) => v.length, (r) => r.edited_at);
    const bulks = [...byMoment].filter(([, c]) => c >= 20).sort((x, y) => y[1] - x[1]);
    const bulkAt = new Set(bulks.map(([at]) => at));
    const nTitle = real.filter((r) => has(r, 'Meta title')).length, nDesc = real.filter((r) => has(r, 'Meta description')).length;
    tiles.replaceChildren(
      tile('Pages edited', new Set(real.map((r) => r.kind + r.id)).size, MS.n(inPeriod.length - real.length) + ' formatting-only edits not counted'),
      tile('Meta titles changed', nTitle, MS.n(nDesc) + ' meta descriptions changed', ''),
      tile('Body content edits', real.filter((r) => has(r, 'Body')).length),
      tileT('Clicks after the edit', measured.length ? MS.n(wentUp) + ' of ' + MS.n(measured.length) : '—', measured.length ? 'pages got more clicks' : 'needs 3 days of data after an edit'),
      tile('Bulk edits', bulks.length, bulks.length ? MS.n(bulks[0][1]) + ' pages at once, ' + MS.fmtDay(String(bulks[0][0]).slice(0, 10)) : '20+ pages saved in the same second', bulks.length ? 'ms-warn' : ''),
      tile('Flags to check', inPeriod.filter((r) => r.flags.length).length, 'title without description, or much shorter', inPeriod.some((r) => r.flags.length) ? 'ms-warn' : ''));
    if (nDesc < nTitle / 2) tiles.children[1].lastChild.className = 'ms-delta ms-warn';
    // Change-type chips with counts.
    const kinds = ['Meta title', 'Meta description', 'Title', 'Target keyword', 'H1', 'Body', 'Formatting', 'Footnote'];
    const base = inPeriod.filter((r) => !(clFmt.checked && (r.changed || []).every((c) => c === 'Formatting')));
    const isF1 = (r) => r.flags.some((f) => f.startsWith('Meta title changed')), isF2 = (r) => r.flags.some((f) => f.startsWith('Much shorter'));
    const isBulk = (r) => bulkAt.has(r.edited_at);
    const chipItems = [['', 'All changes', base.length], ...kinds.map((k) => [k, k, base.filter((r) => has(r, k)).length]).filter((x) => x[2] > 0)];
    chipItems.push(['__f1', '⚑ Meta title changed, description not', base.filter(isF1).length], ['__f2', '⚑ Much shorter', base.filter(isF2).length], ['__bulk', 'Bulk edit', base.filter(isBulk).length]);
    MS.chips(document.getElementById('cl-chips'), chipItems, MS.state.clKind || '', (v) => { MS.state.clKind = v; MS.redraw(); });
    [...document.getElementById('cl-chips').children].forEach((b, i) => { if (String(chipItems[i][0]).startsWith('__f')) b.classList.add('ms-fchip-warn'); });
    const q = clQ.value.trim().toLowerCase();
    const k = MS.state.clKind || '';
    const pick = (r) => !k || (k === '__flag' ? r.flags.length : k === '__f1' ? isF1(r) : k === '__f2' ? isF2(r) : k === '__bulk' ? isBulk(r) : has(r, k));
    const rows = base.filter((r) => pick(r) && (!q || ((r.name || '') + ' ' + (r.path || '')).toLowerCase().includes(q)));
    const shown = MS.limit('cl', rows);
    MS.table(t, shown, [
      { render: (r) => { const s = MS.el('span', null, r.date); s.append(MS.el('span', 'ms-sub', r.kind === 'Article' ? 'Article' : 'Q&A')); return s; } },
      { cls: 'ms-wide', render: (r) => MS.link(r.name || r.path, r.path ? 'https://bloomnest.example' + encodeURI(r.path).replace(/%25/g, '%') : null) },
      { render: (r) => { const s = MS.el('span', 'ms-cl-chg'); (r.changed || []).forEach((c) => s.append(MS.el('span', 'ms-chip ' + chipClass(c), c))); r.flags.forEach((f) => s.append(MS.el('span', 'ms-flag', '⚑ ' + f))); s.append(diffBlock(r)); return s; } },
      { cls: 'num', render: (r) => { const dw = r.words_after - r.words_before; const s = MS.el('span', null, MS.n(r.words_after)); if (dw) s.append(MS.el('span', 'ms-sub ' + (dw > 0 ? 'ms-good' : 'ms-bad'), (dw > 0 ? '+' : '') + MS.n(dw))); return s; } },
      { cls: 'num', render: (r) => {
        if (r.effect_before == null) { const s = MS.el('span', 'ms-sub', r.effect_note || '—'); s.style.whiteSpace = 'normal'; s.style.maxWidth = '12rem'; s.style.display = 'inline-block'; return s; }
        const s = MS.el('span', null, r.effect_before + ' → ' + r.effect_after);
        if (r.effect_pct == null && r.effect_note) s.append(MS.el('span', 'ms-sub', r.effect_note + ' · ' + r.effect_days + ' days after'));
        if (r.effect_pct != null) s.append(MS.el('span', 'ms-sub ' + (r.effect_pct > 0.05 ? 'ms-good' : r.effect_pct < -0.05 ? 'ms-bad' : 'ms-flat'), (r.effect_pct > 0.05 ? '▲ ' : r.effect_pct < -0.05 ? '▼ ' : '') + MS.pct(r.effect_pct) + ' · ' + r.effect_days + ' days after'));
        return s; } },
    ], 'key');
    MS.moreBtn('cl', rows.length);
    document.getElementById('cl-count').textContent = 'Showing ' + shown.length + ' of ' + MS.n(rows.length) + ' edits' + (firstDay ? ' · history from ' + MS.fmtDay(firstDay) : '');
  };

  const claType = document.getElementById('cla-type'), claFmt = document.getElementById('cla-fmt'), claQ = document.getElementById('cla-q');
  [claType, claFmt].forEach((el) => el.addEventListener('change', () => { MS.state.more.cla = false; MS.redraw(); }));
  claQ.addEventListener('input', () => MS.redraw());
  const appEffect = (b, a, pct, days, note, minPct) => {
    if (b == null) { const s = MS.el('span', 'ms-sub', note || '—'); s.style.whiteSpace = 'normal'; s.style.maxWidth = '12rem'; s.style.display = 'inline-block'; return s; }
    const s = MS.el('span', null, MS.n(b) + ' → ' + MS.n(a));
    if (pct != null) s.append(MS.el('span', 'ms-sub ' + (pct > 0.05 ? 'ms-good' : pct < -0.05 ? 'ms-bad' : 'ms-flat'), (pct > 0.05 ? '▲ ' : pct < -0.05 ? '▼ ' : '') + MS.pct(pct) + ' · ' + days + ' days after'));
    else s.append(MS.el('span', 'ms-sub', (note || 'Too small for a % change') + ' · ' + days + ' days after'));
    return s;
  };
  const drawChangelogApp = () => {
    const t = document.getElementById('cla-table'), sum = document.getElementById('cla-summary');
    if (!MS.tableState(t, 'changelog_app_view')) { if (dash.data('changelog_app_view').status === 'error') sum.textContent = '—'; return; }
    const all = MS.byLang(dash.data('changelog_app_view').data).map((r) => ({ ...r, changed: asList(r.changed), flags: asList(r.flags), sections_added: asList(r.sections_added), sections_removed: asList(r.sections_removed) }));
    const latest = all.reduce((m, r) => (r.date > m ? r.date : m), '');
    const firstDay = all.reduce((m, r) => (!m || r.date < m ? r.date : m), '');
    const from = latest ? new Date(Date.parse(latest) - 6 * 864e5).toISOString().slice(0, 10) : '';
    const has = (r, c) => (r.changed || []).includes(c);
    const week = all.filter((r) => r.date >= from);
    const realEdits = week.filter((r) => (r.changed || []).some((c) => c !== 'Formatting'));
    const bulkGroups = new Set(week.filter((r) => r.bulk).map((r) => String(r.edited_at).slice(0, 19)));
    const measured = week.filter((r) => r.impr_before != null && r.impr_before >= 50);
    sum.replaceChildren(MS.el('b', null, 'Last 7 days (' + (from ? MS.fmtDay(from) + ' – ' + MS.fmtDay(latest) : '—') + '): '),
      document.createTextNode(MS.n(new Set(realEdits.map((r) => r.id)).size) + ' articles edited · '),
      MS.el('span', week.some((r) => r.dropped) ? 'ms-bad' : 'ms-flat', MS.n(week.filter((r) => r.dropped).length) + ' dropped from app recommendations after the edit'),
      document.createTextNode(' (of ' + MS.n(measured.length) + ' that can be measured yet) · ' + MS.n(bulkGroups.size) + ' bulk edit' + (bulkGroups.size === 1 ? '' : 's')
        + (bulkGroups.size ? ' (' + [...bulkGroups].map((k) => MS.n(week.find((r) => String(r.edited_at).slice(0, 19) === k).bulk) + ' pages at ' + k.slice(11, 16)).join(', ') + ')' : '')));
    document.getElementById('cla-range').textContent = firstDay ? 'Every saved edit to app articles since ' + MS.fmtDay(firstDay) + '. App data is refreshed on Mondays, so the newest edits wait for their numbers.' : '';
    const typed = all.filter((r) => !claType.value || r.article_kind === claType.value);
    const base = typed.filter((r) => !(claFmt.checked && (r.changed || []).every((c) => c === 'Formatting')));
    const kinds = ['Meta title', 'Meta description', 'Title', 'H1', 'Body', 'Formatting', 'Footnote'];
    const chipItems = [['', 'All changes', base.length], ['__drop', 'Dropped from app', base.filter((r) => r.dropped).length], ['__bulk', 'Bulk edit', base.filter((r) => r.bulk).length],
      ...kinds.map((k) => [k, k, base.filter((r) => has(r, k)).length]).filter((x) => x[2] > 0)];
    MS.chips(document.getElementById('cla-chips'), chipItems, MS.state.claKind || '', (v) => { MS.state.claKind = v; MS.state.more.cla = false; MS.redraw(); });
    const q = claQ.value.trim().toLowerCase(), k = MS.state.claKind || '';
    const rows = base.filter((r) => (!k || (k === '__drop' ? r.dropped : k === '__bulk' ? r.bulk : has(r, k))) && (!q || ((r.name || '') + ' ' + (r.path || '')).toLowerCase().includes(q)));
    const shown = MS.limit('cla', rows);
    MS.table(t, shown, [
      { render: (r) => { const s = MS.el('span', null, r.date); s.append(MS.el('span', 'ms-sub', r.article_kind === 'Web article' ? 'Web' : 'App only')); return s; } },
      { cls: 'ms-wide', render: (r) => { const s = MS.link(r.name || r.path || '#' + r.id, r.path ? 'https://bloomnest.example' + encodeURI(r.path).replace(/%25/g, '%') : null, r.path ? '' : 'App only'); r.flags.forEach((f) => s.append(MS.el('span', 'ms-flag', '⚑ ' + f))); s.append(diffBlock(r)); return s; } },
      { render: (r) => { const s = MS.el('span', 'ms-cl-chg'); (r.changed || []).forEach((c) => s.append(MS.el('span', 'ms-chip ' + chipClass(c), c))); return s; } },
      { cls: 'num', render: (r) => appEffect(r.views_before, r.views_after, r.views_pct, r.days_after, r.note) },
      { cls: 'num', render: (r) => appEffect(r.impr_before, r.impr_after, r.impr_pct, r.days_after, r.note) },
    ], 'key');
    MS.moreBtn('cla', rows.length);
    document.getElementById('cla-count').textContent = 'Showing ' + shown.length + ' of ' + MS.n(rows.length) + ' edits';
  };

  const oldMonth = document.getElementById('old-month'), oldType = document.getElementById('old-type'), oldEffect = document.getElementById('old-effect'), oldQ = document.getElementById('old-q');
  [oldMonth, oldType, oldEffect].forEach((el) => el.addEventListener('change', () => { MS.state.more.old = false; MS.redraw(); }));
  oldQ.addEventListener('input', () => MS.redraw());
  document.querySelectorAll('#old-period [data-days]').forEach((b) => b.addEventListener('click', () => { MS.state.oldDays = b.dataset.days; oldMonth.value = ''; MS.state.more.old = false; MS.redraw(); }));
  const effectCell = (r) => {
    if (r.effect_before == null) { const s = MS.el('span', 'ms-sub', r.effect_note || '—'); s.style.whiteSpace = 'normal'; s.style.maxWidth = '12rem'; s.style.display = 'inline-block'; return s; }
    const s = MS.el('span', null, r.effect_before + ' → ' + r.effect_after);
    if (r.effect_pct != null) s.append(MS.el('span', 'ms-sub ' + (r.effect_pct > 0.05 ? 'ms-good' : r.effect_pct < -0.05 ? 'ms-bad' : 'ms-flat'), (r.effect_pct > 0.05 ? '▲ ' : r.effect_pct < -0.05 ? '▼ ' : '') + MS.pct(r.effect_pct) + ' · ' + r.effect_days + ' days after'));
    else if (r.effect_note) s.append(MS.el('span', 'ms-sub', r.effect_note));
    return s;
  };
  const drawOlder = () => {
    const t = document.getElementById('old-table');
    if (!MS.tableState(t, 'older_view')) return;
    const all = MS.byLang(dash.data('older_view').data);
    const months = [...new Set(all.map((r) => r.last_edited.slice(0, 7)))].sort().reverse();
    if (oldMonth.options.length !== months.length + 1) {
      const cur = oldMonth.value;
      oldMonth.replaceChildren(new Option('All months', ''), ...months.map((m) => new Option(d3.utcFormat('%B %Y')(new Date(m + '-01')), m)));
      oldMonth.value = months.includes(cur) ? cur : '';
    }
    const q = oldQ.value.trim().toLowerCase();
    const days = MS.state.oldDays || 'all';
    document.querySelectorAll('#old-period [data-days]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.days === days && !oldMonth.value)));
    const latest = all.reduce((m, r) => (r.last_edited > m ? r.last_edited : m), '');
    const from = days === 'all' || !latest ? '' : new Date(Date.parse(latest) - (+days - 1) * 864e5).toISOString().slice(0, 10);
    const eff = oldEffect.value;
    const rows = all.filter((r) => (oldMonth.value ? r.last_edited.startsWith(oldMonth.value) : (!from || r.last_edited >= from)) && (!oldType.value || r.kind === oldType.value)
      && (!eff || (eff === 'measured' ? r.effect_before != null : eff === 'up' ? r.effect_pct > 0.05 : r.effect_pct < -0.05))
      && (!q || ((r.name || '') + ' ' + (r.path || '')).toLowerCase().includes(q)));
    const shown = MS.limit('old', rows);
    MS.table(t, shown, [
      { render: (r) => { const s = MS.el('span', null, r.last_edited); s.append(MS.el('span', 'ms-sub', r.kind === 'Article' ? 'Article' : 'Q&A')); return s; } },
      { cls: 'ms-wide', render: (r) => MS.link(r.name || r.path, r.path ? 'https://bloomnest.example' + encodeURI(r.path).replace(/%25/g, '%') : null) },
      { f: 'created' },
      { cls: 'num', render: effectCell },
    ], 'key');
    MS.moreBtn('old', rows.length);
    const measured = rows.filter((r) => r.effect_before != null).length;
    document.getElementById('old-count').textContent = 'Showing ' + shown.length + ' of ' + MS.n(rows.length) + ' pages · ' + MS.n(measured) + ' with clicks before → after';
  };

  const mgQ = document.getElementById('mg-q'), rdKind = document.getElementById('rd-kind');
  mgQ.addEventListener('input', () => MS.redraw());
  rdKind.addEventListener('change', () => MS.redraw());
  const actCls = (a) => (a === 'Merge + 301' ? 'merge' : a === 'Merged' ? 'done' : a.includes('differentiate') ? 'diff' : 'link');
  const pageCell = (title, url, clicks, impr, pos, lang) => {
    const s = MS.link(title, url);
    s.append(MS.el('span', 'ms-pstat', MS.n(clicks || 0) + ' clicks · ' + MS.n(impr || 0) + ' impr.' + (pos != null ? ' · #' + pos : '') + (lang && lang !== 'English' ? ' · ' + lang : '')));
    return s;
  };
  const riQ = document.getElementById('ri-q');
  riQ.addEventListener('input', () => MS.redraw());
  const siteUrl = (path) => 'https://bloomnest.example' + encodeURI(path).replace(/%25/g, '%');
  const drawIdeas = () => {
    const t = document.getElementById('ri-table');
    if (!MS.tableState(t, 'redirect_ideas')) return;
    const all = MS.byLang(dash.data('redirect_ideas').data);
    const counts = d3.rollup(all, (v) => v.length, (r) => r.action);
    MS.chips(document.getElementById('ri-chips'), [['', 'All', all.length], ...['301 to the winner', 'Merge, then 301', 'Fix the title'].filter((k) => counts.get(k)).map((k) => [k, k, counts.get(k)])],
      MS.state.riAction || '', (v) => { MS.state.riAction = v; MS.redraw(); });
    const q = riQ.value.trim().toLowerCase();
    const rows = all.filter((r) => (!MS.state.riAction || r.action === MS.state.riAction) && (!q || (r.title + ' ' + r.path + ' ' + r.winner_title + ' ' + r.winner_path).toLowerCase().includes(q)));
    const shown = MS.limit('ri', rows);
    const cls = (a) => (a === '301 to the winner' ? 'merge' : a === 'Merge, then 301' ? 'diff' : 'link');
    MS.table(t, shown, [
      { render: (r) => { const s = MS.el('span'); const label = r.action === '301 to the winner' ? '301 → #' + r.winner_id : r.action === 'Merge, then 301' ? 'Merge into #' + r.winner_id + ', then 301' : r.action; s.append(MS.el('span', 'ms-act ' + cls(r.action), label)); if (r.group_size > 2) s.append(MS.el('span', 'ms-pstat', r.group_size + ' copies of this title')); return s; } },
      { cls: 'ms-wide', render: (r) => { const s = MS.link(r.winner_title, siteUrl(r.winner_path)); s.append(MS.el('span', 'ms-pstat', 'ID ' + r.winner_id + ' · ' + MS.n(r.winner_clicks) + ' clicks · ' + MS.n(r.winner_impr) + ' impr. · ' + MS.n(r.winner_words) + ' words · created ' + r.winner_created)); return s; } },
      { cls: 'ms-wide', render: (r) => { const s = MS.link(r.title, siteUrl(r.path)); s.append(MS.el('span', 'ms-pstat', 'ID ' + r.id + ' · ' + MS.n(r.clicks) + ' clicks · ' + MS.n(r.impr) + ' impr. · ' + MS.n(r.words) + ' words · created ' + r.created)); return s; } },
      { cls: 'num', render: (r) => MS.el('span', r.overlap >= 0.6 ? 'ms-bad' : r.overlap >= 0.3 ? 'ms-warn' : 'ms-flat', d3.format('.0%')(r.overlap)) },
    ], 'key');
    MS.moreBtn('ri', rows.length);
    document.getElementById('ri-count').textContent = 'Showing ' + shown.length + ' of ' + rows.length + ' pages in ' + new Set(rows.map((r) => r.group)).size + ' duplicate groups';
  };

  const drawMerge = () => {
    drawIdeas();
    const tiles = document.getElementById('mg-tiles');
    const rd0 = dash.data('redirects'), mg = dash.data('merge_candidates');
    const rd = rd0.status === 'ok' ? { ...rd0, data: rd0.data.map((r) => ({ ...r, issues: asList(r.issues), chain: asList(r.chain) })) } : rd0;
    if (rd.status === 'ok' && rd.data.length) document.getElementById('rd-when').textContent = (rd.meta && rd.meta.checked_at) || MS.n(rd.data.length) + ' URLs';
    // Tiles
    if (mg.status === 'ok' && rd.status === 'ok') {
      const m = MS.byLang(mg.data), r = rd.data;
      const has = (x, w) => (x.issues || []).some((i) => String(i).startsWith(w));
      const tile = (label, v, note, bad) => { const d = MS.el('div', 'ms-tile'); d.append(MS.el('span', 'ms-tile-label', label), MS.el('span', 'ms-big' + (bad && v ? ' ms-bad' : ''), MS.n(v))); if (note) d.append(MS.el('span', 'ms-delta ms-flat', note)); return d; };
      const ri = dash.data('redirect_ideas');
      const riRows = ri.status === 'ok' ? MS.byLang(ri.data) : [];
      tiles.replaceChildren(
        tile('Duplicate articles to 301', riRows.filter((x) => x.action !== 'Fix the title').length, MS.n(riRows.filter((x) => x.action === 'Fix the title').length) + ' more only need a new title', true),
        tile('Pairs to merge', m.filter((x) => x.action === 'Merge + 301').length, 'same topic, one page much weaker', true),
        tile('Pairs to differentiate or link', m.filter((x) => x.action.startsWith('Keep both')).length, 'keep both, make them distinct'),
        tile('Broken pages (404)', r.filter((x) => has(x, 'Ends in 4')).length, 'of ' + MS.n(r.length) + ' URLs checked', true),
        tile('Chains and temporary redirects', r.filter((x) => has(x, 'Redirect chain') || has(x, 'Temporary')).length, '2+ hops or 302'));
    } else if (mg.status === 'error' || rd.status === 'error') MS.failed(tiles);
    // Pairs
    const t = document.getElementById('mg-table');
    if (MS.tableState(t, 'merge_candidates')) {
      const all = MS.byLang(mg.data);
      const counts = d3.rollup(all, (v) => v.length, (r) => r.action);
      MS.chips(document.getElementById('mg-chips'), [['', 'All', all.length], ...['Merge + 301', 'Keep both, differentiate', 'Keep both, link', 'Merged'].filter((k) => counts.get(k)).map((k) => [k, k, counts.get(k)])],
        MS.state.mgAction || '', (v) => { MS.state.mgAction = v; MS.redraw(); });
      const q = mgQ.value.trim().toLowerCase();
      const rows = all.filter((r) => (!MS.state.mgAction || r.action === MS.state.mgAction) && (!q || (r.winner_title + ' ' + r.loser_title + ' ' + r.top_queries).toLowerCase().includes(q)));
      const shown = MS.limit('mg', rows);
      MS.table(t, shown, [
        { render: (r) => { const s = MS.el('span'); s.append(MS.el('span', 'ms-act ' + actCls(r.action), r.action)); const d = MS.el('details'); d.append(MS.el('summary', null, 'Why'), MS.el('p', null, r.why)); s.append(d); return s; } },
        { cls: 'ms-wide', render: (r) => pageCell(r.winner_title, r.winner_url, r.winner_clicks, r.winner_impr, r.winner_pos, r.winner_lang) },
        { cls: 'ms-wide', render: (r) => { const s = pageCell(r.loser_title, r.loser_url, r.loser_clicks, r.loser_impr, r.loser_pos, r.loser_lang); s.append(MS.el('span', 'ms-pstat', Math.round(r.loser_share * 100) + '% of its impressions are from the shared searches')); return s; } },
        { cls: 'num', render: (r) => { const s = MS.el('span', null, MS.n(r.shared_impr)); const d = MS.el('details'); d.append(MS.el('summary', null, r.shared_queries + ' searches')); const ul = MS.el('ul', 'ms-qlist'); r.top_queries.split(' · ').forEach((x) => ul.append(MS.el('li', null, x))); d.append(ul); s.append(d); return s; } },
      ], 'pair');
      MS.moreBtn('mg', rows.length);
      document.getElementById('mg-count').textContent = 'Showing ' + shown.length + ' of ' + rows.length + ' pairs';
    }
    // Problems
    const rt = document.getElementById('rd-table');
    if (MS.tableState(rt, 'redirects')) {
      const probs = rd.data.filter((r) => (r.issues || []).length);
      const kinds = [...new Set(probs.flatMap((r) => r.issues.map((i) => String(i).split(' (')[0])))].sort();
      const cur = rdKind.value;
      rdKind.replaceChildren(new Option('All problems', ''), ...kinds.map((k) => new Option(k)));
      rdKind.value = kinds.includes(cur) ? cur : '';
      const rows = probs.filter((r) => !rdKind.value || r.issues.some((i) => String(i).startsWith(rdKind.value)));
      const dec = (u) => { try { return decodeURIComponent(u); } catch (e) { return u; } };
      const fix = (r) => r.issues.some((i) => String(i).startsWith('Ends in 404')) ? 'Fix the page or 301 it to the closest live page' : r.issues.some((i) => String(i).startsWith('Temporary')) ? 'Change the 302 to a 301' : r.issues.some((i) => String(i).startsWith('Redirect chain')) ? 'Point the first URL straight to the final one' : r.issues.some((i) => String(i).startsWith('Redirects to the homepage')) ? 'Redirect to the closest matching page instead' : 'Check the URL';
      MS.table(rt, rows, [
        { render: (r) => { const s = MS.el('span', 'ms-bad', r.issues.join(' · ')); s.append(MS.el('span', 'ms-sub', fix(r))); return s; } },
        { cls: 'ms-wide', render: (r) => MS.path('https://bloomnest.example' + encodeURI(r.path)) || r.path },
        { render: (r) => (r.chain || []).join(' → ') },
        { cls: 'ms-wide', render: (r) => (r.hops ? MS.path('https://bloomnest.example' + encodeURI(dec(r.final_url).slice('https://bloomnest.example'.length))) || r.final_url : '—') },
        { f: 'reason' },
      ], 'path');
      document.getElementById('rd-count').textContent = rows.length + ' problems out of ' + MS.n(rd.data.length) + ' URLs checked';
    }
    // After the merge
    const ab = document.getElementById('mg-after-body');
    const ad = dash.data('article_daily');
    if (mg.status === 'ok' && ad.status === 'ok') {
      const merged = mg.data.filter((r) => r.action === 'Merged');
      if (!merged.length) { ab.replaceChildren(MS.el('p', 'ms-note', 'No merges yet. When a "Merge + 301" pair is merged and the weaker page 301-redirects to the stronger one, it shows here with the stronger page\'s daily clicks.')); }
      else {
        const byPage = d3.group(ad.data, (r) => r.page);
        const table = MS.el('table');
        const hr = document.createElement('tr'); ['Kept page', 'Redirected page', 'Clicks per week, last 4 weeks'].forEach((h) => hr.append(MS.el('th', null, h)));
        const th = document.createElement('thead'); th.append(hr);
        const tb = document.createElement('tbody');
        for (const r of merged) {
          const days = (byPage.get(r.winner_page) || []).slice().sort((a, b) => d3.ascending(a.date, b.date));
          const weeks = []; for (let i = days.length; i > 0 && weeks.length < 4; i -= 7) weeks.unshift(d3.sum(days.slice(Math.max(0, i - 7), i), (d) => d.clicks));
          const tr = document.createElement('tr'); tr.dataset.key = r.pair;
          const c1 = document.createElement('td'); c1.className = 'ms-wide'; c1.append(MS.link(r.winner_title, r.winner_url));
          const c2 = document.createElement('td'); c2.className = 'ms-wide'; c2.append(MS.link(r.loser_title, r.loser_url));
          const c3 = document.createElement('td'); c3.textContent = weeks.length ? weeks.map((w) => MS.n(w)).join(' → ') : '—';
          tr.append(c1, c2, c3); tb.append(tr);
        }
        table.append(th, tb);
        const wrap = MS.el('div', 'ms-scroll'); wrap.append(table); ab.replaceChildren(wrap);
      }
    }
  };

  // Web / App switch on Overview and Last week review (the same choice on both).
  MS.state.channel = MS.state.channel || 'web';
  document.querySelectorAll('[data-chan]').forEach((b) => b.addEventListener('click', () => {
    MS.state.channel = b.dataset.chan;
    MS.state.more.alw = MS.state.more.aui = MS.state.more.ap = MS.state.more.cla = false;
    MS.redraw();
  }));
  const syncChannel = () => {
    for (const id of ['overview', 'this-week', 'last-week', 'changelog', 'merge', 'keywords', 'indexing']) document.getElementById(id).dataset.channel = MS.state.channel;
    document.querySelectorAll('[data-chan]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.chan === MS.state.channel)));
    document.getElementById('ov-title').textContent = MS.state.channel === 'app' ? 'App scorecard' : 'Scorecard';
  };
  MS.redraw = () => {
    syncChannel();
    MS.drawHeader();
    if (MS.current === 'this-week') MS.drawWeek();
    if (MS.current === 'merge') { drawMerge(); MS.drawNometa(); }
    if (MS.current === 'last-week') drawReview();
    if (MS.current === 'overview') drawOverview();
    if (MS.current === 'keywords') drawKeywords();
    if (MS.current === 'changelog') { if (MS.state.channel === 'app') drawChangelogApp(); else { drawChangelog(); drawOlder(); } }
    if (MS.current === 'indexing') drawIndexing();
  };
  dash.onData(() => MS.redraw());
  const named = location.hash.slice(1);
  if (named && document.getElementById(named)) {
    const page = document.getElementById(named).closest('.ms-page');
    if (page) MS.show(page.id);
  }

})();
