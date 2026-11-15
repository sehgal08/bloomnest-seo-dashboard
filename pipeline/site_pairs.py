"""Pages Google shows for each search, whole site (all page types), for the Keyword tracker's "Our page" column.

Usage: python -I -X utf8 site_pairs.py <pq_site.json> <data_dir> <out.json> [<pq_tracked.json>]
pq_site.json: parse_gsc.py output (--strip-site) of a Search Console pull with dimensions "query,page", no filter,
row_limit 25000, sorted by impressions, 28 days: [query, path, clicks, impressions, ctr, position].
<data_dir> holds db_content.txt (weekly task) or db_articles.txt + content_w0.json (first build), for article titles
and to match cut-off URLs (Search Console cuts paths at 78 characters) to full ones.
pq_tracked.json (optional): exact per-search pulls (filter query equals) for the tracked keywords and trending searches, same row shape. Search Console
returns the most-clicked rows first, so the 25,000-row pull misses pairs with impressions but no clicks; for any search in
pq_tracked.json its exact rows replace the big pull's rows (its pages with 10+ impressions, or just its top page).
Keeps searches with 300+ impressions in total (the tracker follows the top 25) and, for each, pages with 10+ impressions.
Output rows: {query, page, url, gsc_link, title, type, clicks_28d, impr_28d, position}; a cut-off URL that matches no known
page gets gsc_link (Search Console filtered to it) instead of url.
"""
import bisect, json, os, re, sys
from collections import defaultdict
from urllib.parse import quote, unquote

src, data, out = sys.argv[1:4]
tracked_file = sys.argv[4] if len(sys.argv) > 4 else None
SITE = 'https://bloomnest.example'
GSC = 'https://search.google.com/search-console/performance/search-analytics?resource_id=sc-domain%3Abloomnest.example&page=*'
enc = lambda p: quote(p, safe='/-_.~')


def load(name):
    return json.load(open(os.path.join(data, name), encoding='utf-8'))


titles = {}
if os.path.exists(os.path.join(data, 'db_content.txt')):
    for r in load('db_content.txt')['data']['rows']:
        if r.get('web_url'):
            titles[enc(r['web_url'])] = (r['web_url'], (r.get('meta_title') or '').strip())
else:
    for r in load('db_articles.txt')['data']['rows']:
        if r.get('web_url'):
            titles[enc(r['web_url'])] = (r['web_url'], (r.get('meta_title') or '').strip())
    for r in load('content_w0.json').get('qa_all', []):
        if r[1]:
            titles.setdefault(enc(r[1]), (r[1], ''))
klist = sorted(titles)


def resolve(p):
    if p in titles:
        return p
    if len(p) >= 70:
        i = bisect.bisect_left(klist, p); m = []
        while i < len(klist) and klist[i].startswith(p) and len(m) < 2:
            m.append(klist[i]); i += 1
        if len(m) == 1:
            return m[0]
    return None


def kind(p):
    if re.match(r'^/([a-z]{2}/)?article/', p): return 'Article'
    if re.match(r'^/([a-z]{2}/)?questions/', p): return 'Q&A'
    if re.match(r'^/([a-z]{2}/)?baby-names/', p): return 'Baby name'
    if p.startswith('/product/'): return 'Product'
    if p.startswith('/category/'): return 'Category'
    if p.startswith('/tools/'): return 'Tool'
    if p in ('', '/') or p.startswith('/?'): return 'Home'
    return 'Page'


def slug_title(p):
    s = re.sub(r'%[0-9A-Fa-f]?$', '', p.split('?')[0].rstrip('/').split('/')[-1])  # cut-off URL: drop a half percent code
    s = unquote(s, errors='replace').replace('�', '')
    s = re.sub(r'-\d+$', '', s).replace('-', ' ').strip()
    return (s[:1].upper() + s[1:]) if s else 'Home page'


rows = json.load(open(src, encoding='utf-8'))
exact = json.load(open(tracked_file, encoding='utf-8')) if tracked_file and os.path.exists(tracked_file) else []
exact_q = {r[0] for r in exact}
# Exact pulls can list many one-impression copies of a cut-off URL: keep pages with 10+ impressions (at least the top one).
top_i = defaultdict(int)
for r in exact:
    top_i[r[0]] = max(top_i[r[0]], r[3])
exact = [r for r in exact if r[3] >= 10 or r[3] == top_i[r[0]]]
rows = [r for r in rows if r[0] not in exact_q]
total = defaultdict(int)
for q, p, c, i, ctr, pos in rows:
    total[q] += i
outrows = []
for q, p, c, i, ctr, pos, *_ in rows + [list(r) for r in exact]:
    if (q not in exact_q) and (total[q] < 300 or i < 10):
        continue
    full = resolve(p)
    path, meta = titles.get(full, (None, '')) if full else (None, '')
    k = kind(p)
    cut = not full and len(p) >= 70
    title = 'Home page' if k == 'Home' else (meta or slug_title(path or p)) + ('…' if cut else '')
    outrows.append({'query': q, 'page': p, 'url': SITE + (full or p) if not cut else None, 'gsc_link': GSC + p if cut else None,
                    'title': title, 'type': k, 'clicks_28d': c, 'impr_28d': i, 'position': pos})
outrows.sort(key=lambda r: (r['query'], -r['impr_28d']))
json.dump(outrows, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(out, len(outrows), 'pairs for', len({r['query'] for r in outrows}), 'searches;', sum(1 for r in outrows if not r['url']), 'cut off (linked to Search Console)')
