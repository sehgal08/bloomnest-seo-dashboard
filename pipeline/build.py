"""Join Search Console pulls with Databricks content tables into the dashboard's file datasets.

Usage: python -I build.py <data_dir> <out_dir> <last_monday YYYY-MM-DD>

Inputs in <data_dir>: a_28d/a_w0/a_wm1, q_28d/q_w0/q_wm1, pq_article, pq_questions, trend_article/
trend_questions/trend_site, a_daily (page,date pull for /article/, 28 days) (parse_gsc.py output), db_content.txt (saved Databricks result with rows
kind, id, web_url, meta_title, keyword, created_at, updated_at) and optionally indexing.json
([[web_url, verdict, coverage, last_crawl], ...]).
Search Console's connector cuts page paths at 78 characters; a cut path is matched back to the full
URL when exactly one known page starts with it, otherwise it stays unresolved and the row says so.
Optional extras in <data_dir>:
- db_urls.json: every /article/ page in the CMS, with or without a meta title ([[id, web_url, meta_title, h1, created_at,
  updated_at], ...]). Used only to match URLs that the SEO list (db_content) can't: pages with no meta title.
- cut_split.json: {cut path: [{"path": full encoded path, "daily": [[date, clicks, impressions, position], ...]}, ...]}.
  Several articles can share the first 78 characters of their URL; exact per-article pulls (page contains "-<id>",
  dimension date, 28 days) give each its own numbers. Such a cut row is replaced by one row per article.
"""
import json, os, re, sys, collections
from urllib.parse import quote, unquote

data, out = sys.argv[1], sys.argv[2]
w0 = sys.argv[3] if len(sys.argv) > 3 else '2025-01-06'  # example Monday
SITE = 'https://bloomnest.example'
GSC = 'https://search.google.com/search-console/performance/search-analytics?resource_id=sc-domain%3Abloomnest.example&page=*'
CUT = 78


def load(name):
    with open(os.path.join(data, name), encoding='utf-8') as f:
        return json.load(f)


def save(name, rows):
    with open(os.path.join(out, name), 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, separators=(',', ':'))
    print(name, len(rows))


def enc(path):
    return quote(path, safe="/-_.~")


def lang(path):
    seg = path.split('/')[1]
    return {'hi': 'Hindi', 'ta': 'Tamil', 'te': 'Telugu', 'mr': 'Marathi', 'bn': 'Bengali'}.get(seg, 'English')


def slug_title(path):
    s = re.sub(r'%[0-9A-Fa-f]?$', '', path.rstrip('-').split('/')[-1])  # cut-off URL: drop a half percent code
    s = unquote(s, errors='replace').replace('�', '')
    parts = s.split('-')
    if parts and parts[-1].isdigit():
        parts = parts[:-1]
    t = ' '.join(p for p in parts if p).strip()
    return (t[:1].upper() + t[1:]) if t else path


class Resolver:
    def __init__(self, known):
        self.known = known  # encoded path -> record

    def __call__(self, p):
        if p in self.known:
            return p, self.known[p], 'exact'
        if len(p) >= CUT:
            m = [k for k in self.known if k.startswith(p)]
            if len(m) == 1:
                return m[0], self.known[m[0]], 'prefix'
            return None, None, 'cut' if m else 'unknown_cut'
        return None, None, 'unknown'


def metrics(rows):
    """page -> [clicks, impressions, ctr %, position]. A cut URL shared by several articles comes back as several rows
    with the same page; add them up (position weighted by impressions) instead of keeping only the last one."""
    out, n = {}, collections.Counter(r[0] for r in rows)
    for p, c, i, ctr, pos in rows:
        if n[p] == 1:
            out[p] = [c, i, ctr, pos]
            continue
        o = out.setdefault(p, [0, 0, 0, 0.0])
        o[0] += c; o[1] += i; o[3] += pos * i
    for p, o in out.items():
        if n[p] > 1:
            o[2] = round(100 * o[0] / o[1], 2) if o[1] else 0
            o[3] = round(o[3] / o[1], 1) if o[1] else None
    return out


shared = collections.Counter()  # cut page -> how many Search Console rows (articles) share it


# ---------- articles ----------
if os.path.exists(os.path.join(data, 'db_content.txt')):
    content = load('db_content.txt')['data']['rows']
    arts = [r for r in content if r['kind'] == 'article' and r['web_url']]
    curs = [[r['id'], r['web_url'], r['keyword'], r['created_at']] for r in content if r['kind'] == 'qa_page' and r['web_url']]
else:  # first build: older file layout
    arts = load('db_articles.txt')['data']['rows']
    curs = load('content_w0.json')['qa_all']
art_known = {enc(r['web_url']): r for r in arts}
res_seo = Resolver(art_known)
all_known = {}
if os.path.exists(os.path.join(data, 'db_urls.json')):
    for i, u, mt, h1, cr, up in load('db_urls.json'):
        all_known[enc(u)] = {'id': i, 'web_url': u, 'meta_title': mt or h1 or '', 'created_at': cr or '', 'updated_at': up or ''}
res_all = Resolver(all_known)


def res(p):
    """SEO articles first; the full article list only when the SEO list has no match at all."""
    full, rec, how = res_seo(p)
    if full or how == 'cut' or not all_known:
        return full, rec, how
    full2, rec2, how2 = res_all(p)
    return (full2, rec2, how2) if full2 or how2 == 'cut' else (full, rec, how)


split = load('cut_split.json') if os.path.exists(os.path.join(data, 'cut_split.json')) else {}


def window(daily, start, end):
    """[clicks, impressions, ctr %, position] over start..end (inclusive) from daily rows."""
    rows = [r for r in daily if start <= r[0] <= end]
    c, i = sum(r[1] for r in rows), sum(r[2] for r in rows)
    pos = round(sum(r[2] * r[3] for r in rows) / i, 1) if i else None
    return [c, i, round(100 * c / i, 2) if i else 0, pos]
_a28 = load('a_28d.json')
shared.update(r[0] for r in _a28)
m28, mw0, mw1 = metrics(_a28), metrics(load('a_w0.json')), metrics(load('a_wm1.json'))

pq_a = load('pq_article.json')
top_q = {}
for q, p, c, i, *_, pos in pq_a:
    if p not in top_q or i > top_q[p][2]:
        top_q[p] = (q, c, i, pos)

import datetime
_d = datetime.date.fromisoformat(w0)
W0 = (w0, str(_d + datetime.timedelta(days=6)))
W1 = (str(_d - datetime.timedelta(days=7)), str(_d - datetime.timedelta(days=1)))
D28 = (str(_d - datetime.timedelta(days=21)), W0[1])  # the 28 days ending last Sunday; daily pulls may run later
pages = []  # (page key, full path, record, how, 28d, W0, W1, top query)
for p in set(m28) | set(mw0) | set(mw1):
    if p in split:
        parts = [x for x in split[p] if x['daily']]
        top = max(parts, key=lambda x: sum(r[2] for r in x['daily']))['path'] if parts else None
        for x in parts:
            d = x['daily']
            pages.append((x['path'], x['path'], all_known.get(x['path']) or art_known.get(x['path']), 'split',
                          window(d, *D28), window(d, *W0), window(d, *W1), top_q.get(p) if x['path'] == top else None))
        continue
    full, rec, how = res(p)
    pages.append((p, full, rec, how, m28.get(p, [0, 0, 0, None]), mw0.get(p, [0, 0, 0, None]), mw1.get(p, [0, 0, 0, None]), top_q.get(p)))
articles = []
for p, full, rec, how, a, b, c, tq in sorted(pages, key=lambda x: -(x[4][1] or 0)):
    articles.append({
        'page': p,
        'url': SITE + full if full else None,
        'gsc_link': GSC + (p if how != 'split' else p[:CUT]),
        'title': rec['meta_title'].strip() if rec else (str(shared[p]) + ' articles start with: ' if shared[p] > 1 else '') + slug_title(p) + (' …' if len(p) >= CUT else ''),
        'language': lang(p),
        'url_status': {'exact': 'Full URL', 'prefix': 'Matched', 'split': 'Matched by article ID', 'cut': 'Cut off', 'unknown_cut': 'Cut off', 'unknown': 'Not in CMS list'}[how],
        'clicks_28d': a[0], 'impr_28d': a[1], 'ctr_28d': a[2], 'pos_28d': a[3],
        'clicks_last_week': b[0], 'impr_last_week': b[1], 'pos_last_week': b[3],
        'clicks_week_before': c[0], 'impr_week_before': c[1], 'pos_week_before': c[3],
        'top_query': tq[0] if tq else None, 'top_query_impr_28d': tq[2] if tq else None, 'top_query_pos': tq[3] if tq else None,
        'created_at': rec['created_at'][:10] if rec else None,
        'updated_at': rec['updated_at'][:10] if rec else None,
    })
save('articles_pages.json', articles)
print(' url_status', collections.Counter(a['url_status'] for a in articles))

# ---------- daily numbers for the top article pages (before/after an edit) ----------
if os.path.exists(os.path.join(data, 'a_daily.json')):
    keep = {a['page'] for a in articles}
    # Also every page in the content changelog (content_changelog.json, optional), so edits get a click effect.
    if os.path.exists(os.path.join(data, 'content_changelog.json')):
        for e in load('content_changelog.json'):
            if e.get('kind') == 'Article' and e.get('page_key'):
                keep.add(e['page_key']); keep.add(e['page_key'][:CUT])
    agg = {}  # (page, date) -> [clicks, impressions, position x impressions]; shared cut URLs add up
    for p, d, c, i, ctr, pos in load('a_daily.json'):
        if p in keep and p not in split:
            o = agg.setdefault((p, d), [0, 0, 0.0]); o[0] += c; o[1] += i; o[2] += pos * i
    daily = [{'page': p, 'date': d, 'clicks': c, 'impressions': i, 'position': round(w / i, 1) if i else None}
             for (p, d), (c, i, w) in agg.items()]
    # Split cut rows: each article's own daily numbers.
    daily += [{'page': x['path'], 'date': d, 'clicks': c, 'impressions': i, 'position': pos}
              for parts in split.values() for x in parts for d, c, i, pos in x['daily']]
    save('article_daily.json', daily)

# ---------- community Q&A pages ----------
cur_known = {enc(r[1]): {'id': r[0], 'web_url': r[1], 'keyword': r[2], 'created_at': r[3]} for r in curs if r[1]}
resq = Resolver(cur_known)
q28, qw0, qw1 = metrics(load('q_28d.json')), metrics(load('q_w0.json')), metrics(load('q_wm1.json'))
top_qq = {}
for q, p, c, i, *_, pos in load('pq_questions.json'):
    if p not in top_qq or i > top_qq[p][2]:
        top_qq[p] = (q, c, i, pos)

# extra_questions.json ([[id, web_url], ...], optional): full URLs of other question pages whose
# Search Console URL was cut off, looked up in the post table by prefix.
extra = {}
if os.path.exists(os.path.join(data, 'extra_questions.json')):
    extra = {enc(u): u for _, u in load('extra_questions.json') if u}
rows = {}
for p in set(q28) | set(qw0) | set(qw1):
    full, rec, how = resq(p)
    if not full and how in ('cut', 'unknown_cut'):
        m = [k for k in extra if k.startswith(p)]
        if len(m) == 1:
            full, how = m[0], 'unknown'  # a real question page, just not a curated one
    rows[full or p] = (p, rec, how)
for k, rec in cur_known.items():
    rows.setdefault(k, (k, rec, 'exact'))

qa_list = []
for key, (p, rec, how) in rows.items():
    a, b, c = q28.get(p, [0, 0, 0, None]), qw0.get(p, [0, 0, 0, None]), qw1.get(p, [0, 0, 0, None])
    tq = top_qq.get(p)
    qa_list.append({
        'page': key,
        'url': SITE + key if (rec or how == 'unknown') else None,
        'gsc_link': GSC + p,
        'title': slug_title(key),
        'language': lang(key),
        'curated': bool(rec),
        'target_keyword': rec['keyword'] if rec else None,
        'clicks_28d': a[0], 'impr_28d': a[1], 'ctr_28d': a[2], 'pos_28d': a[3],
        'clicks_last_week': b[0], 'impr_last_week': b[1], 'pos_last_week': b[3],
        'clicks_week_before': c[0], 'impr_week_before': c[1], 'pos_week_before': c[3],
        'top_query': tq[0] if tq else None, 'top_query_impr_28d': tq[2] if tq else None, 'top_query_pos': tq[3] if tq else None,
        'created_at': rec['created_at'][:10] if rec else None,
    })
qa_list.sort(key=lambda r: (-r['impr_28d'], r['page']))
save('qa_pages.json', qa_list)

# ---------- daily trend ----------
# hist_site / hist_article / hist_questions (dimensions date,device, up to 16 months) win over the
# 13-week trend_* files; devices are summed and position is impression-weighted.
def daily(seg_files):
    days = {}
    for f in seg_files:
        if not os.path.exists(os.path.join(data, f)):
            continue
        for r in load(f):
            d, c, i, pos = r[0], r[-4], r[-3], r[-1]
            t = days.setdefault(d, [0, 0, 0.0])
            t[0] += c; t[1] += i; t[2] += pos * i
        if days:
            return days
    return days

trend = []
all_dates = set()
segs = (('Articles', ('hist_article.json', 'trend_article.json')), ('Community Q&A', ('hist_questions.json', 'trend_questions.json')),
        ('Whole site', ('hist_site.json', 'trend_site.json')))
per_seg = {seg: daily(files) for seg, files in segs}
for v in per_seg.values():
    all_dates |= set(v)
for seg, days in per_seg.items():
    # Only from the first day this segment has data: earlier days are unknown, not zero.
    for d in sorted(x for x in all_dates if days and x >= min(days)):
        c, i, w = days.get(d, [0, 0, 0.0])  # no row = no clicks or impressions that day
        trend.append({'date': d, 'segment': seg, 'clicks': c, 'impressions': i,
                      'ctr': round(c / i * 100, 2) if i else 0, 'position': round(w / i, 1) if i else None})
save('daily_trend.json', trend)

# ---------- query x page ----------
# pq_article_big.json (up to 25,000 pairs) wins over the 1,000-pair pq_article.json. To keep the file small,
# a pair is kept when it has 10+ impressions or its search has 2+ of our pages (what cannibalization needs).
qp = []
art_file = 'pq_article_big.json' if os.path.exists(os.path.join(data, 'pq_article_big.json')) else 'pq_article.json'
for kind, f in (('Article', art_file), ('Community Q&A', 'pq_questions.json')):
    look = res if kind == 'Article' else resq
    rows = load(f)
    pages_per_q = collections.Counter(r[0] for r in rows)
    for q, p, c, i, *_, pos in rows:
        if i < 10 and pages_per_q[q] < 2:
            continue
        full, rec, how = look(p)
        qp.append({'query': q, 'page': p, 'url': SITE + full if full else None, 'content_type': kind,
                   'clicks_28d': c, 'impr_28d': i, 'position': pos})
save('query_pages.json', qp)

# ---------- URLs for the redirect check (light scope) ----------
check = {}
def add(path, reason):
    if path and path.startswith('/') and path not in check:
        check[path] = reason
for a in articles:
    if a['url']:
        add(unquote(a['url'][len(SITE):]), 'Top article')
for c in qa_list:
    if c['url']:
        add(unquote(c['url'][len(SITE):]), 'Q&A')
if os.path.exists(os.path.join(data, 'url_changes.json')):
    for u in load('url_changes.json'):
        check[u['old_path']] = 'Old URL (changed ' + u['date'] + ')'
        add(u['new_path'], 'New URL (changed ' + u['date'] + ')')
by_q = collections.defaultdict(list)
for r in qp:
    by_q[r['query']].append(r)
for q, rs in by_q.items():
    tot = sum(r['impr_28d'] for r in rs)
    big = [r for r in rs if tot and r['impr_28d'] / tot >= 0.15]
    if tot >= 100 and len(big) >= 2:
        for r in big:
            if r['url']:
                add(unquote(r['url'][len(SITE):]), 'Competing page')
save('urls_to_check.json', [{'path': p, 'reason': r} for p, r in check.items()])

# ---------- indexing ----------
if os.path.exists(os.path.join(data, 'indexing.json')):
    kinds = {r[1]: 'Community Q&A' for r in curs}
    for r in arts:
        if r['created_at'] >= w0:
            kinds[r['web_url']] = 'Article (new)'
        elif r['updated_at'] >= w0:
            kinds[r['web_url']] = 'Article (updated)'
    titles = {r['web_url']: (r['meta_title'] or '').strip() for r in arts}
    idx = []
    for r in load('indexing.json'):
        path, verdict, coverage, crawl = (r + [None] * 4)[:4]
        idx.append({'page': path, 'url': SITE + enc(path), 'title': titles.get(path) or slug_title(path), 'content_type': kinds.get(path, 'Other'),
                    'verdict': verdict, 'coverage': coverage, 'last_crawl': (crawl or '')[:10] or None,
                    'indexed': verdict == 'PASS'})
    save('indexing.json', idx)
    print(' coverage', collections.Counter(i['coverage'] for i in idx).most_common(8))
