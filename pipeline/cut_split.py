"""Split Search Console rows whose URL was cut at 78 characters and starts like several articles.

Search Console's connector cuts page paths at 78 characters. Hindi, Tamil, Telugu, Bengali... URLs are long
percent codes, so two articles can share those 78 characters and come back as one cut row. This finds such
rows and, after exact per-article pulls, gives each article its own numbers.

  python -I -X utf8 cut_split.py plan <data_dir> [min_clicks=20] [max_articles=20]
      reads a_28d.json, db_urls.json and db_content.txt (SEO list); writes data_dir/cut_plan.json and data_dir/cut_todo.txt, one line per
      cut row with min_clicks+ clicks in 28 days that matches 2 to max_articles articles (bigger groups stay one row,
      titled "N articles start with: …", with the rows added up):
      "GROUP <n> | clicks <c> | <expr> <expr> ..." where each expr ("-<article id>") picks one article's URL.
      For every expr, pull Search Console: dimensions "date", filter page contains <expr>, the 28-day window,
      row_limit 50; append "### GROUP <n> <expr>" and the answer's table rows to data_dir/cut_raw.txt.
  python -I -X utf8 cut_split.py build <data_dir>
      reads cut_plan.json and cut_raw.txt; writes data_dir/cut_split.json for build.py and prints, per group,
      the cut row's clicks against the clicks found, so a group with missing pulls shows up.
"""
import json, os, re, sys
from collections import defaultdict
from urllib.parse import quote

mode, data = sys.argv[1], sys.argv[2]
CUT = 78
enc = lambda p: quote(p, safe='/-_.~')
J = lambda n: json.load(open(os.path.join(data, n), encoding='utf-8'))

if mode == 'plan':
    min_clicks = int(sys.argv[3]) if len(sys.argv) > 3 else 20
    max_articles = int(sys.argv[4]) if len(sys.argv) > 4 else 20
    keys = sorted({enc(r[1]): r for r in J('db_urls.json')})
    ids = {enc(r[1]): r[0] for r in J('db_urls.json')}
    # Rows the SEO list (db_content.txt, or db_articles.txt on the first build) matches to exactly one article are
    # resolved by build.py already; skip them.
    seo_file = 'db_content.txt' if os.path.exists(os.path.join(data, 'db_content.txt')) else 'db_articles.txt'
    seo = sorted({enc(r['web_url']) for r in J(seo_file)['data']['rows'] if r.get('web_url') and r.get('kind', 'article') == 'article'})
    clicks = defaultdict(int)
    for r in J('a_28d.json'):
        if len(r[0]) >= CUT and r[0] not in ids and sum(1 for k in seo if k.startswith(r[0])) != 1:
            clicks[r[0]] += r[1]
    plan, lines = [], []
    for p, c in sorted(clicks.items(), key=lambda x: -x[1]):
        cands = [k for k in keys if k.startswith(p)]
        if c < min_clicks or not 2 <= len(cands) <= max_articles:
            continue
        exprs = []
        for k in cands:
            m = re.search(r'-(\d+)$', k)
            e = '-' + m.group(1) if m else k[-40:]
            if sum(1 for x in keys if e in x) > 1:
                e = k[-40:]
            exprs.append({'expr': e, 'path': k, 'id': ids[k]})
        plan.append({'cut': p, 'clicks': c, 'cands': exprs})
        lines.append(f"GROUP {len(plan) - 1} | clicks {c} | " + ' '.join(x['expr'] for x in exprs))
    json.dump(plan, open(os.path.join(data, 'cut_plan.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    open(os.path.join(data, 'cut_todo.txt'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    print(len(plan), 'groups,', sum(len(g['cands']) for g in plan), 'pulls,', sum(g['clicks'] for g in plan), 'clicks')

elif mode == 'build':
    daily, cur = {}, None
    for line in open(os.path.join(data, 'cut_raw.txt'), encoding='utf-8'):
        line = line.strip()
        if line.startswith('### '):
            cur = line.split()[-1]
            daily.setdefault(cur, [])
        elif cur and line.count('|') == 4:
            d, c, i, ctr, pos = [x.strip() for x in line.split('|')]
            if d[:4].isdigit() and int(i.replace(',', '')) > 0:
                daily[cur].append([d, int(c.replace(',', '')), int(i.replace(',', '')), float(pos)])
    split = {}
    for g in J('cut_plan.json'):
        parts = [{'path': x['path'], 'id': x['id'], 'daily': daily[x['expr']]} for x in g['cands'] if daily.get(x['expr'])]
        missing = [x['expr'] for x in g['cands'] if x['expr'] not in daily]
        found = sum(r[1] for x in parts for r in x['daily'])
        print(f"{g['clicks']:>6} clicks in cut row, {found:>6} found in {len(parts)} articles" + (f"; not pulled: {' '.join(missing)}" if missing else ''))
        if parts:
            split[g['cut']] = parts
    json.dump(split, open(os.path.join(data, 'cut_split.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('cut_split.json:', len(split), 'cut rows split into', sum(len(v) for v in split.values()), 'articles')
