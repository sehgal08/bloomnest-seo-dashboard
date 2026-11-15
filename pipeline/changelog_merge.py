"""Merge the latest content-changelog query result into the running history.

Usage: python -I changelog_merge.py <query_result_file> <history.json> [<history_out.json>]
The query result is the saved answer of changelog.sql: a Databricks SQL answer (data_typed_array or
data_array) or a dbhub answer (data.rows[0].j), whose single cell `j` is a JSON array of edits.
Rows carry seo (meta title after the edit: the dashboard's Web view) and real (app article or tier-1 web page:
the App view). History rows are keyed by kind|id|date; a newer pull of the same page and day replaces the older one,
since the change feed always gives that day's first-before and last-after state.
"""
import json, os, sys

src, hist = sys.argv[1], sys.argv[2]
out = sys.argv[3] if len(sys.argv) > 3 else hist
raw = json.load(open(src, encoding='utf-8'))


def cell(r):
    if isinstance(r, dict) and 'data' in r and 'rows' in r['data']:
        return r['data']['rows'][0]['j']
    res = r['result']
    if 'data_typed_array' in res:
        v = res['data_typed_array'][0]['values'][0]
        return v.get('str')
    return res['data_array'][0]['values'][0].get('string_value')


new = json.loads(cell(raw) or '[]')
old = json.load(open(hist, encoding='utf-8')) if os.path.exists(hist) else []
rows = {f"{r['kind']}|{r['id']}|{r['date']}": r for r in old}
added = sum(1 for r in new if f"{r['kind']}|{r['id']}|{r['date']}" not in rows)
from urllib.parse import quote
LANG = {'hi': 'Hindi', 'ta': 'Tamil', 'te': 'Telugu', 'mr': 'Marathi', 'bn': 'Bengali'}
for r in new:
    for k in ('sections_added', 'sections_removed'):
        r[k] = [s for s in (r.get(k) or []) if s][:12]
    r['key'] = f"{r['kind']}|{r['id']}|{r['date']}"
    path = r.get('path') or ''
    # Same encoding as the Search Console page keys (cut to 78 characters there), to join daily clicks.
    r['page_key'] = quote(path, safe='/-_.~')
    if path.startswith('/'):
        r['language'] = LANG.get(path.split('/')[1] if path.count('/') > 1 else '', 'English')
    else:  # app-only article (no web page): the content row's language
        r['language'] = {'1': 'English', '2': 'Hindi', '3': 'Bengali', '4': 'Telugu', '5': 'Tamil'}.get(str(r.get('language_ids') or '').split(',')[0].strip(), 'English')
        r['page_key'] = ''
    rows[r['key']] = r
# The dashboard's file loader reads text and numbers: keep the flags as "true"/"false" text.
for r in rows.values():
    for k in ('seo', 'real', 'web'):
        if isinstance(r.get(k), bool):
            r[k] = 'true' if r[k] else 'false'
    r.setdefault('language_ids', '')
    if r['language_ids'] is None:
        r['language_ids'] = ''
merged = sorted(rows.values(), key=lambda r: (r.get('edited_at') or r['date']), reverse=True)
json.dump(merged, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(new), 'edits pulled,', added, 'new,', len(merged), 'in history')
