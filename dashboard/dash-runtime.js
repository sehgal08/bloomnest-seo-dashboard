/*
 * dash-runtime.js — a small stand-in for the dashboard host this page was first written for.
 *
 * The page talks to a global `dash` object:
 *   dash.data(id)        -> { status, data, columns, message, refreshing, meta }
 *   dash.onData(fn)      -> fn() runs now and after every data / filter / width change
 *   dash.calc(id, spec)  -> a value derived from other datasets ({ inputs, fn })
 *   dash.loader(id, spec)-> how a live query's answer becomes rows (not needed here: files are rows already)
 *   dash.params(), dash.setParams(obj), dash.resetParams() -> page filters
 *   dash.setLink(name), dash.refresh(id), dash.colors
 *
 * Here every dataset is a static JSON file in ../data/<id>.json (an array of row objects).
 * A dataset listed in FILTERS is narrowed in the browser by the current filter values, the way its
 * SQL used a {{parameter}} in the original version.
 */
(function () {
  'use strict';

  const DATA_DIR = (document.currentScript && document.currentScript.dataset.dataDir) || '../data';
  const DEFAULT_PARAMS = {};
  // datasetId -> (rows, params) => rows ; filled in by dash-filters.js when a dataset needs one
  const FILTERS = (window.DASH_FILTERS = window.DASH_FILTERS || {});

  const raw = new Map();      // id -> { status, rows, message }
  const calcs = new Map();    // id -> { inputs, fn, title, description }
  const listeners = [];
  let params = Object.assign({}, DEFAULT_PARAMS);
  let scheduled = false;

  const colors = Array.from({ length: 8 }, (_, i) => `var(--dash-c${i})`);

  function load(id) {
    if (raw.has(id)) return;
    raw.set(id, { status: 'loading', rows: [] });
    fetch(`${DATA_DIR}/${id}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`${id}.json: HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        const rows = Array.isArray(json) ? json : json.rows || json.data || json.results || [];
        raw.set(id, { status: 'ok', rows });
      })
      .catch((e) => {
        raw.set(id, { status: calcs.has(id) ? 'ok' : 'missing', rows: [], message: String(e.message || e) });
        console.warn('[dash] could not load', id, e);
      })
      .finally(schedule);
  }

  function columnsOf(rows) {
    const seen = new Set();
    for (const r of rows.slice(0, 50)) if (r && typeof r === 'object') Object.keys(r).forEach((k) => seen.add(k));
    return [...seen];
  }

  function wrap(status, data, message) {
    const columns = Array.isArray(data) ? columnsOf(data) : [];
    return { status, data, rows: data, columns, value: data, message, refreshing: false, meta: [] };
  }

  const calcCache = new Map();
  function runCalc(id, stack) {
    const spec = calcs.get(id);
    if (stack.includes(id)) return wrap('error', [], 'circular calc ' + stack.concat(id).join(' -> '));
    const inputs = [];
    for (const inp of spec.inputs || []) {
      const d = get(inp, stack.concat(id));
      if (d.status !== 'ok') return wrap(d.status === 'missing' ? 'error' : d.status, [], d.message);
      inputs.push(d.data);
    }
    const key = JSON.stringify(params) + '|' + inputs.map((x) => (Array.isArray(x) ? x.length : typeof x)).join(',');
    const hit = calcCache.get(id);
    if (hit && hit.key === key && hit.inputs.every((x, i) => x === inputs[i])) return hit.result;
    let result;
    try {
      result = wrap('ok', spec.fn(...inputs));
    } catch (e) {
      console.error('[dash] calc failed:', id, e);
      result = wrap('error', [], String(e.message || e));
    }
    calcCache.set(id, { key, inputs, result });
    return result;
  }

  const filtered = new Map(); // id -> { key, rows, out }
  function get(id, stack = []) {
    if (calcs.has(id)) return runCalc(id, stack);
    load(id);
    const r = raw.get(id);
    if (r.status !== 'ok') return wrap(r.status, [], r.message);
    const f = FILTERS[id];
    if (!f) return wrap('ok', r.rows);
    const key = JSON.stringify(params);
    const hit = filtered.get(id);
    if (hit && hit.key === key && hit.rows === r.rows) return hit.out;
    const out = wrap('ok', f(r.rows, params));
    filtered.set(id, { key, rows: r.rows, out });
    return out;
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      for (const fn of listeners) {
        try { fn(); } catch (e) { console.error('[dash] onData callback failed', e); }
      }
    });
  }

  window.addEventListener('resize', (() => {
    let t;
    return () => { clearTimeout(t); t = setTimeout(schedule, 120); };
  })());

  window.dash = {
    data: (id) => get(id),
    onData(fn) {
      listeners.push(fn);
      try { fn(); } catch (e) { console.error('[dash] onData callback failed', e); }
    },
    calc(id, spec) { calcs.set(id, spec); calcCache.delete(id); schedule(); },
    loader() { /* the static files are already rows */ },
    params: () => Object.assign({}, params),
    setParams(obj) { params = Object.assign({}, params, obj); schedule(); },
    resetParams() { params = Object.assign({}, DEFAULT_PARAMS); schedule(); },
    setDefaults(obj) { Object.assign(DEFAULT_PARAMS, obj); params = Object.assign({}, DEFAULT_PARAMS, params); },
    setLink(name) { try { history.replaceState(null, '', '#' + name); } catch (e) { /* ignore */ } },
    refresh: () => schedule(),
    colors,
  };
})();
