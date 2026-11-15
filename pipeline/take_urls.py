"""Save the CMS list of every /article/ page (with or without a meta title) for URL matching.

Usage: python -I -X utf8 take_urls.py <out db_urls.json> <saved result 1> [<saved result 2> ...]
Each saved result is the Databricks tool's JSON for one half of the query in SKILL.md (column j = JSON list of
[id, web_url, meta_title, h1, created_at, updated_at]).
"""
import json, sys
rows = []
for f in sys.argv[2:]:
    d = json.load(open(f, encoding='utf-8'))
    r = d['result']
    v = r['data_array'][0]['values'][0] if 'data_array' in r else r['data_typed_array'][0]['values'][0]
    rows += json.loads(v.get('string_value') or v.get('str'))
json.dump(rows, open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(sys.argv[1], len(rows), 'article URLs')
