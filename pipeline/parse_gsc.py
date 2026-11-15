"""Turn a Google Search Console text table (from the gsc MCP tools) into a compact JSON array.

Usage: python -I parse_gsc.py <input.txt> <output.json> [--strip-site]

The input may be the raw table text, a saved tool result ({"result": "..."}), or a list of
content blocks. Rows look like "dim1 | dim2 | clicks | impressions | 1.23% | 4.5"; the last four
fields are metrics, the rest are dimensions. Output rows: [dim..., clicks, impressions, ctr_pct, position].
Page dimensions lose the "https://bloomnest.example" prefix with --strip-site. Paginated pulls can be
concatenated into one input file; repeated header lines are skipped.
"""
import json, sys

src, dst = sys.argv[1], sys.argv[2]
strip = '--strip-site' in sys.argv
raw = open(src, encoding='utf-8').read()
try:
    obj = json.loads(raw)
    if isinstance(obj, dict) and 'result' in obj:
        raw = obj['result']
    elif isinstance(obj, list):
        raw = '\n'.join(b.get('text', '') for b in obj if isinstance(b, dict))
    elif isinstance(obj, str):
        raw = obj
except ValueError:
    pass

rows, header = [], None
for line in raw.splitlines():
    parts = [p.strip() for p in line.split(' | ')]
    if len(parts) < 5:
        continue
    if parts[-4] == 'Clicks':
        header = parts
        continue
    if header is None:
        continue
    try:
        c, i = int(parts[-4].replace(',', '')), int(parts[-3].replace(',', ''))
        ctr, pos = float(parts[-2].rstrip('%')), float(parts[-1])
    except ValueError:
        continue
    dims = [' | '.join(parts[:len(parts) - 4 - (len(header) - 5)])] + parts[len(parts) - 4 - (len(header) - 5):-4] if len(header) > 5 else [' | '.join(parts[:-4])]
    if strip:
        dims = [d[len('https://bloomnest.example'):] if d.startswith('https://bloomnest.example') else d for d in dims]
    rows.append(dims + [c, i, ctr, pos])

json.dump(rows, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(dst, len(rows), 'rows')
