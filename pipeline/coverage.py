"""Which SEO articles showed up in Google search in the last 28 days.

Usage: python -I coverage.py <a_all.json from parse_gsc> <db_articles or db_content file> <out.json> <last_monday>
An article with any impression was indexed. A Search Console URL cut off at 78 characters that fits
several CMS articles marks them all "Unclear (URL cut off)". Output rows: page, url, title, language,
created_at, updated_at, impr_28d, clicks_28d, search_status ("In Google" / "No impressions" / "Unclear").
"""
import json, sys
from urllib.parse import quote

gsc_file, cms_file, out_file, w0 = sys.argv[1:5]
gsc = json.load(open(gsc_file, encoding='utf-8'))
cms = json.load(open(cms_file, encoding='utf-8'))['data']['rows']
arts = [r for r in cms if r.get('kind', 'article') == 'article' and r['web_url']]
enc = lambda p: quote(p, safe='/-_.~')
LANG = {'hi': 'Hindi', 'ta': 'Tamil', 'te': 'Telugu', 'mr': 'Marathi', 'bn': 'Bengali'}
known = {enc(r['web_url']): r for r in arts}
keys = sorted(known)

status = {}  # encoded path -> [status, impr, clicks]
import bisect
from collections import Counter as _C
# How many Search Console rows share each cut-off prefix: if that is at least the number of CMS
# articles starting with it, every one of those articles got impressions.
cut_rows = _C(p for p, *_ in gsc if len(p) >= 78 and p not in known)
for p, c, i, ctr, pos in gsc:
    if p in known:
        status[p] = ['In Google', i, c]
        continue
    if len(p) >= 78:
        lo = bisect.bisect_left(keys, p)
        cands = []
        while lo < len(keys) and keys[lo].startswith(p):
            cands.append(keys[lo]); lo += 1
        if len(cands) == 1:
            status[cands[0]] = ['In Google', i, c]
        elif cands and cut_rows[p] >= len(cands):
            for k in cands:
                status[k] = ['In Google', None, None]
        else:
            for k in cands:
                if status.get(k, [''])[0] != 'In Google':
                    status[k] = ['Unclear', None, None]

rows = []
for k, r in known.items():
    st, i, c = status.get(k, ['No impressions', 0, 0])
    rows.append({'page': k, 'title': (r['meta_title'] or '').strip(),
                 'language': LANG.get(r['web_url'].split('/')[1], 'English'),
                 'created_at': r['created_at'][:10], 'updated_at': r['updated_at'][:10],
                 'new_last_week': r['created_at'][:10] >= w0,
                 'impr_28d': i, 'clicks_28d': c, 'search_status': st})
rows.sort(key=lambda r: (r['search_status'] != 'No impressions', r['created_at']), reverse=False)
json.dump(rows, open(out_file, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
from collections import Counter
print(len(rows), 'articles;', Counter(r['search_status'] for r in rows))
print('no impressions by created year:', sorted(Counter(r['created_at'][:4] for r in rows if r['search_status'] == 'No impressions').items()))
print('no impressions by language:', Counter(r['language'] for r in rows if r['search_status'] == 'No impressions').most_common())
