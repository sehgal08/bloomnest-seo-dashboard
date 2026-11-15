(() => {

  // ---------- calculations (readers can open each one in Sources) ----------
  // (The original version turned live SQL answers into rows here. The demo reads JSON files, so nothing is needed.)

  dash.calc('kpis', {
    title: 'Search totals for the last 7, 14, 21 and 28 days',
    description: 'For each period length: clicks and impressions summed per page group over the latest days in the daily trend and over the same number of days before; CTR is clicks ÷ impressions and position is impression-weighted.',
    inputs: ['daily_trend'],
    fn: (daily_trend) => {
      const dates = [...new Set(daily_trend.map((r) => r.date))].sort();
      const out = [];
      for (const days of [7, 14, 21, 28]) {
        const last = new Set(dates.slice(-days)), prev = new Set(dates.slice(-2 * days, -days));
        const period = dates.slice(-days)[0] + ' to ' + dates[dates.length - 1];
        for (const seg of ['Whole site', 'Articles', 'Community Q&A']) {
          const sum = (set) => {
            const rows = daily_trend.filter((r) => r.segment === seg && set.has(r.date));
            const c = rows.reduce((a, r) => a + r.clicks, 0), i = rows.reduce((a, r) => a + r.impressions, 0);
            const p = i ? rows.reduce((a, r) => a + r.position * r.impressions, 0) / i : null;
            return { clicks: c, impressions: i, ctr: i ? (c / i) * 100 : null, position: p };
          };
          const a = sum(last), b = sum(prev);
          for (const m of ['clicks', 'impressions', 'ctr', 'position']) {
            out.push({ key: seg + '|' + m + '|' + days, segment: seg, metric: m, days, period,
              value: a[m] == null ? null : Math.round(a[m] * 100) / 100, previous: b[m] == null ? null : Math.round(b[m] * 100) / 100,
              change_pct: a[m] != null && b[m] ? Math.round(((a[m] - b[m]) / b[m]) * 1000) / 1000 : null,
              change_abs: a[m] != null && b[m] != null ? Math.round((a[m] - b[m]) * 100) / 100 : null });
          }
        }
      }
      return out;
    },
  });

  dash.calc('article_actions', {
    title: 'Article fixes, by priority',
    description: 'Puts each article page with 300+ impressions into one fix type and estimates the extra clicks per 28 days a fix could bring.',
    inputs: ['articles_pages', 'query_pages', 'indexing'],
    fn: (articles_pages, query_pages, indexing) => {
      // Typical CTR at each position = the median CTR of our own article pages in that position band.
      const bands = [1.5, 2.5, 3.5, 5.5, 7.5, 10, 15, 20, Infinity];
      const band = (p) => bands.findIndex((b) => p <= b);
      const typical = bands.map((_, i) => d3.median(articles_pages.filter((r) => r.impr_28d >= 300 && r.pos_28d != null && band(r.pos_28d) === i), (r) => r.ctr_28d) || 0);
      const exp = (p) => Math.round(typical[band(p)] * 100) / 100;
      const idx = new Map(indexing.map((i) => [i.url, i]));
      const byPage = d3.group(query_pages, (r) => r.page);
      const recent = Date.now() - 14 * 864e5;
      const levels = ['High', 'Medium', 'Low'];
      const out = [];
      for (const r of articles_pages) {
        if (r.impr_28d < 300 || r.pos_28d == null) continue;
        const q = r.top_query ? '“' + r.top_query + '”' : 'its main search';
        const more = (byPage.get(r.page) || []).filter((x) => x.position > 3 && x.query !== r.top_query)
          .sort((a, b) => b.impr_28d - a.impr_28d).slice(0, 3).map((x) => '“' + x.query + '” (#' + x.position + ')');
        const ix = r.url ? idx.get(r.url) : null;
        let bucket, gain, why, fix;
        if (ix && !ix.indexed) {
          bucket = 'Not indexed'; gain = r.clicks_28d;
          why = 'URL inspection: ' + ix.coverage + '.'; fix = 'Fix the cause, then request indexing in Search Console.';
        } else if (r.clicks_week_before >= 40 && r.clicks_last_week <= 0.75 * r.clicks_week_before) {
          bucket = 'Losing clicks'; gain = (r.clicks_week_before - r.clicks_last_week) * 4;
          why = 'Clicks fell from ' + r.clicks_week_before + ' to ' + r.clicks_last_week + ' week over week (position ' + r.pos_week_before + ' → ' + r.pos_last_week + ').';
          fix = 'Refresh it: update facts and the year, expand the part that answers ' + q + ', and check which result now outranks it.';
        } else if (r.pos_28d <= 10 && r.impr_28d >= 500 && r.ctr_28d < 0.5 * exp(r.pos_28d)) {
          bucket = 'Fix title & meta'; gain = (r.impr_28d * (exp(r.pos_28d) - r.ctr_28d)) / 100;
          why = 'Position ' + r.pos_28d + ' but CTR is ' + r.ctr_28d + '% against ' + exp(r.pos_28d) + '% typical for our pages at that position.';
          fix = 'Rewrite the title and meta description around ' + q + ': lead with the benefit or a number, add the current year, keep the title under 60 characters.';
        } else if (r.pos_28d > 3.5 && r.pos_28d <= 15 && r.impr_28d >= 1000) {
          const target = Math.max(3, r.pos_28d - 3);
          bucket = 'Move up'; gain = Math.max(0, (r.impr_28d * (exp(target) - r.ctr_28d)) / 100);
          why = 'Average position ' + r.pos_28d + ' with ' + r.impr_28d + ' impressions' + (r.top_query_pos ? '; #' + r.top_query_pos + ' for ' + q : '') + '.';
          fix = more.length ? 'Add sections that answer ' + more.join(', ') + ', then link to the page from 3–5 related articles.'
            : 'Answer ' + q + ' in the first 100 words, add an FAQ block, and link to the page from 3–5 related articles.';
        } else if (r.pos_28d > 15 && r.impr_28d >= 3000) {
          bucket = 'Rework for intent'; gain = Math.max(0, (r.impr_28d * (exp(10) - r.ctr_28d)) / 100);
          why = 'Google shows it ' + r.impr_28d + ' times at position ' + r.pos_28d + ': seen as relevant, not as the best answer.';
          fix = 'Compare with the top 3 results for ' + q + ' and rework the headings and intro to match what they cover.';
        } else continue;
        const edited = r.updated_at && Date.parse(r.updated_at) >= recent;
        if (edited && bucket !== 'Not indexed') why += ' Edited ' + r.updated_at + ', so give it time.';
        out.push({ page: r.page, title: r.title, link: r.url || r.gsc_link, url_status: r.url_status, language: r.language, bucket, priority: null,
          est_extra_clicks: Math.round(gain), why, fix, impr_28d: r.impr_28d, clicks_28d: r.clicks_28d, ctr_28d: r.ctr_28d, pos_28d: r.pos_28d,
          top_query: r.top_query, updated_at: r.updated_at, edited_recently: !!edited });
      }
      // High = top 10% of payoffs, Medium = next 25%; not indexed is always High; a recent edit drops one level.
      const gains = out.map((o) => o.est_extra_clicks).sort((a, b) => b - a);
      const hi = gains[Math.floor(gains.length * 0.1)] ?? Infinity, mid = gains[Math.floor(gains.length * 0.35)] ?? Infinity;
      for (const o of out) {
        let lvl = o.bucket === 'Not indexed' ? 0 : o.est_extra_clicks > hi ? 0 : o.est_extra_clicks > mid ? 1 : 2;
        if (o.edited_recently && o.bucket !== 'Not indexed') lvl = Math.min(2, lvl + 1);
        o.priority = levels[lvl];
      }
      return out.sort((a, b) => levels.indexOf(a.priority) - levels.indexOf(b.priority) || b.est_extra_clicks - a.est_extra_clicks);
    },
  });

  dash.calc('qa_actions', {
    title: 'Q&A fixes, by priority',
    description: 'Puts each curated question page (and other question pages with 100+ impressions) into one fix type, using its 28-day search numbers, age and indexing status.',
    inputs: ['qa_pages', 'indexing'],
    fn: (qa_pages, indexing) => {
      const exp = (p) => p <= 1.5 ? 28 : p <= 2.5 ? 16 : p <= 3.5 ? 11 : p <= 4.5 ? 8 : p <= 5.5 ? 6 : p <= 7 ? 4.5 : p <= 10 ? 3 : p <= 15 ? 1.5 : 0.8;
      const idx = new Map(indexing.map((i) => [i.url, i]));
      const levels = ['High', 'Medium', 'Low'];
      const out = [];
      for (const r of qa_pages) {
        if (!r.curated && r.impr_28d < 100) continue;
        const ix = r.url ? idx.get(r.url) : null;
        const age = r.created_at ? Math.round((Date.now() - Date.parse(r.created_at)) / 864e5) : null;
        const target = r.target_keyword ? '“' + r.target_keyword + '”' : 'the question';
        let bucket, priority, why, fix;
        if (ix && !ix.indexed) {
          bucket = 'Not indexed'; priority = age != null && age <= 7 ? 'Medium' : 'High';
          why = 'URL inspection: ' + ix.coverage + '.';
          fix = 'Request indexing in Search Console and link to it from 2–3 related articles so Google finds it.';
        } else if (r.impr_28d === 0) {
          bucket = 'No impressions yet'; priority = age == null || age > 21 ? 'High' : age > 7 ? 'Medium' : 'Low';
          why = (age != null ? 'Live ' + age + ' days' : 'Live') + ', no Google impressions in 28 days' + (ix ? ' though indexed.' : '.');
          fix = ix ? 'Indexed but not ranking: put ' + target + ' in the title and first line, give a fuller answer (150+ words with an expert view) and add FAQ markup.'
            : 'Check indexing, request it in Search Console, and link to it from a related article.';
        } else if (r.pos_28d <= 3.5 && r.ctr_28d < 0.6 * exp(r.pos_28d)) {
          bucket = 'Fix title & meta'; priority = r.impr_28d >= 500 ? 'High' : r.impr_28d >= 100 ? 'Medium' : 'Low';
          why = 'Ranks #' + r.pos_28d + ' but CTR is ' + r.ctr_28d + '%.';
          fix = 'Rewrite the title as the question parents type' + (r.top_query ? ' (“' + r.top_query + '”)' : '') + ' and make the meta description give the short answer.';
        } else if (r.pos_28d > 3.5) {
          bucket = 'Push up'; priority = r.impr_28d >= 500 ? 'High' : r.impr_28d >= 100 ? 'Medium' : 'Low';
          why = 'Average position ' + r.pos_28d + ' with ' + r.impr_28d + ' impressions' + (r.top_query ? ', mostly for “' + r.top_query + '”' : '') + '.';
          fix = 'Expand the answer to cover ' + (r.top_query ? '“' + r.top_query + '”' : target) + ' directly, add an expert answer, and link to it from the matching article.';
        } else continue;
        if (r.target_keyword && r.top_query && r.top_query !== r.target_keyword) why += ' Target was ' + target + '.';
        out.push({ page: r.page, title: r.title, link: r.url || r.gsc_link, language: r.language, curated: r.curated, target_keyword: r.target_keyword, bucket, priority, why, fix,
          impr_28d: r.impr_28d, clicks_28d: r.clicks_28d, pos_28d: r.pos_28d, age_days: age });
      }
      return out.sort((a, b) => levels.indexOf(a.priority) - levels.indexOf(b.priority) || b.impr_28d - a.impr_28d || (b.age_days || 0) - (a.age_days || 0));
    },
  });

  dash.calc('qa_funnel', {
    title: 'Q&A funnel',
    description: 'Curated pages that are published, indexed (of those inspected), getting Google impressions and getting clicks in the last 28 days, per language and for all.',
    inputs: ['qa_pages', 'indexing'],
    fn: (qa_pages, indexing) => {
      const idx = new Map(indexing.map((i) => [i.url, i]));
      const cur = qa_pages.filter((r) => r.curated);
      const langs = ['All', ...new Set(cur.map((r) => r.language))];
      const out = [];
      for (const lang of langs) {
        const rows = lang === 'All' ? cur : cur.filter((r) => r.language === lang);
        const checked = rows.filter((r) => idx.has(r.url));
        const steps = [
          ['Published', rows.length, rows.length],
          ['Indexed', checked.filter((r) => idx.get(r.url).indexed).length, checked.length],
          ['Getting impressions', rows.filter((r) => r.impr_28d > 0).length, rows.length],
          ['Getting clicks', rows.filter((r) => r.clicks_28d > 0).length, rows.length],
        ];
        steps.forEach(([stage, value, base], i) => out.push({ key: stage + '|' + lang, stage, step: i + 1, language: lang, value, base }));
      }
      return out;
    },
  });

  dash.calc('keyword_actions', {
    title: 'What to do for each trending search',
    description: 'Merges rising searches that are the same words in another order or with a language word added, skips off-brand (adult) searches, and matches each to the page of ours with the most impressions for it over 28 days (whole-site search × page pull, any page type; the article/Q&A page pairs when the whole-site pull has no row) to pick improve, rework, defend or create.',
    inputs: ['keyword_movers', 'site_query_pages', 'query_pages', 'articles_pages', 'qa_pages'],
    fn: (keyword_movers, site_query_pages, query_pages, articles_pages, qa_pages) => {
      const titles = new Map([...articles_pages, ...qa_pages].map((p) => [p.page, p.title]));
      // Pages per search: whole site first (title and type included), article/Q&A page pairs only for searches it lacks.
      const byQ = new Map();
      for (const r of site_query_pages || []) {
        const k = String(r.query).toLowerCase();
        if (!byQ.has(k)) byQ.set(k, []);
        byQ.get(k).push({ page: r.page, url: r.url || r.gsc_link || null, title: r.title, content_type: r.type, impr: Number(r.impr_28d), position: Number(r.position) });
      }
      for (const [q, rows] of d3.group(query_pages, (r) => String(r.query).toLowerCase())) {
        if (byQ.has(q)) continue;
        byQ.set(q, rows.map((r) => ({ page: r.page, url: r.url, title: titles.get(r.page) || null, content_type: r.content_type, impr: Number(r.impr_28d), position: Number(r.position) })));
      }
      const question = /\b(kya|kaise|kab|can|is|how|what|why|when|sakte|safe|during|me|mein)\b/i;
      const offBrand = /\b(hot|sexy|bold|adult|18\+|uncut|xxx|nude|kissing)\b/i;
      // "baby sleep tips", "tips baby sleep" and "baby sleep tips hindi" are one search idea.
      const filler = new Set(['in', 'hindi', 'english', 'tamil', 'telugu', 'marathi', 'bengali', 'for', 'the', 'of', 'a', 'to', 'ki', 'ka', 'ke', 'list', 'best', 'top', '2025', '2026', 'tablet']);
      const idea = (q) => [...new Set(q.toLowerCase().split(/\s+/).filter((w) => w && !filler.has(w)))].sort().join(' ') || q.toLowerCase();
      const out = [];
      for (const [, group] of d3.group(keyword_movers, (m) => idea(m.query))) {
        const g = group.slice().sort((a, b) => b.impr_last_week - a.impr_last_week);
        const m = g[0];
        const impr = d3.sum(g, (r) => r.impr_last_week), before = d3.sum(g, (r) => r.impr_week_before);
        // The main search's own pages first; merged variants only when it has none.
        const own = byQ.get(String(m.query).toLowerCase()) || [];
        const pages = (own.length ? own : g.flatMap((r) => byQ.get(String(r.query).toLowerCase()) || [])).slice().sort((a, b) => b.impr - a.impr || a.position - b.position);
        const best = pages[0];
        const type = question.test(m.query) ? 'Community Q&A' : 'Article';
        const name = best ? titles.get(best.page) || best.title || best.page : null;
        // Baby name, product, tool, category and home pages: fix the page's title and description, not article headings.
        const other = best && !['Article', 'Q&A', 'Community Q&A', 'Article (SEO)'].includes(best.content_type);
        const kindName = other ? best.content_type.toLowerCase() + ' page ' : '';
        let action, fix;
        if (offBrand.test(m.query)) {
          action = 'Skip'; fix = 'Adult-leaning search that does not fit a parenting brand. Do not create content for it' + (name ? '; “' + name + '” already gets this traffic.' : '.');
        } else if (best && best.position <= 3) {
          action = 'Defend'; fix = 'Already #' + best.position + ' with ' + (other ? 'our ' + kindName : '') + '“' + name + '”. Refresh it and make sure the title names this search.';
        } else if (other && best.position <= 20) {
          action = 'Improve'; fix = 'Our ' + kindName + '“' + name + '” is #' + best.position + '. Put “' + m.query + '” in its title and meta description; if people want more than this page gives, add an article and link it from here.';
        } else if (other) {
          action = 'Rework page'; fix = 'Only our ' + kindName + '“' + name + '” shows, at #' + best.position + '. Rework its title and description around “' + m.query + '”, or create an article for it.';
        } else if (best && best.position <= 20) {
          action = 'Improve'; fix = 'Add an H2 that answers “' + m.query + '” to “' + name + '” (now #' + best.position + ') and use the phrase in the meta description.';
        } else if (best) {
          action = 'Rework page'; fix = '“' + name + '” ranks only #' + best.position + '. Rework its headings and intro around “' + m.query + '” before writing anything new.';
        } else if (m.pos_last_week <= 15) {
          action = 'Improve'; fix = 'A page of ours ranks #' + m.pos_last_week + ' for it. Find it in Search Console and add a section that answers this search directly.';
        } else {
          action = 'Create new'; fix = 'Nothing of ours ranks for it. Create a new ' + type.toLowerCase() + ' built around “' + m.query + '”.';
        }
        out.push({ query: m.query, variants: g.slice(1).map((r) => r.query).join(' · '), action, content_type: best ? best.content_type : type,
          page: best ? best.page : null, page_title: name, link: best ? best.url : null, page_type: best ? best.content_type : null, fix, impr_last_week: impr, impr_week_before: before,
          growth_pct: before ? Math.round((impr / before - 1) * 100) / 100 : null, pos_last_week: m.pos_last_week });
      }
      return out.sort((a, b) => (a.action === 'Skip') - (b.action === 'Skip') || b.impr_last_week - a.impr_last_week);
    },
  });

  dash.calc('cannibalization', {
    title: 'Searches split across our pages',
    description: 'Groups the 28-day query × page rows by search and keeps searches with 500+ impressions where 2+ pages each take 15%+.',
    inputs: ['query_pages', 'articles_pages', 'qa_pages'],
    fn: (query_pages, articles_pages, qa_pages) => {
      const titles = new Map([...articles_pages, ...qa_pages].map((p) => [p.page, p.title]));
      const out = [];
      for (const [query, rows] of d3.group(query_pages, (r) => r.query)) {
        const total = d3.sum(rows, (r) => r.impr_28d);
        const split = rows.filter((r) => r.impr_28d / total >= 0.15);
        if (total < 500 || split.length < 2 || query.length < 6) continue;
        out.push({ query, page_count: split.length, impr_28d: total, best_position: d3.min(split, (r) => r.position),
          pages: split.sort((a, b) => a.position - b.position).map((r) => (titles.get(r.page) || r.page) + ' (#' + r.position + ', ' + Math.round((r.impr_28d / total) * 100) + '%)').join(' · ') });
      }
      return out.sort((a, b) => b.impr_28d - a.impr_28d);
    },
  });

  dash.calc('index_summary', {
    title: 'Indexing by content type',
    description: 'Counts inspected, indexed and not-indexed pages per content type, with the most common reason Google gives.',
    inputs: ['indexing'],
    fn: (indexing) => d3.rollups(indexing, (rows) => {
      const bad = rows.filter((r) => !r.indexed);
      const top = d3.greatest(d3.rollups(bad, (v) => v.length, (r) => r.coverage), (d) => d[1]);
      return { inspected: rows.length, indexed: rows.length - bad.length, not_indexed: bad.length, top_reason: top ? top[0] : null };
    }, (r) => r.content_type).map(([content_type, v]) => ({ content_type, ...v })),
  });

  dash.calc('week_summary', {
    title: 'This week at a glance',
    description: 'Counts for the summary tiles, per language and for all: high-priority articles, Q&A pages with no impressions, new-content ideas from trending searches, and pages not indexed.',
    inputs: ['article_actions', 'qa_actions', 'keyword_actions', 'indexing'],
    fn: (article_actions, qa_actions, keyword_actions, indexing) => {
      const lang = (p) => ({ hi: 'Hindi', ta: 'Tamil', te: 'Telugu', mr: 'Marathi', bn: 'Bengali' })[p.split('/')[1]] || 'English';
      const langs = ['All', ...new Set([...article_actions, ...qa_actions].map((r) => r.language))];
      const ideas = keyword_actions.filter((k) => k.action === 'Create new').length;
      return langs.flatMap((L) => {
        const f = (r) => L === 'All' || r.language === L;
        return [
          { key: 'high_articles', language: L, value: article_actions.filter((r) => f(r) && r.priority === 'High').length },
          { key: 'silent_qa', language: L, value: qa_actions.filter((r) => f(r) && r.bucket === 'No impressions yet').length },
          { key: 'new_content', language: L, value: ideas },
          { key: 'not_indexed', language: L, value: indexing.filter((r) => !r.indexed && (L === 'All' || lang(r.page) === L)).length },
        ];
      });
    },
  });

  dash.calc('coverage_summary', {
    title: 'Articles in Google search, by language',
    description: 'Counts SEO articles that got Google impressions in 28 days, got none, or cannot be told apart because Search Console cut their URL, per language and for all.',
    inputs: ['article_coverage'],
    fn: (article_coverage) => {
      const langs = ['All', ...new Set(article_coverage.map((r) => r.language))];
      return langs.map((language) => {
        const rows = language === 'All' ? article_coverage : article_coverage.filter((r) => r.language === language);
        const n = (st) => rows.filter((r) => r.search_status === st).length;
        return { language, total: rows.length, in_google: n('In Google'), unclear: n('Unclear'), no_impressions: n('No impressions') };
      }).sort((a, b) => (a.language === 'All' ? -1 : b.language === 'All' ? 1 : b.total - a.total));
    },
  });

  dash.calc('coverage_by_year', {
    title: 'Articles with no impressions, by year created',
    description: 'Per year an SEO article was created (and per language): how many there are and how many got no Google impressions in 28 days.',
    inputs: ['article_coverage'],
    fn: (article_coverage) => {
      const out = [];
      for (const [key, rows] of d3.group(article_coverage, (r) => r.created_at.slice(0, 4) + '|' + r.language)) {
        const [year, language] = key.split('|');
        out.push({ year, language, total: rows.length, no_impressions: rows.filter((r) => r.search_status === 'No impressions').length });
      }
      return out.sort((a, b) => d3.ascending(a.year, b.year));
    },
  });

  dash.calc('changelog_view', {
    title: 'Content edits with their click effect',
    description: 'Each saved edit, with flags, and for article pages in the daily data: average daily clicks in the 7 days before the edit date against up to 7 days after it (at least 3).',
    inputs: ['content_changelog', 'article_daily'],
    fn: (all_changelog, article_daily) => {
      // Web view: only edits to pages with a meta title after the edit (seo), as before the app edits were saved too.
      const content_changelog = all_changelog.filter((r) => String(r.seo) !== 'false');
      const dates = [...new Set(article_daily.map((r) => r.date))].sort();
      const first = dates[0], last = dates[dates.length - 1];
      const shift = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
      const byPage = d3.group(article_daily, (r) => r.page);
      const find = (key) => byPage.get(key) || (key.length > 78 ? byPage.get(key.slice(0, 78)) : null);
      const list = (v) => {
        if (Array.isArray(v)) return v;
        if (v == null || v === '') return [];
        const t = String(v).trim();
        if (t.startsWith('[')) { try { return JSON.parse(t); } catch (err) { /* fall through */ } }
        return t.split(/\s*,\s*/).filter(Boolean);
      };
      return content_changelog.map((raw) => {
        const e = { ...raw, changed: list(raw.changed), sections_added: list(raw.sections_added), sections_removed: list(raw.sections_removed),
          words_before: Number(raw.words_before) || 0, words_after: Number(raw.words_after) || 0 };
        const o = { ...e, effect_before: null, effect_after: null, effect_pct: null, effect_days: null, effect_note: null, flags: [] };
        if ((e.changed || []).includes('Meta title') && !(e.changed || []).includes('Meta description') && e.kind === 'Article') o.flags.push('Meta title changed, description not');
        if (e.words_before > 300 && e.words_after < 0.8 * e.words_before) o.flags.push('Much shorter: ' + Math.round((1 - e.words_after / e.words_before) * 100) + '% fewer words');
        const rows = e.kind === 'Article' ? find(e.page_key) : null;
        if (e.kind !== 'Article') o.effect_note = 'No daily click data for Q&A pages';
        else if (!rows) o.effect_note = 'Too little Google traffic to measure';
        else if (e.date > shift(last, -3)) o.effect_note = 'Too recent: needs 3 days of clicks after the edit (data runs to ' + last + ')';
        else if (e.date < shift(first, 7)) o.effect_note = 'Edited before the daily data starts';
        if (rows && e.date >= shift(first, 7) && e.date <= shift(last, -3)) {
          const end = shift(e.date, 7) < last ? shift(e.date, 7) : last;
          const n = Math.round((Date.parse(end) - Date.parse(e.date)) / 864e5);
          const sum = (a, b) => d3.sum(rows.filter((r) => r.date >= a && r.date <= b), (r) => r.clicks);
          const b = Math.round((sum(shift(e.date, -7), shift(e.date, -1)) / 7) * 10) / 10, a = Math.round((sum(shift(e.date, 1), end) / n) * 10) / 10;
          Object.assign(o, { effect_before: b, effect_after: a, effect_days: n, effect_pct: b >= 1 ? Math.round(((a - b) / b) * 100) / 100 : null,
            effect_note: b < 1 ? 'Under 1 click a day before: too small for a % change' : null });
        }
        return o;
      });
    },
  });

  dash.calc('changelog_app_view', {
    title: 'Edits to app articles with their app effect',
    description: 'Each saved edit to a app article (web or app-only), with average app views and card impressions a day in the 7 days before the edit against up to 7 days after it (at least 3), and two flags: dropped from app recommendations after the edit (card impressions in days 1–3 at or under 20% of the week before, from 50+ a day) and bulk edit (saved in the same second as 20+ other articles).',
    inputs: ['content_changelog', 'app_recent_daily'],
    fn: (content_changelog, app_recent_daily) => {
      const list = (v) => {
        if (Array.isArray(v)) return v;
        if (v == null || v === '') return [];
        const t = String(v).trim();
        if (t.startsWith('[')) { try { return JSON.parse(t); } catch (err) { /* fall through */ } }
        return t.split(/\s*,\s*/).filter(Boolean);
      };
      const dates = [...new Set(app_recent_daily.map((r) => r.date))].sort();
      const first = dates[0], last = dates[dates.length - 1];
      const shift = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
      const byId = d3.group(app_recent_daily, (r) => Number(r.id));
      // Bulk edits: 20+ pages saved in the same second (all saved edits, not only app articles).
      const same = d3.rollup(content_changelog.filter((r) => r.edited_at), (v) => v.length, (r) => String(r.edited_at).slice(0, 19));
      return content_changelog.filter((r) => String(r.real) === 'true' && r.kind === 'Article').map((raw) => {
        const e = { ...raw, changed: list(raw.changed), sections_added: list(raw.sections_added), sections_removed: list(raw.sections_removed),
          words_before: Number(raw.words_before) || 0, words_after: Number(raw.words_after) || 0 };
        const web = String(raw.web) === 'true';
        const o = { ...e, article_kind: web ? 'Web article' : 'App-only article', flags: [], views_before: null, views_after: null, views_pct: null,
          impr_before: null, impr_after: null, impr_pct: null, days_after: null, note: null, dropped: false, bulk: 0 };
        const n = same.get(String(raw.edited_at || '').slice(0, 19)) || 0;
        if (n >= 20) { o.bulk = n; o.flags.push('Bulk edit: ' + n + ' pages saved at ' + String(raw.edited_at).slice(11, 16) + ' IST on ' + e.date); }
        const rows = byId.get(Number(e.id));
        if (!first) o.note = 'No app data yet';
        else if (e.date < shift(first, 7)) o.note = 'Edited before the daily app data starts';
        else if (e.date > shift(last, -3)) o.note = 'Too recent: needs 3 days of app data after the edit (data runs to ' + last + ')';
        else if (!rows) o.note = 'Not shown or opened in the app around the edit';
        else {
          const end = shift(e.date, 7) < last ? shift(e.date, 7) : last;
          const k = Math.round((Date.parse(end) - Date.parse(e.date)) / 864e5);
          const sum = (a, b, f) => d3.sum(rows.filter((r) => r.date >= a && r.date <= b), (r) => Number(r[f]));
          const r1 = (v) => Math.round(v * 10) / 10;
          const vb = r1(sum(shift(e.date, -7), shift(e.date, -1), 'views') / 7), va = r1(sum(shift(e.date, 1), end, 'views') / k);
          const ib = r1(sum(shift(e.date, -7), shift(e.date, -1), 'impressions') / 7), ia = r1(sum(shift(e.date, 1), end, 'impressions') / k);
          const i3 = sum(shift(e.date, 1), shift(e.date, 3), 'impressions') / 3;
          Object.assign(o, { views_before: vb, views_after: va, views_pct: vb >= 1 ? Math.round(((va - vb) / vb) * 100) / 100 : null,
            impr_before: ib, impr_after: ia, impr_pct: ib >= 10 ? Math.round(((ia - ib) / ib) * 100) / 100 : null, days_after: k,
            note: vb < 1 ? 'Under 1 app view a day before: too small for a % change' : null });
          if (ib >= 50 && i3 <= 0.2 * ib) { o.dropped = true; o.flags.unshift('Dropped from app after edit: card impressions ' + MS_n(Math.round(ib)) + ' → ' + MS_n(Math.round(i3)) + ' a day'); }
        }
        return o;
      }).sort((a, b) => d3.descending(a.edited_at || a.date, b.edited_at || b.date));
    },
  });

  dash.calc('older_view', {
    title: 'Earlier edits with their click effect',
    description: 'Pages whose latest edit was before the detailed changelog starts, with average daily clicks in the 7 days before the edit date against up to 7 days after it (at least 3) where the daily click data covers it.',
    inputs: ['older_edits', 'article_daily'],
    fn: (older_edits, article_daily) => {
      const dates = [...new Set(article_daily.map((r) => r.date))].sort();
      const first = dates[0], last = dates[dates.length - 1];
      const shift = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
      const byPage = d3.group(article_daily, (r) => r.page);
      // Same encoding as the Search Console page keys (Python quote with safe "/-_.~"), cut to 78 characters there.
      const keyOf = (path) => path.split('/').map((seg) => encodeURIComponent(seg).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');
      const lang = (p) => ({ hi: 'Hindi', ta: 'Tamil', te: 'Telugu', mr: 'Marathi', bn: 'Bengali' })[String(p).split('/')[1]] || 'English';
      return older_edits.map((e) => {
        const d = String(e.last_edited).slice(0, 10);
        const o = { key: e.kind + '|' + e.id, kind: e.kind, id: e.id, path: e.path, name: e.name, created: String(e.created).slice(0, 10), last_edited: d, language: lang(e.path),
          effect_before: null, effect_after: null, effect_pct: null, effect_days: null, effect_note: null };
        if (e.kind !== 'Article') { o.effect_note = 'No daily click data for Q&A pages'; return o; }
        if (!first || d < shift(first, 7)) { o.effect_note = 'Before the daily click data starts'; return o; }
        const k = keyOf(e.path);
        const rows = byPage.get(k) || (k.length > 78 ? byPage.get(k.slice(0, 78)) : null);
        if (!rows) { o.effect_note = 'Too little Google traffic to measure'; return o; }
        const end = shift(d, 7) < last ? shift(d, 7) : last;
        const n = Math.round((Date.parse(end) - Date.parse(d)) / 864e5);
        const sum = (a, b) => d3.sum(rows.filter((r) => r.date >= a && r.date <= b), (r) => r.clicks);
        const b = Math.round((sum(shift(d, -7), shift(d, -1)) / 7) * 10) / 10, a = Math.round((sum(shift(d, 1), end) / n) * 10) / 10;
        Object.assign(o, { effect_before: b, effect_after: a, effect_days: n, effect_pct: b >= 1 ? Math.round(((a - b) / b) * 100) / 100 : null,
          effect_note: b < 1 ? 'Under 1 click a day before: too small for a % change' : null });
        return o;
      }).sort((x, y) => d3.descending(x.last_edited, y.last_edited));
    },
  });

  dash.calc('redirect_ideas', {
    title: 'Redirect ideas from duplicate articles',
    description: 'For each group of articles with the same SEO title: the winner (most Google clicks in 28 days, then impressions, then more words, then older) and, for every other copy, its word overlap with the winner and what to do: 301 (60%+), merge then 301 (30–60%), or fix the title (under 30%).',
    inputs: ['duplicate_articles', 'article_coverage'],
    fn: (duplicate_articles, article_coverage) => {
      const keyOf = (path) => path.split('/').map((seg) => encodeURIComponent(seg).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');
      const cov = new Map(article_coverage.map((r) => [r.page, r]));
      const lang = (p) => ({ hi: 'Hindi', ta: 'Tamil', te: 'Telugu', mr: 'Marathi', bn: 'Bengali', ml: 'Malayalam', kn: 'Kannada', gu: 'Gujarati' })[String(p).split('/')[1]] || 'English';
      const groups = new Map();
      const overlap = new Map();
      for (const r of duplicate_articles) {
        const g = groups.get(r.grp) || new Map();
        g.set(r.a_id, { id: r.a_id, path: r.a_path, title: r.a_title, created: r.a_created, updated: r.a_updated, words: Number(r.a_words) });
        g.set(r.b_id, { id: r.b_id, path: r.b_path, title: r.b_title, created: r.b_created, updated: r.b_updated, words: Number(r.b_words) });
        groups.set(r.grp, g);
        overlap.set(r.a_id + '|' + r.b_id, Number(r.overlap)); overlap.set(r.b_id + '|' + r.a_id, Number(r.overlap));
      }
      const out = [];
      for (const [grp, g] of groups) {
        const mem = [...g.values()].map((m) => { const c = cov.get(keyOf(m.path)); return { ...m, clicks: c && c.clicks_28d != null ? Number(c.clicks_28d) : 0, impr: c && c.impr_28d != null ? Number(c.impr_28d) : 0, status: c ? c.search_status : null }; });
        mem.sort((a, b) => b.clicks - a.clicks || b.impr - a.impr || b.words - a.words || d3.ascending(a.created, b.created) || a.id - b.id);
        const w = mem[0];
        for (const m of mem.slice(1)) {
          const ov = overlap.get(w.id + '|' + m.id) ?? 0;
          const action = ov >= 0.6 ? '301 to the winner' : ov >= 0.3 ? 'Merge, then 301' : 'Fix the title';
          out.push({ key: grp + '|' + m.id, group: grp, group_size: mem.length, language: lang(m.path), action, overlap: ov,
            winner_id: w.id, winner_path: w.path, winner_title: w.title, winner_clicks: w.clicks, winner_impr: w.impr, winner_created: w.created, winner_words: w.words,
            id: m.id, path: m.path, title: m.title, clicks: m.clicks, impr: m.impr, created: m.created, updated: m.updated, words: m.words });
        }
      }
      const order = ['301 to the winner', 'Merge, then 301', 'Fix the title'];
      return out.sort((a, b) => order.indexOf(a.action) - order.indexOf(b.action) || b.group_size - a.group_size || d3.ascending(a.group, b.group) || b.clicks - a.clicks);
    },
  });

  dash.calc('merge_candidates', {
    title: 'Pages competing for the same searches',
    description: 'Pairs of our pages that each take 15%+ of the impressions on searches with 100+ impressions (28 days), with shared impressions, each page\'s clicks and position, the suggested fix (merge + 301, differentiate, or link) and whether the weaker page already redirects.',
    inputs: ['query_pages', 'articles_pages', 'qa_pages', 'redirects'],
    fn: (query_pages, articles_pages, qa_pages, redirects) => {
      const SITE = 'https://bloomnest.example';
      const info = new Map([...articles_pages, ...qa_pages].map((p) => [p.page, p]));
      const dec = (u) => { try { return decodeURIComponent(u); } catch (e) { return u; } };
      const slug = (p) => { const t = dec(p).replace(/\/$/, '').split('/').pop().replace(/-\d+$/, '').replace(/-+/g, ' ').trim(); return t ? t[0].toUpperCase() + t.slice(1) : p; };
      const lang = (p) => ({ hi: 'Hindi', ta: 'Tamil', te: 'Telugu', mr: 'Marathi', bn: 'Bengali', ml: 'Malayalam', kn: 'Kannada', gu: 'Gujarati' })[String(p).split('/')[1]] || 'English';
      const kind = (p) => (String(p).includes('/questions/') ? 'Q&A' : 'Article');
      // Page totals: the snapshot where we have it, else the sum of its search rows.
      const perPage = d3.rollup(query_pages, (v) => ({ impr: d3.sum(v, (r) => r.impr_28d), clicks: d3.sum(v, (r) => r.clicks_28d), url: v.find((r) => r.url)?.url || null }), (r) => r.page);
      const pageStat = (p) => {
        const i = info.get(p), q = perPage.get(p) || { impr: 0, clicks: 0, url: null };
        return { page: p, url: (i && i.url) || q.url, title: (i && i.title) || slug(p), impr: i ? i.impr_28d : q.impr, clicks: i ? i.clicks_28d : q.clicks, pos: i ? i.pos_28d : null, language: lang(p), kind: kind(p) };
      };
      // Accumulate shared searches per pair of pages.
      const pairs = new Map();
      for (const [query, rows] of d3.group(query_pages, (r) => r.query)) {
        const total = d3.sum(rows, (r) => r.impr_28d);
        const big = rows.filter((r) => r.impr_28d / total >= 0.15).sort((a, b) => b.impr_28d - a.impr_28d);
        if (total < 100 || big.length < 2 || query.length < 5) continue;
        for (let i = 0; i < big.length; i++) for (let j = i + 1; j < big.length; j++) {
          const [a, b] = [big[i], big[j]].sort((x, y) => (x.page < y.page ? -1 : 1));
          const k = a.page + '||' + b.page;
          const o = pairs.get(k) || { a: a.page, b: b.page, shared: 0, aImpr: 0, bImpr: 0, queries: [] };
          o.shared += a.impr_28d + b.impr_28d; o.aImpr += a.impr_28d; o.bImpr += b.impr_28d;
          o.queries.push({ query, impr: total, a_pos: a.position, b_pos: b.position });
          pairs.set(k, o);
        }
      }
      // Words that mark a different focus; a pair whose titles differ on these is not a duplicate.
      const facets = ['girl', 'boy', 'hindi', 'english', 'tamil', 'telugu', 'bengali', 'marathi', 'malayalam', 'kannada', 'gujarati', 'punjabi', 'muslim', 'sikh', 'christian', 'hindu', 'jain',
        'first', 'second', 'third', 'trimester', 'newborn', 'toddler', 'twins', 'nephew', 'niece', 'daughter', 'son', 'wife', 'husband', 'brother', 'sister'];
      const marks = (t) => {
        const low = ' ' + String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
        const set = new Set(facets.filter((w) => low.includes(' ' + w + ' ') || low.includes(' ' + w + 's ')));
        for (const m of low.matchAll(/(week|month|weeks|months)\s+(\d+)|(\d+)\s*(week|month)/g)) set.add((m[1] || m[4]).replace(/s$/, '') + (m[2] || m[3]));
        return set;
      };
      const redir = new Map(redirects.map((r) => [r.path, r]));
      const out = [];
      for (const o of pairs.values()) {
        if (o.shared < 300) continue;
        let A = pageStat(o.a), B = pageStat(o.b);
        if (B.clicks > A.clicks || (B.clicks === A.clicks && B.impr > A.impr)) [A, B] = [B, A];
        const bShare = B.impr ? Math.min(1, (o.a === B.page ? o.aImpr : o.bImpr) / B.impr) : 0;
        const ma = marks(A.title + ' ' + dec(A.page)), mb = marks(B.title + ' ' + dec(B.page));
        const diffFocus = [...ma].filter((w) => !mb.has(w)).concat([...mb].filter((w) => !ma.has(w)));
        const bPath = B.url ? dec(B.url.slice(SITE.length)) : null;
        const rd = bPath ? redir.get(bPath) : null;
        const merged = rd && [301, 308].includes(rd.status) && A.url && dec(rd.final_url) === dec(A.url);
        let action, why;
        if (merged) { action = 'Merged'; why = 'The other page already 301-redirects here.'; }
        else if (A.kind !== B.kind) { action = 'Keep both, link'; why = 'Article and Q&A page: keep the article as the full guide and the Q&A page as the quick answer, and link them.'; }
        else if (A.language !== B.language) { action = 'Keep both, link'; why = A.language + ' and ' + B.language + ' pages serve different readers: link them and make each title name its language.'; }
        else if (diffFocus.length) { action = 'Keep both, differentiate'; why = 'Different focus (' + diffFocus.slice(0, 4).join(', ') + '): make each title and intro say it clearly and link the two.'; }
        else if (A.clicks >= 3 * Math.max(1, B.clicks) && bShare >= 0.4) { action = 'Merge + 301'; why = 'Same topic; the other page gets ' + Math.round(bShare * 100) + '% of its impressions from these shared searches and far fewer clicks. Move its useful parts into the stronger page, then 301 it.'; }
        else { action = 'Keep both, differentiate'; why = 'Both pages pull their weight' + (bShare < 0.4 ? ' and the other page ranks for other searches too' : '') + ': give each a distinct angle and link them.'; }
        o.queries.sort((x, y) => y.impr - x.impr);
        out.push({ pair: A.page + '||' + B.page, action, why, shared_impr: o.shared, shared_queries: o.queries.length,
          top_queries: o.queries.slice(0, 5).map((q) => q.query + ' (' + q.impr + ' impr.)').join(' · '),
          winner_page: A.page, winner_title: A.title, winner_url: A.url, winner_clicks: A.clicks, winner_impr: A.impr, winner_pos: A.pos, winner_lang: A.language,
          loser_page: B.page, loser_title: B.title, loser_url: B.url, loser_clicks: B.clicks, loser_impr: B.impr, loser_pos: B.pos, loser_lang: B.language,
          loser_share: Math.round(bShare * 100) / 100, language: A.language });
      }
      const order = ['Merge + 301', 'Keep both, differentiate', 'Keep both, link', 'Merged'];
      return out.sort((x, y) => order.indexOf(x.action) - order.indexOf(y.action) || y.shared_impr - x.shared_impr);
    },
  });

  dash.calc('content_summary', {
    title: 'Created and updated, last week vs week before',
    description: 'Takes the last two weeks of the weekly CMS counts.',
    inputs: ['content_weekly'],
    fn: (content_weekly) => {
      const weeks = [...new Set(content_weekly.map((r) => r.week))].sort();
      const [w1, w0] = weeks.slice(-2);
      const out = [];
      for (const t of ['Article', 'Community Q&A']) for (const k of ['created', 'updated']) {
        const get = (w) => (content_weekly.find((r) => r.week === w && r.content_type === t) || {})[k] || 0;
        out.push({ key: t + '|' + k, content_type: t, kind: k, week: w0, last_week: get(w0), week_before: get(w1) });
      }
      return out;
    },
  });

  dash.calc('update_impact', {
    title: 'Clicks before and after an edit',
    description: 'For top article pages edited in the daily data window with 1+ click a day before the edit: average daily clicks in the 7 days before the edit date against up to 7 days after it (at least 3), plus impression-weighted position.',
    inputs: ['articles_pages', 'article_daily'],
    fn: (articles_pages, article_daily) => {
      const dates = [...new Set(article_daily.map((r) => r.date))].sort();
      const first = dates[0], last = dates[dates.length - 1];
      const shift = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
      const byPage = d3.group(article_daily, (r) => r.page);
      const out = [];
      for (const p of articles_pages) {
        const u = p.updated_at;
        if (!u || u < shift(first, 7) || u > shift(last, -3)) continue;
        const rows = byPage.get(p.page) || [];
        const win = (a, b) => rows.filter((r) => r.date >= a && r.date <= b);
        const after_end = shift(u, 7) < last ? shift(u, 7) : last;
        const days_after = Math.round((Date.parse(after_end) - Date.parse(u)) / 864e5);
        const before = win(shift(u, -7), shift(u, -1)), after = win(shift(u, 1), after_end);
        const per = (rs, n) => Math.round((d3.sum(rs, (r) => r.clicks) / n) * 10) / 10;
        const pos = (rs) => { const i = d3.sum(rs, (r) => r.impressions); return i ? Math.round((d3.sum(rs, (r) => r.position * r.impressions) / i) * 10) / 10 : null; };
        const b = per(before, 7), a = per(after, days_after);
        if (b < 1) continue; // too little traffic before the edit to compare
        out.push({ page: p.page, title: p.title, link: p.url || p.gsc_link, language: p.language, updated_at: u, days_after,
          clicks_before_per_day: b, clicks_after_per_day: a, change_pct: b ? Math.round(((a - b) / b) * 100) / 100 : null, pos_before: pos(before), pos_after: pos(after) });
      }
      return out.sort((x, y) => d3.descending(x.updated_at, y.updated_at) || y.clicks_before_per_day - x.clicks_before_per_day);
    },
  });

  dash.calc('lastweek_work', {
    title: "Last week's pages with their numbers",
    description: "Joins the picked week's created and updated pages to their Search Console numbers, top 3 searches and target keyword check (only for the latest week, which the weekly snapshot covers) and their URL inspection result.",
    inputs: ['content_lastweek', 'articles_pages', 'qa_pages', 'indexing', 'daily_trend', 'lastweek_searches'],
    fn: (content_lastweek, articles_pages, qa_pages, indexing, daily_trend, lastweek_searches) => {
      // Page-level Search Console numbers cover the last 7 days of the daily trend only.
      const lastDay = daily_trend.reduce((m, r) => (r.date > m ? r.date : m), '');
      const snapStart = new Date(Date.parse(lastDay) - 6 * 864e5).toISOString().slice(0, 10);
      const dec = (u) => { try { return decodeURIComponent(u); } catch (e) { return u; } };
      const lang = (p) => ({ hi: 'Hindi', ta: 'Tamil', te: 'Telugu', mr: 'Marathi', bn: 'Bengali' })[p.split('/')[1]] || 'English';
      const perf = new Map([...articles_pages, ...qa_pages].filter((p) => p.url).map((p) => [dec(p.url.replace('https://bloomnest.example', '')), p]));
      const idx = new Map(indexing.map((i) => [dec(i.page), i]));
      const srch = new Map(lastweek_searches.map((x) => [x.path, x]));
      return content_lastweek.map((r) => {
        const inSnap = String(r.at).slice(0, 10) >= snapStart;
        const s = inSnap ? srch.get(r.path) : null;
        const top = s ? [1, 2, 3].filter((n) => s['q' + n]).map((n) => ({ query: s['q' + n], clicks: Number(s['q' + n + '_clicks']), impressions: Number(s['q' + n + '_impr']), position: Number(s['q' + n + '_pos']) })) : [];
        // The weekly searches file covers every page; the pages snapshot only the top 500.
        const p = s ? { impr_last_week: Number(s.impressions), clicks_last_week: Number(s.clicks), pos_last_week: s.position == null || s.position === '' ? null : Number(s.position) } : inSnap ? perf.get(r.path) : null, ix = idx.get(r.path);
        return { path: r.path, content_type: r.content_type, action: r.action, title: r.title, date: String(r.at).slice(0, 10), language: lang(r.path),
          url: 'https://bloomnest.example' + r.path, in_snapshot: inSnap, impr_last_week: p ? p.impr_last_week : inSnap ? 0 : null, clicks_last_week: p ? p.clicks_last_week : inSnap ? 0 : null,
          pos_last_week: p ? p.pos_last_week : null, indexing: ix ? (ix.indexed ? 'Indexed' : ix.coverage) : 'Not checked',
          top_searches: top, n_searches: s ? Number(s.n_queries) : 0, top_search: top.length ? top[0].query : null,
          target: s ? s.target || null : null, target_from: s ? s.target_from || null : null, target_check: s ? s.target_check || null : null,
          target_search: s && s.tq ? { query: s.tq, clicks: Number(s.tq_clicks), impressions: Number(s.tq_impr), position: Number(s.tq_pos) } : null };
      });
    },
  });

  // ---------- App view ----------
  const MS_n = (v) => new Intl.NumberFormat('en-IN').format(v);
  dash.calc('app_movers', {
    title: 'Biggest app view changes',
    description: 'App articles (web and app-only) with 30+ app views in either of the last two full weeks of app data, ranked by the change in views from the week before to last week, with the card CTR last week.',
    inputs: ['app_weekly', 'app_articles'],
    fn: (app_weekly, app_articles) => {
      const weeks = [...new Set(app_weekly.map((r) => r.week))].sort();
      const w0 = weeks[weeks.length - 1], w1 = weeks[weeks.length - 2];
      const meta = new Map(app_articles.map((a) => [Number(a.id), a]));
      const by = new Map();
      for (const r of app_weekly) {
        if (r.week !== w0 && r.week !== w1) continue;
        const o = by.get(Number(r.id)) || { v0: 0, v1: 0, i0: 0, c0: 0 };
        if (r.week === w0) { o.v0 += Number(r.views); o.i0 += Number(r.impressions); o.c0 += Number(r.clicks); } else o.v1 += Number(r.views);
        by.set(Number(r.id), o);
      }
      const out = [];
      for (const [id, o] of by) {
        if (Math.max(o.v0, o.v1) < 30) continue;
        const a = meta.get(id) || {};
        out.push({ id, title: a.title || '#' + id, kind: a.kind, link: a.url || null, language: a.language || 'English', week: w0,
          views_last_week: o.v0, views_week_before: o.v1, views_change: o.v0 - o.v1, ctr_last_week: o.i0 ? Math.round((o.c0 / o.i0) * 10000) / 100 : null });
      }
      return out.sort((a, b) => b.views_change - a.views_change);
    },
  });

  dash.calc('nometa_articles', {
    title: 'Web articles with no meta title',
    description: 'The live list of web articles with no meta title, joined to their Google impressions and clicks (28 days; cut-off Search Console URLs matched by unique prefix) and their app views (last 4 weeks), with a priority and a suggested meta title (the H1 without its English gloss).',
    inputs: ['nometa_web', 'article_pages_all', 'app_weekly'],
    fn: (nometa_web, article_pages_all, app_weekly) => {
      const enc = (p) => String(p).split('/').map((seg) => encodeURIComponent(seg).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');
      const lang = (p) => ({ hi: 'Hindi', ta: 'Tamil', te: 'Telugu', mr: 'Marathi', bn: 'Bengali' })[String(p).split('/')[1]] || 'English';
      const g = new Map(article_pages_all.map((r) => [r.page, r]));
      const cut = article_pages_all.filter((r) => String(r.page).length >= 70);
      const weeks = [...new Set(app_weekly.map((r) => r.week))].sort().slice(-4);
      const app = new Map();
      for (const r of app_weekly) if (weeks.includes(r.week)) app.set(Number(r.id), (app.get(Number(r.id)) || 0) + Number(r.views));
      const suggest = (t) => {
        t = String(t || '').replace(/\s+/g, ' ').trim();
        // Only a trailing gloss goes: "…?|(How To Tell … In Telugu)" or "… (… In Hindi)"; "Keyword | हिंदी वाक्य" stays whole.
        return t.replace(/\s*\|?\s*\([^)]*\bIn (Hindi|Tamil|Telugu|Bangla|Bengali|Kannada|Malayalam|Marathi)\)\s*$/i, '').replace(/\s*\|\s*$/, '').trim();
      };
      const rows = nometa_web.map((r) => {
        const key = enc(r.path);
        let m = g.get(key);
        if (!m) { const hits = cut.filter((c) => key.startsWith(c.page)); if (hits.length === 1) m = hits[0]; }
        const views = app.get(Number(r.id)) ?? null;
        const title = String(r.title || '').replace(/\s+/g, ' ').trim() || '#' + r.id;
        return { id: Number(r.id), title, link: 'https://bloomnest.example' + key, language: lang(r.path), article_key: String(r.article_key), created: String(r.created).slice(0, 10),
          impr_28d: m ? Number(m.impr_28d) : 0, clicks_28d: m ? Number(m.clicks_28d) : 0, app_views_4w: views, suggested: suggest(title), has_description: r.has_description,
          caution: views != null && views >= 300 ? 'Popular in the app: editing may reduce its app reach.' : null };
      });
      const seen = rows.filter((r) => r.impr_28d > 0).sort((a, b) => b.impr_28d - a.impr_28d);
      const hi = Math.max(1, Math.ceil(seen.length * 0.1)), mid = hi + Math.ceil(seen.length * 0.25);
      seen.forEach((r, i) => { r.priority = i < hi ? 'High' : i < mid ? 'Medium' : 'Low'; });
      for (const r of rows) if (!r.priority) r.priority = 'Low';
      return rows.sort((a, b) => b.impr_28d - a.impr_28d || (b.app_views_4w || 0) - (a.app_views_4w || 0) || d3.descending(a.created, b.created));
    },
  });

  dash.calc('app_actions', {
    title: 'App articles to work on',
    description: 'Ideas from the last 4 full weeks of app data for app articles: create a web version of popular app-only articles, fix cards that are shown a lot but rarely tapped, do SEO on web articles that are popular in the app but weak on Google (no meta title or under 10 Google clicks in 28 days), and check articles whose app views dropped 40%+ last week. Priority is relative within each idea.',
    inputs: ['app_weekly', 'app_articles', 'article_coverage'],
    fn: (app_weekly, app_articles, article_coverage) => {
      const weeks = [...new Set(app_weekly.map((r) => r.week))].sort();
      const last4 = new Set(weeks.slice(-4)), w0 = weeks[weeks.length - 1], w1 = weeks[weeks.length - 2];
      const meta = new Map(app_articles.map((a) => [Number(a.id), a]));
      const site = 'https://bloomnest.example';
      const cov = new Map(article_coverage.map((c) => [c.page, c]));
      const agg = new Map();
      for (const r of app_weekly) {
        const id = Number(r.id), o = agg.get(id) || { i4: 0, c4: 0, v4: 0, v0: 0, v1: 0 };
        if (last4.has(r.week)) { o.i4 += Number(r.impressions); o.c4 += Number(r.clicks); o.v4 += Number(r.views); }
        if (r.week === w0) o.v0 += Number(r.views);
        if (r.week === w1) o.v1 += Number(r.views);
        agg.set(id, o);
      }
      // Typical card CTR: median over articles with 2,000+ card impressions in 4 weeks.
      const ctrs = [...agg.values()].filter((o) => o.i4 >= 2000).map((o) => o.c4 / o.i4).sort((a, b) => a - b);
      const med = ctrs.length ? ctrs[ctrs.length >> 1] : 0;
      // Title words, to spot an existing web article on the same topic as an app-only one.
      const STOP = new Set('the and for with your you what how why when are can does during after before about into this that from baby babies pregnancy pregnant mom mother in of to a is it on be के की का में है हैं से और को कि क्या लिए होती होता होते करें कैसे सकती सकते आपके आपकी अपने बच्चे शिशु प्रेगनेंसी गर्भावस्था दौरान'.split(' '));
      const words = (t) => new Set(String(t || '').toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
      const webTitles = [];
      for (const c of article_coverage) webTitles.push({ title: c.title, url: site + c.page, w: words(c.title) });
      for (const a of app_articles) if (a.kind === 'Web article' && a.url && !cov.has(a.url.replace(site, ''))) webTitles.push({ title: a.title, url: a.url, w: words(a.title) });
      const similar = (title) => {
        const w = words(title); if (w.size < 2) return null;
        let best = null;
        for (const t of webTitles) {
          let inter = 0; for (const x of w) if (t.w.has(x)) inter++;
          const j = inter / (w.size + t.w.size - inter);
          if (j >= 0.5 && (!best || j > best.j)) best = { j, title: t.title, url: t.url };
        }
        return best;
      };
      const out = [];
      for (const [id, o] of agg) {
        const a = meta.get(id); if (!a) continue;
        const ctr = o.i4 ? o.c4 / o.i4 : null;
        const base = { id, title: a.title, kind: a.kind, link: a.url || null, language: a.language, updated: a.updated,
          impr_4w: o.i4, clicks_4w: o.c4, ctr_4w: ctr == null ? null : Math.round(ctr * 10000) / 100, views_4w: o.v4, views_last_week: o.v0, views_week_before: o.v1,
          caution: o.v4 >= 300 ? 'Popular in the app: editing may reduce its app reach.' : null };
        const add = (action, payoff, fix, why, extra = {}) => out.push({ key: id + '|' + action, action, payoff, fix, why, ...base, ...extra });
        if (a.kind === 'App-only article' && o.v4 >= 100) {
          const sim = similar(a.title);
          add('Create web version', o.v4, sim ? 'A web article with a similar title exists (“' + sim.title + '”): add this content there instead of a new page, then link to it.'
            : 'Publish it as a web article with an SEO title and meta description; keep the app version.',
            MS_n(o.v4) + ' app views in 4 weeks; no web page, so no Google traffic.', { similar_title: sim ? sim.title : null, similar_url: sim ? sim.url : null });
        }
        if (o.i4 >= 2000 && ctr != null && ctr < med / 2) {
          add('Fix the card', Math.round(o.i4 * (med - ctr)), 'Rewrite the card title (short, a clear question or benefit) or change the thumbnail.',
            MS_n(o.i4) + ' card impressions, ' + (ctr * 100).toFixed(2) + '% CTR against ' + (med * 100).toFixed(2) + '% typical: about ' + MS_n(Math.round(o.i4 * (med - ctr))) + ' more taps at a typical CTR.');
        }
        if (a.kind === 'Web article' && o.v4 >= 100) {
          const c = cov.get(String(a.url || '').replace(site, ''));
          const clicks = c ? Number(c.clicks_28d || 0) : null;
          // No meta title in the CMS (has_meta), or a meta title but under 10 Google clicks; a meta title added after the Google snapshot waits for the next refresh.
          const noMeta = a.has_meta === false || a.has_meta === 'false' || (a.has_meta == null && !c);
          if (noMeta || (c && clicks < 10)) add('Do SEO', o.v4, noMeta ? 'Add a meta title and description in the CMS, then request indexing.' : 'Match the title and first lines to what people search, add internal links, request indexing.',
            MS_n(o.v4) + ' app views in 4 weeks but ' + (noMeta ? 'no meta title in the CMS' : MS_n(clicks) + ' Google clicks in 28 days') + '.', { no_meta: noMeta });
        }
        if (o.v1 >= 30 && o.v0 <= 0.6 * o.v1) {
          const edited = a.updated && a.updated >= w1;
          add('Check the drop', o.v1 - o.v0, edited ? 'It was edited on ' + a.updated + '. Check with the app team whether the edit took it out of recommendations.' : 'Check whether it was hidden or dropped from app recommendations.',
            'App views ' + MS_n(o.v1) + ' → ' + MS_n(o.v0) + ' week over week.', { edited });
        }
      }
      // Relative priority within each idea.
      for (const g of d3.group(out, (r) => r.action).values()) {
        g.sort((x, y) => y.payoff - x.payoff);
        const hi = Math.max(1, Math.ceil(g.length * 0.1)), mid = hi + Math.ceil(g.length * 0.25);
        g.forEach((r, i) => { r.priority = i < hi ? 'High' : i < mid ? 'Medium' : 'Low'; });
      }
      const order = { High: 0, Medium: 1, Low: 2 };
      return out.sort((x, y) => order[x.priority] - order[y.priority] || y.payoff - x.payoff);
    },
  });

  dash.calc('app_lastweek_work', {
    title: "Picked week's app articles with their app numbers",
    description: "Joins the picked week's created and updated app articles (web and app-only) to their app numbers for the same Monday–Sunday week. Weeks outside the app data have no numbers.",
    inputs: ['app_content_lastweek', 'app_weekly', 'app_articles'],
    fn: (app_content_lastweek, app_weekly, app_articles) => {
      const monday = (d) => { const t = new Date(String(d).slice(0, 10) + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.toISOString().slice(0, 10); };
      const weeks = new Set(app_weekly.map((r) => r.week));
      const nums = new Map(app_weekly.map((r) => [r.week + '|' + Number(r.id), r]));
      const meta = new Map(app_articles.map((a) => [Number(a.id), a]));
      const urlLang = (p) => ({ hi: 'Hindi', ta: 'Tamil', te: 'Telugu', mr: 'Marathi', bn: 'Bengali' })[String(p || '').split('/')[1]] || 'English';
      const enc = (p) => 'https://bloomnest.example' + String(p).split('/').map((seg) => encodeURIComponent(seg).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');
      return app_content_lastweek.map((r) => {
        const id = Number(r.id), wk = monday(r.at), inData = weeks.has(wk), n = nums.get(wk + '|' + id), a = meta.get(id);
        const web = r.content_type === 'Web article';
        const i = n ? Number(n.impressions) : inData ? 0 : null, c = n ? Number(n.clicks) : inData ? 0 : null, v = n ? Number(n.views) : inData ? 0 : null;
        return { id, content_type: r.content_type, action: r.action, title: String(r.title || '').replace(/\s+/g, ' ').trim() || '#' + id, date: String(r.at).slice(0, 10),
          link: web && r.path ? enc(r.path) : null, language: a ? a.language : web ? urlLang(r.path) : 'English', week: wk, in_data: inData,
          impressions: i, clicks: c, ctr: i ? Math.round((c / i) * 10000) / 100 : null, views: v };
      });
    },
  });

  dash.calc('app_update_impact', {
    title: 'Did our updates work in the app?',
    description: 'App articles edited in the last 21 days of app data (latest edit date from the CMS): average app views a day in the 7 days before the edit against the days after it (up to 7), for articles with 1+ view a day before.',
    inputs: ['app_articles', 'app_recent_daily'],
    fn: (app_articles, app_recent_daily) => {
      const lastDay = app_recent_daily.reduce((m, r) => (r.date > m ? r.date : m), '');
      if (!lastDay) return [];
      const shift = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
      const byId = d3.group(app_recent_daily, (r) => Number(r.id));
      const out = [];
      for (const a of app_articles) {
        const u = a.updated;
        if (!u || u > shift(lastDay, -2) || u < shift(lastDay, -21) || u <= a.created) continue;
        const rows = byId.get(Number(a.id)) || [];
        const sum = (from, to) => d3.sum(rows.filter((r) => r.date >= from && r.date <= to), (r) => Number(r.views));
        const daysAfter = Math.min(7, Math.round((Date.parse(lastDay) - Date.parse(u)) / 864e5));
        const b = sum(shift(u, -7), shift(u, -1)) / 7, af = sum(shift(u, 1), shift(u, daysAfter)) / daysAfter;
        if (b < 1) continue;
        out.push({ id: Number(a.id), title: a.title, link: a.url || null, kind: a.kind, language: a.language, updated_at: u, days_after: daysAfter,
          views_before_per_day: Math.round(b * 10) / 10, views_after_per_day: Math.round(af * 10) / 10, change_pct: b ? Math.round(((af - b) / b) * 100) / 100 : null });
      }
      return out.sort((x, y) => d3.descending(x.updated_at, y.updated_at) || y.views_before_per_day - x.views_before_per_day);
    },
  });

  dash.calc('page_movers', {
    title: 'Biggest click changes',
    description: 'Article pages with 30+ clicks in either week, ranked by the change in clicks from the week before to last week.',
    inputs: ['articles_pages'],
    fn: (articles_pages) => articles_pages
      .filter((r) => Math.max(r.clicks_last_week, r.clicks_week_before) >= 30)
      .map((r) => ({ page: r.page, title: r.title, link: r.url || r.gsc_link, language: r.language, clicks_last_week: r.clicks_last_week, clicks_week_before: r.clicks_week_before,
        clicks_change: r.clicks_last_week - r.clicks_week_before, pos_last_week: r.pos_last_week }))
      .sort((a, b) => b.clicks_change - a.clicks_change),
  });

  dash.calc('tracker_heat', {
    title: 'Keyword positions by week',
    description: 'One row per tracked search with its average position in each of the 8 weeks (week_1 = oldest), the change from the first to the last week (positive = moved up) and last week’s impressions.',
    inputs: ['keyword_tracker'],
    fn: (keyword_tracker) => {
      const weeks = [...new Set(keyword_tracker.map((r) => r.week))].sort().slice(-8);
      return d3.rollups(keyword_tracker, (rows) => {
        const at = new Map(rows.map((r) => [r.week, r]));
        const o = {};
        weeks.forEach((w, i) => { o['week_' + (i + 1)] = at.has(w) ? at.get(w).position : null; });
        const seen = weeks.filter((w) => at.has(w));
        const firstP = at.get(seen[0]).position, lastR = at.get(seen[seen.length - 1]);
        return { ...o, weeks, pos_change: Math.round((firstP - lastR.position) * 10) / 10, impr_last_week: lastR.impressions };
      }, (r) => r.query).map(([query, v]) => ({ query, ...v })).sort((a, b) => b.impr_last_week - a.impr_last_week);
    },
  });

  dash.calc('week_plan', {
    title: 'Plan for this week',
    description: 'Takes the top items from the article, Q&A page, trending-search and indexing lists and turns them into tasks.',
    inputs: ['article_actions', 'qa_actions', 'keyword_actions', 'index_summary', 'app_actions', 'nometa_articles'],
    fn: (article_actions, qa_actions, keyword_actions, index_summary, app_actions = [], nometa_articles = []) => {
      const t = [];
      keyword_actions.filter((k) => k.action === 'Create new').slice(0, 5).forEach((k) => t.push({ area: 'Create new', priority: k.impr_last_week >= 1000 ? 'High' : 'Medium',
        task: 'Write a new ' + k.content_type.toLowerCase() + ' for “' + k.query + '”', why: k.impr_last_week + ' impressions last week, up from ' + k.impr_week_before + '.', link: null }));
      article_actions.filter((a) => !a.edited_recently).slice(0, 8).forEach((a) => t.push({ area: 'Fix & refresh', priority: a.priority,
        task: a.bucket + ': ' + a.title, why: a.fix, link: a.link }));
      keyword_actions.filter((k) => k.action === 'Improve' && k.page_title).slice(0, 3).forEach((k) => t.push({ area: 'Fix & refresh', priority: 'Medium',
        task: 'Cover “' + k.query + '” in ' + k.page_title, why: k.fix, link: k.link }));
      qa_actions.filter((c) => c.impr_28d > 0).slice(0, 3).forEach((c) => t.push({ area: 'Q&A & indexing', priority: c.priority,
        task: c.bucket + ': ' + c.title, why: c.fix, link: c.link }));
      const quiet = qa_actions.filter((c) => c.bucket === 'No impressions yet' && c.age_days > 7).length;
      if (quiet) t.push({ area: 'Q&A & indexing', priority: 'High', task: 'Get ' + quiet + ' silent Q&A pages into search results',
        why: 'Live over a week with no impressions. Link each from a related article and tighten titles to the target keyword.', link: null });
      index_summary.filter((s) => s.not_indexed > 0).forEach((s) => t.push({ area: 'Q&A & indexing', priority: 'High',
        task: 'Request indexing for ' + s.not_indexed + ' ' + s.content_type.toLowerCase() + ' pages', why: 'Most common reason: ' + s.top_reason + '.', link: null }));
      nometa_articles.filter((a) => a.impr_28d > 0).slice(0, 5).forEach((a) => t.push({ area: 'Fix & refresh', priority: a.priority === 'Low' ? 'Medium' : a.priority,
        task: 'Add a meta title: ' + a.title, why: a.impr_28d + ' Google impressions in 28 days, but no meta title, so the page title is the H1. Suggested: “' + a.suggested + '”.' + (a.caution ? ' ' + a.caution : ''), link: a.link }));
      // App view ideas, tagged "App ·", in the same lanes.
      const appTop = (action, n) => app_actions.filter((a) => a.action === action && a.priority !== 'Low').slice(0, n);
      appTop('Create web version', 3).forEach((a) => t.push({ area: 'Create new', priority: a.priority,
        task: a.similar_title ? 'App · Add “' + a.title + '” to the web article “' + a.similar_title + '”' : 'App · Create a web version of “' + a.title + '”',
        why: a.why + ' ' + a.fix, link: a.similar_url || null }));
      appTop('Fix the card', 2).forEach((a) => t.push({ area: 'Fix & refresh', priority: a.priority, task: 'App · Fix the card: ' + a.title, why: a.why + ' ' + a.fix, link: a.link }));
      appTop('Do SEO', 3).forEach((a) => t.push({ area: 'Fix & refresh', priority: a.priority, task: 'App · Do SEO: ' + a.title,
        why: a.why + ' ' + a.fix + (a.caution ? ' ' + a.caution : ''), link: a.link }));
      return t.map((r, i) => ({ id: 'task-' + (i + 1), ...r }));
    },
  });

})();
