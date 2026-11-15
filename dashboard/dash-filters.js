/*
 * dash-filters.js — filters that the original SQL applied with a {{week_start}} parameter.
 * Here the files hold several weeks, and the rows of the picked week are kept in the browser.
 */
(function () {
  'use strict';
  const mondayOf = (ts) => {
    const d = new Date(String(ts).slice(0, 10) + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  };
  const byWeek = (rows, params) => {
    const weeks = [...new Set(rows.map((r) => mondayOf(r.at)))].sort();
    const pick = params.week_start || weeks[weeks.length - 1];
    return rows.filter((r) => mondayOf(r.at) === pick);
  };
  window.DASH_FILTERS = window.DASH_FILTERS || {};
  window.DASH_FILTERS.content_lastweek = byWeek;
  window.DASH_FILTERS.app_content_lastweek = byWeek;
})();
