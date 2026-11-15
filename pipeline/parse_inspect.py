"""Turn gsc batch_url_inspection text results into indexing.json rows [web_url, verdict, coverage, last_crawl].
Usage: python -I parse_inspect.py <raw.txt> <out.json>   (raw.txt may hold many results appended together)"""
import json, re, sys
from urllib.parse import unquote
raw = open(sys.argv[1], encoding='utf-8').read()
for m in re.finditer(r'\{"result":\s*"((?:[^"\\]|\\.)*)"\}', raw):
    raw = raw.replace(m.group(0), json.loads('"' + m.group(1) + '"'))
rows, cur = {}, None
for line in raw.splitlines():
    m = re.match(r'^https://bloomnest\.example(/\S*):\s*$', line.strip())
    if m:
        cur = unquote(m.group(1)); rows[cur] = [cur, None, None, '']
        continue
    if cur and line.strip().startswith('Status:'):
        v = line.split(':', 1)[1].strip()
        verdict, _, coverage = v.partition(' - ')
        rows[cur][1], rows[cur][2] = verdict.strip(), (coverage or verdict).strip()
    elif cur and line.strip().startswith('Last Crawl:'):
        c = line.split(':', 1)[1].strip()
        rows[cur][3] = '' if c.lower() in ('never', 'n/a', 'none') else c[:10]
    elif cur and line.strip().lower().startswith('error'):
        rows[cur][1], rows[cur][2] = 'ERROR', line.strip()
out = [r for r in rows.values() if r[1]]
json.dump(out, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False)
print(len(out), 'rows;', sum(1 for r in out if r[1] == 'PASS'), 'PASS')
