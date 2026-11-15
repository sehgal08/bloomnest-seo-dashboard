"""Every /article/ page with Google impressions in 28 days, as the dashboard's article_pages_all dataset.

Usage: python -I -X utf8 pages_all.py <a_all.json> <out.json>
a_all.json: parse_gsc.py output of the "a_all" pull ([path, clicks, impressions, ctr, position], paths without the site).
Paths stay as Search Console returns them: long ones are cut at 78 characters, and the page matches them by prefix.
"""
import json, sys

rows = json.load(open(sys.argv[1], encoding='utf-8'))
out = [{'page': p, 'clicks_28d': c, 'impr_28d': i, 'pos_28d': pos} for p, c, i, ctr, pos in rows]
json.dump(out, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(sys.argv[2], len(out), 'pages')
