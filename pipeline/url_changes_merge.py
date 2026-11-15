"""Add the latest URL changes to the running list (history/url_changes.json), keyed by kind|id|old_path.

Usage: python -I url_changes_merge.py <query_result_file> <history.json>
The query result is the saved answer of url_changes.sql (single cell `j`, a JSON array), or `[]` text.
"""
import json, os, sys

src, hist = sys.argv[1], sys.argv[2]
raw = open(src, encoding='utf-8').read().strip()
try:
    obj = json.loads(raw)
except ValueError:
    obj = []
if isinstance(obj, dict):
    res = obj.get('result') or {}
    if 'data_typed_array' in res:
        cell = res['data_typed_array'][0]['values'][0].get('str')
    elif 'data_array' in res:
        cell = res['data_array'][0]['values'][0].get('string_value')
    else:
        cell = obj['data']['rows'][0]['j']
    new = json.loads(cell or '[]')
else:
    new = obj
old = json.load(open(hist, encoding='utf-8')) if os.path.exists(hist) else []
rows = {f"{r['kind']}|{r['id']}|{r['old_path']}": r for r in old}
added = 0
for r in new:
    k = f"{r['kind']}|{r['id']}|{r['old_path']}"
    added += k not in rows
    rows[k] = r
json.dump(sorted(rows.values(), key=lambda r: r['date'], reverse=True), open(hist, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(len(new), 'URL changes pulled,', added, 'new,', len(rows), 'in history')
