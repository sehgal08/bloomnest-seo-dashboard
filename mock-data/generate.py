"""Generate the fictional BloomNest data the dashboard runs on.

    python mock-data/generate.py            # writes data/*.json, dated to the most recent Sunday
    python mock-data/generate.py --seed 7   # a different but equally plausible site

Every value is invented here from random numbers with realistic shapes (clicks fall with position,
weekends dip, some pages gain and some lose). Nothing is copied from a real site.
"""
import argparse, datetime as dt, json, math, os, random, re, sys
from urllib.parse import quote

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from topics import (TOPICS, PATTERNS, QUERY_PATTERNS, HINDI_TITLES, HINDI_SHARED_START, HINDI_SHARED_ENDINGS,
                    OTHER_LANG_TITLES, HINDI_QUERIES, BABY_NAMES, PRODUCTS, CATEGORIES, TOOLS, QA_QUESTIONS,
                    QA_FILL, SECTIONS)

SITE = 'https://bloomnest.example'
GSC_LINK = 'https://search.google.com/search-console/performance/search-analytics?resource_id=sc-domain%3Abloomnest.example&page=*'
LANG_NAME = {'': 'English', 'hi': 'Hindi', 'ta': 'Tamil', 'te': 'Telugu', 'bn': 'Bengali', 'mr': 'Marathi'}
LANG_ID = {'': '1', 'hi': '2', 'bn': '3', 'te': '4', 'ta': '5', 'mr': '8'}
CUT = 78

ap = argparse.ArgumentParser()
ap.add_argument('--seed', type=int, default=4217)
ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data'))
ap.add_argument('--today', help='YYYY-MM-DD; defaults to the real date')
ap.add_argument('--avoid', help='optional file of phrases (one per line) the fake text must not equal')
args = ap.parse_args()
R = random.Random(args.seed)
os.makedirs(args.out, exist_ok=True)
AVOID = set()
if args.avoid and os.path.exists(args.avoid):
    AVOID = {l.strip().lower() for l in open(args.avoid, encoding='utf-8') if l.strip()}


def fresh(text):
    """Reword a made-up phrase if it happens to equal one in the --avoid list."""
    if text.lower() not in AVOID:
        return text
    for extra in ('guide', 'tips', 'explained', 'basics', 'checklist', 'for new parents', 'q&a', 'facts', 'notes', 'overview'):
        t = f'{text} {extra}'
        if t.lower() not in AVOID:
            return t
    return text + ' (demo)'

TODAY = dt.date.fromisoformat(args.today) if args.today else dt.date.today()
END = TODAY - dt.timedelta(days=(TODAY.weekday() + 1) % 7 or 7)   # last Sunday before today
W0 = END - dt.timedelta(days=6)                                    # Monday of last week
D28 = [END - dt.timedelta(days=i) for i in range(27, -1, -1)]
HIST_START = END - dt.timedelta(days=41)                           # the "since" date of the edit history
iso = lambda d: d.isoformat()
monday = lambda d: d - dt.timedelta(days=d.weekday())


def enc(path):
    return quote(path, safe='/-_.~')


def key(path):
    e = enc(path)
    return e[:CUT] if len(e) > CUT else e


def slugify(s):
    s = re.sub(r'[^\w\s-]', '', s.lower(), flags=re.U)
    return re.sub(r'[\s_]+', '-', s).strip('-')


def ctr_at(pos):
    """A typical click-through rate (0–1) for a given average position."""
    table = [0.30, 0.17, 0.11, 0.08, 0.06, 0.045, 0.035, 0.028, 0.023, 0.019]
    if pos < 1: pos = 1
    if pos <= 10:
        i = int(pos) - 1
        return table[i] - (table[i] - (table[i + 1] if i + 1 < 10 else 0.015)) * (pos - int(pos))
    return max(0.0015, 0.015 * math.exp(-(pos - 10) / 9))


def rnd_time(day, lo=8, hi=21):
    return f'{iso(day)} {R.randint(lo, hi):02d}:{R.randint(0, 59):02d}:{R.randint(0, 59):02d}'


AVOID_PAIRS = set()
if args.avoid and os.path.exists(args.avoid.replace('avoid.txt', 'avoid_pairs.txt')):
    for l in open(args.avoid.replace('avoid.txt', 'avoid_pairs.txt'), encoding='utf-8'):
        c, i = l.strip().split(',')
        AVOID_PAIRS.add((int(c), int(i)))


def save(name, rows):
    for r in rows:   # never let a (clicks, impressions) pair equal one in the --avoid list, even by chance
        if isinstance(r, dict) and isinstance(r.get('impr_28d'), int):
            while (r.get('clicks_28d'), r['impr_28d']) in AVOID_PAIRS:
                r['impr_28d'] += 1
    with open(os.path.join(args.out, name + '.json'), 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{name:22s} {len(rows):6d} rows')


# ----------------------------------------------------------------------------------------------- pages
next_id = [800100]


def new_id():
    next_id[0] += R.randint(1, 9)
    return next_id[0]


articles = []   # web articles (have a /article/ page)


def add_article(title, lang, topic=None, stage=None, path=None):
    title = fresh(title)
    aid = new_id()
    slug = slugify(title)[:90].strip('-')
    p = path or (f'/{lang}/article/{slug}-{aid}' if lang else f'/article/{slug}-{aid}')
    age_days = int(R.triangular(3, 1700, 300))
    created = END - dt.timedelta(days=age_days)
    updated = created + dt.timedelta(days=R.randint(0, max(0, age_days - 1))) if R.random() < 0.6 else created
    a = dict(id=aid, title=title, lang=lang, path=p, topic=topic, stage=stage, created=created, updated=updated,
             meta=R.random() < (0.9 if lang == '' else 0.7), key_type='2' if R.random() < 0.85 else '1',
             words=int(R.triangular(450, 2600, 1100)))
    articles.append(a)
    return a


topic_articles = {}
for t, stage in TOPICS:
    n = R.choices([1, 2, 3, 4], [50, 30, 14, 6])[0]
    used = R.sample(PATTERNS[stage], min(n, len(PATTERNS[stage])))
    for pat in used:
        a = add_article(pat.format(t=t, n=R.choice([5, 7, 8, 10, 12, 15])), '', t, stage)
        topic_articles.setdefault(t, []).append(a)
# near-duplicate copies (same title saved twice) for the duplicates table
for a in R.sample([a for a in articles if a['lang'] == ''], 12):
    b = add_article(a['title'] if R.random() < 0.5 else a['title'].replace(':', ' -'), '', a['topic'], a['stage'])
    topic_articles[a['topic']].append(b)
    b['dup_of'] = a['id']
for title in HINDI_TITLES:
    add_article(title, 'hi')
for end in HINDI_SHARED_ENDINGS:                       # a group of 5 pages cut to the same 78 characters
    add_article(f'{HINDI_SHARED_START} - {end}', 'hi')
for end in ['भाग 1', 'भाग 2', 'भाग 3', 'भाग 4', 'भाग 5', 'भाग 6', 'भाग 7', 'भाग 8', 'भाग 9', 'भाग 10', 'भाग 11', 'भाग 12',
            'भाग 13', 'भाग 14', 'भाग 15', 'भाग 16', 'भाग 17', 'भाग 18', 'भाग 19', 'भाग 20', 'भाग 21', 'भाग 22']:
    add_article(f'शिशु की देखभाल के लिए जरूरी बातें हर नए माता-पिता को पता होनी चाहिए {end}', 'hi')   # a big group (stays one row)
for lang, titles in OTHER_LANG_TITLES.items():
    for t in titles:
        add_article(t, lang)
# a long tail of small English pages, so totals look like a real site
for i in range(260):
    t, stage = R.choice(TOPICS)
    a = add_article(R.choice(PATTERNS[stage]).format(t=t, n=R.choice([3, 4, 6, 9, 11])), '', t, stage)
    topic_articles.setdefault(t, []).append(a)

app_only = [dict(id=new_id(), title=R.choice(PATTERNS[s]).format(t=t, n=R.choice([5, 7, 10])) + ' (app story)', lang='',
                 created=END - dt.timedelta(days=int(R.triangular(2, 700, 120)))) for t, s in R.choices(TOPICS, k=320)]
for a in app_only:
    a['updated'] = a['created'] + dt.timedelta(days=R.randint(0, max(0, (END - a['created']).days)))

qa_list = []
for i in range(240):
    q = R.choice(QA_QUESTIONS)
    k = re.search(r'\{(\w)\}', q).group(1)
    text = fresh(q.replace('{' + k + '}', R.choice(QA_FILL[k])))
    cid = 700000 + i * 3 + R.randint(0, 2)
    created = END - dt.timedelta(days=int(R.triangular(1, 500, 90)))
    qa_list.append(dict(id=cid, title=text, path=f'/questions/{slugify(text)[:70]}-{cid}', created=created,
                          updated=created + dt.timedelta(days=R.randint(0, max(0, (END - created).days))),
                          keyword=fresh(slugify(text).replace('-', ' ')[:40]), curated=R.random() < 0.93))

# ----------------------------------------------------------------------------------------------- search performance
def perf(a, demand):
    """Give a page 28 days of daily clicks / impressions / position, with its own trend."""
    pos = max(1.2, R.lognormvariate(math.log(9), 0.75))
    trend = R.choices([1.0, 0.6, 1.5, 0.45], [70, 14, 12, 4])[0]       # steady, losing, gaining, collapsing
    ctr_q = R.lognormvariate(0, 0.45) * (0.5 if R.random() < 0.15 else 1.0)  # some titles under-perform their rank
    days = []
    for i, d in enumerate(D28):
        week_factor = 1 + (trend - 1) * max(0, (i - 13) / 14)
        impr = max(0, int(demand / 28 * week_factor * (0.88 if d.weekday() >= 5 else 1.04) * R.uniform(0.8, 1.2)))
        p = max(1.0, pos * R.uniform(0.92, 1.08) / (week_factor ** 0.15))
        clicks = int(round(impr * min(0.6, ctr_at(p) * ctr_q)))
        days.append([iso(d), clicks, impr, round(p, 1)])
    a.update(pos=pos, daily=days)


def sums(days, lo, hi):
    sel = [x for x in days if lo <= x[0] <= hi]
    c, i = sum(x[1] for x in sel), sum(x[2] for x in sel)
    pos = round(sum(x[3] * x[2] for x in sel) / i, 1) if i else None
    return c, i, pos


for a in articles:
    base = R.lognormvariate(math.log(900), 1.5) if R.random() > 0.2 else 0
    if a['lang'] == 'hi': base *= 1.6
    a['demand'] = base
    if base > 30:
        perf(a, base)
    else:
        a.update(pos=None, daily=[])
for c in qa_list:
    base = R.lognormvariate(math.log(180), 1.3) if R.random() > 0.55 else 0
    c['demand'] = base
    if base > 20:
        perf(c, base)
    else:
        c.update(pos=None, daily=[])

d28_lo, d28_hi = iso(D28[0]), iso(END)
w0_lo, wm1_lo, wm1_hi = iso(W0), iso(W0 - dt.timedelta(days=7)), iso(W0 - dt.timedelta(days=1))
for x in articles + qa_list:
    x['c28'], x['i28'], x['p28'] = sums(x['daily'], d28_lo, d28_hi)
    x['cw0'], x['iw0'], x['pw0'] = sums(x['daily'], w0_lo, d28_hi)
    x['cw1'], x['iw1'], x['pw1'] = sums(x['daily'], wm1_lo, wm1_hi)

# search phrases per page
queries = {}  # query -> list of (page, share)
for a in articles:
    if not a['daily']:
        continue
    if a['lang'] == 'hi':
        qs = [fresh(q) for q in R.sample(HINDI_QUERIES, 2)]
    elif a['lang']:
        qs = []
    else:
        qs = [fresh(p.format(t=a['topic'].lower())) for p in R.sample(QUERY_PATTERNS[a['stage']], R.randint(2, 4))]
    a['queries'] = qs
    for q in qs:
        queries.setdefault(q, []).append(a)
for c in qa_list:
    c['queries'] = [c['keyword']] if c['daily'] else []
    for q in c['queries']:
        queries.setdefault(q, []).append(c)

# ----------------------------------------------------------------------------------------------- shared helpers
def lang_of(path):
    seg = path.strip('/').split('/')[0]
    return LANG_NAME.get(seg if seg in LANG_NAME and seg else '', 'English')


def url_of(path):
    return SITE + enc(path)


# cut-off groups: pages whose encoded path is longer than 78 characters and shares its start with others
groups = {}
for a in articles:
    if len(enc(a['path'])) > CUT:
        groups.setdefault(key(a['path']), []).append(a)

# ----------------------------------------------------------------------------------------------- articles_pages / article_daily
articles_pages, article_daily = [], []
for k, members in groups.items():
    for a in members:
        a['url_status'] = 'Cut off' if len(members) > 20 else ('Matched by article ID' if len(members) > 1 else 'Matched')
shown = sorted([a for a in articles if a['daily']], key=lambda a: -a['i28'])[:650]
big_groups = {k: m for k, m in groups.items() if len(m) > 20}
for a in shown:
    k = key(a['path'])
    if k in big_groups:
        continue
    split = a.get('url_status') == 'Matched by article ID'
    page = enc(a['path']) if split else k
    top_q = a['queries'][0] if a['queries'] else None
    articles_pages.append(dict(
        page=page, url=url_of(a['path']), gsc_link=None, title=a['title'], language=lang_of(a['path']),
        url_status=a.get('url_status', 'Full URL'), clicks_28d=a['c28'], impr_28d=a['i28'],
        ctr_28d=round(100 * a['c28'] / a['i28'], 2) if a['i28'] else 0, pos_28d=a['p28'],
        clicks_last_week=a['cw0'], impr_last_week=a['iw0'], pos_last_week=a['pw0'],
        clicks_week_before=a['cw1'], impr_week_before=a['iw1'], pos_week_before=a['pw1'],
        top_query=top_q, top_query_impr_28d=int(a['i28'] * R.uniform(0.25, 0.6)) if top_q else None,
        top_query_pos=round(a['p28'] * R.uniform(0.8, 1.2), 1) if top_q and a['p28'] else None,
        created_at=iso(a['created']), updated_at=iso(a['updated'])))
    for d, c, i, p in a['daily']:
        article_daily.append(dict(page=page, date=d, clicks=c, impressions=i, position=p))
for k, members in big_groups.items():   # one combined row with every member's clicks added up
    alldays = {}
    for a in members:
        for d, c, i, p in a['daily']:
            s = alldays.setdefault(d, [0, 0, 0.0])
            s[0] += c; s[1] += i; s[2] += p * i
    c28, i28 = sum(v[0] for v in alldays.values()), sum(v[1] for v in alldays.values())
    if not i28:
        continue
    lo = [v for d, v in alldays.items() if d >= w0_lo]; hi = [v for d, v in alldays.items() if wm1_lo <= d <= wm1_hi]
    articles_pages.append(dict(
        page=k, url=None, gsc_link=GSC_LINK + k, title=f'{len(members)} articles start with: {members[0]["title"][:40]} …',
        language='Hindi', url_status='Cut off', clicks_28d=c28, impr_28d=i28, ctr_28d=round(100 * c28 / i28, 2),
        pos_28d=round(sum(v[2] for v in alldays.values()) / i28, 1), clicks_last_week=sum(v[0] for v in lo),
        impr_last_week=sum(v[1] for v in lo), pos_last_week=None, clicks_week_before=sum(v[0] for v in hi),
        impr_week_before=sum(v[1] for v in hi), pos_week_before=None, top_query=None, top_query_impr_28d=None,
        top_query_pos=None, created_at=None, updated_at=None))
    for d, v in sorted(alldays.items()):
        article_daily.append(dict(page=k, date=d, clicks=v[0], impressions=v[1], position=round(v[2] / v[1], 1) if v[1] else None))

# ----------------------------------------------------------------------------------------------- qa_pages
qa_pages = []
for c in qa_list:
    if not c['daily'] and R.random() < 0.7:
        continue
    top_q = c['queries'][0] if c['queries'] else None
    qa_pages.append(dict(
        page=c['path'], url=url_of(c['path']), gsc_link=None, title=c['title'], language='English',
        clicks_28d=c['c28'], impr_28d=c['i28'], ctr_28d=round(100 * c['c28'] / c['i28'], 2) if c['i28'] else 0, pos_28d=c['p28'],
        clicks_last_week=c['cw0'], impr_last_week=c['iw0'], pos_last_week=c['pw0'],
        clicks_week_before=c['cw1'], impr_week_before=c['iw1'], pos_week_before=c['pw1'],
        top_query=top_q, top_query_impr_28d=int(c['i28'] * 0.5) if top_q else None, top_query_pos=c['p28'] if top_q else None,
        created_at=iso(c['created']), curated=c['curated'], target_keyword=c['keyword']))

# ----------------------------------------------------------------------------------------------- query_pages / site_query_pages
query_pages, site_query_pages = [], []
for q, pages in queries.items():
    weights = [R.uniform(0.3, 1) for _ in pages]
    for x, w in zip(pages, weights):
        impr = int(x['i28'] * w / max(1, len(x['queries'])))
        if impr < 5:
            continue
        pos = round(max(1, (x['p28'] or 30) * R.uniform(0.85, 1.25)), 1)
        query_pages.append(dict(query=q, page=key(x['path']), url=url_of(x['path']),
                                content_type='Community Q&A' if x in qa_list else 'Article',
                                clicks_28d=int(impr * ctr_at(pos)), impr_28d=impr, position=pos))
# a few searches where two of our pages compete
for t, arts in topic_articles.items():
    arts = [a for a in arts if a['daily']]
    if len(arts) >= 2 and R.random() < 0.5:
        q = fresh(f'{t.lower()} guide')
        for a in arts[:3]:
            impr = int(R.uniform(250, 1400))
            pos = round(R.uniform(4, 18), 1)
            query_pages.append(dict(query=q, page=key(a['path']), url=url_of(a['path']), content_type='Article',
                                    clicks_28d=int(impr * ctr_at(pos)), impr_28d=impr, position=pos))
qp_by_q = {}
for r in query_pages:
    qp_by_q.setdefault(r['query'], []).append(r)
for q, rows in qp_by_q.items():
    for r in sorted(rows, key=lambda r: -r['impr_28d'])[:2]:
        a = next((x for x in articles + qa_list if key(x['path']) == r['page']), None)
        site_query_pages.append(dict(query=q, page=r['page'], url=r['url'], gsc_link=None, title=a['title'] if a else '',
                                     type='Q&A' if r['content_type'] == 'Community Q&A' else 'Article',
                                     clicks_28d=r['clicks_28d'], impr_28d=r['impr_28d'], position=r['position']))
other_pages = ([(f'{n} name meaning', f'/baby-names/{n.lower()}', f'{n}: Name Meaning and Origin', 'Baby name') for n in BABY_NAMES]
               + [(p.lower(), f'/product/{slugify(p)}', p, 'Product') for p in PRODUCTS]
               + [(f'{c.lower()} products', f'/category/{slugify(c)}', c, 'Category') for c in CATEGORIES]
               + [(t.lower(), f'/tools/{slugify(t)}', t, 'Tool') for t in TOOLS]
               + [('bloomnest', '/', 'BloomNest: Pregnancy and Parenting', 'Home')])
for q, p, title, typ in other_pages:
    q, title = fresh(q), fresh(title)
    impr = int(R.lognormvariate(math.log(1500), 1)); pos = round(R.uniform(1.5, 14), 1)
    site_query_pages.append(dict(query=q, page=p, url=url_of(p), gsc_link=None, title=title, type=typ,
                                 clicks_28d=int(impr * ctr_at(pos)), impr_28d=impr, position=pos))

# ----------------------------------------------------------------------------------------------- keyword tracker & movers
tracked = sorted({r['query'] for r in site_query_pages}, key=lambda q: -sum(r['impr_28d'] for r in site_query_pages if r['query'] == q))[:25]
keyword_tracker = []
for q in tracked:
    base = sum(r['impr_28d'] for r in site_query_pages if r['query'] == q) / 4
    pos = min(r['position'] for r in site_query_pages if r['query'] == q)
    drift = R.uniform(-0.25, 0.25)
    for w in range(7, -1, -1):
        wk = W0 - dt.timedelta(days=7 * w)
        p = round(max(1, pos * (1 + drift * (w - 3.5) / 4) * R.uniform(0.93, 1.07)), 1)
        impr = int(base * R.uniform(0.8, 1.2))
        keyword_tracker.append(dict(query=q, week=iso(wk), clicks=int(impr * ctr_at(p)), impressions=impr, position=p))
keyword_movers = []
for q in R.sample(sorted({r['query'] for r in site_query_pages}), 40) :
    q = fresh(q)
    before = int(R.uniform(150, 2500)); last = int(before * R.uniform(1.3, 3.2))
    if last < 300:
        last = 300 + R.randint(0, 200)
    pl = round(R.uniform(2, 35), 1)
    keyword_movers.append(dict(query=q, clicks_last_week=int(last * ctr_at(pl)), impr_last_week=last, impr_week_before=before,
                               impr_change=last - before, pos_last_week=pl, pos_week_before=round(pl * R.uniform(0.9, 1.3), 1)))
keyword_movers.sort(key=lambda r: -r['impr_change'])
for q in keyword_movers:   # make sure the rising searches can be found in the whole-site pairs too
    if not any(r['query'] == q['query'] for r in site_query_pages) and R.random() < 0.7:
        a = R.choice(shown)
        site_query_pages.append(dict(query=q['query'], page=key(a['path']), url=url_of(a['path']), gsc_link=None, title=a['title'],
                                     type='Article', clicks_28d=q['clicks_last_week'] * 3, impr_28d=q['impr_last_week'] * 3,
                                     position=q['pos_last_week']))

# ----------------------------------------------------------------------------------------------- whole-site daily trend
daily_trend = []
for seg, scale in (('Whole site', 1.0), ('Articles', 0.78), ('Community Q&A', 0.035)):
    for i in range(480, -1, -1):
        d = END - dt.timedelta(days=i)
        season = 1 + 0.08 * math.sin(2 * math.pi * d.timetuple().tm_yday / 365)
        growth = 1 + 0.35 * (480 - i) / 480
        impr = int(95000 * scale * season * growth * (0.87 if d.weekday() >= 5 else 1.03) * R.uniform(0.94, 1.06))
        pos = round(R.uniform(13.5, 15.5) - 1.5 * (480 - i) / 480, 1)
        clicks = int(impr * R.uniform(0.031, 0.037))
        daily_trend.append(dict(date=iso(d), segment=seg, clicks=clicks, impressions=impr,
                                ctr=round(100 * clicks / impr, 2), position=pos))

# ----------------------------------------------------------------------------------------------- publishing (created / updated)
def weekly_counts(items, kind, weeks=52):
    rows = []
    for w in range(weeks - 1, -1, -1):
        wk = W0 - dt.timedelta(days=7 * w)
        we = wk + dt.timedelta(days=6)
        cr = sum(1 for x in items if wk <= x['created'] <= we)
        up = sum(1 for x in items if wk <= x['updated'] <= we and x['updated'] != x['created'])
        rows.append(dict(week=iso(wk), content_type=kind, created=cr, updated=up))
    return rows


def daily_counts(items, kind, days=98):
    rows = []
    for i in range(days - 1, -1, -1):
        d = END - dt.timedelta(days=i)
        rows.append(dict(day=iso(d), content_type=kind, created=sum(1 for x in items if x['created'] == d),
                         updated=sum(1 for x in items if x['updated'] == d and x['updated'] != x['created'])))
    return rows


# make the most recent weeks busy, like a team that publishes and refreshes every week
for x in R.sample(articles, 110):
    x['updated'] = END - dt.timedelta(days=R.randint(0, 55))
for x in R.sample(articles, 18):
    x['created'] = x['updated'] = END - dt.timedelta(days=R.randint(0, 27))
for x in R.sample(qa_list, 14):
    x['created'] = x['updated'] = END - dt.timedelta(days=R.randint(0, 27))
for x in R.sample(qa_list, 10):
    x['updated'] = END - dt.timedelta(days=R.randint(0, 20))

content_weekly = weekly_counts(articles, 'Article') + weekly_counts(qa_list, 'Community Q&A')
content_daily = daily_counts(articles, 'Article') + daily_counts(qa_list, 'Community Q&A')
content_lastweek = []
for x, kind in [(a, 'Article') for a in articles] + [(c, 'Community Q&A') for c in qa_list]:
    if x['created'] >= END - dt.timedelta(days=83):
        content_lastweek.append(dict(content_type=kind, action='Created', path=x['path'], title=x['title'], at=rnd_time(x['created'])))
    if x['updated'] != x['created'] and x['updated'] >= END - dt.timedelta(days=83):
        content_lastweek.append(dict(content_type=kind, action='Updated', path=x['path'], title=x['title'], at=rnd_time(x['updated'])))

# ----------------------------------------------------------------------------------------------- last week's pages: searches and target check
lastweek_searches = []
for r in content_lastweek:
    if r['at'][:10] < w0_lo:
        continue
    x = next(x for x in articles + qa_list if x['path'] == r['path'])
    row = dict(path=x['path'], clicks=x['cw0'], impressions=x['iw0'], position=x['pw0'], n_queries=len(x.get('queries', [])))
    for i, q in enumerate(x.get('queries', [])[:3], 1):
        qi = int(x['iw0'] * R.uniform(0.15, 0.5)); qp = round((x['pw0'] or 20) * R.uniform(0.8, 1.2), 1)
        row.update({f'q{i}': q, f'q{i}_clicks': int(qi * ctr_at(qp)), f'q{i}_impr': qi, f'q{i}_pos': qp})
    is_cur = x in qa_list
    row.update(target=fresh(x['keyword'] if is_cur else x['title'].split(':')[0]), target_from='keyword' if is_cur else R.choice(['meta title', 'H1']),
               h1=x['title'], meta_title=x['title'] if x.get('meta', True) else None)
    if x['lang'] if not is_cur else False:
        row['target_check'] = 'Not checked'
    elif not x.get('queries'):
        row['target_check'] = 'Not ranking for it'
    else:
        row['target_check'] = R.choices(['On target', 'Related', 'Off target'], [55, 30, 15])[0]
        row.update(tq=x['queries'][0], tq_clicks=row.get('q1_clicks', 0), tq_impr=row.get('q1_impr', 0),
                   tq_pos=row.get('q1_pos'), n_target_searches=R.randint(1, 6))
    lastweek_searches.append(row)
seen_paths = set()
lastweek_searches = [r for r in lastweek_searches if not (r['path'] in seen_paths or seen_paths.add(r['path']))]

# ----------------------------------------------------------------------------------------------- indexing (URL inspection)
indexing = []
for x, typ in ([(c, 'Community Q&A') for c in qa_list]
               + [(a, 'Article (new)') for a in articles if W0 <= a['created'] <= END]
               + [(a, 'Article (updated)') for a in articles if W0 <= a['updated'] <= END and a['updated'] != a['created']]):
    if typ == 'Community Q&A':
        verdict = R.choices(['PASS', 'NEUTRAL', 'FAIL'], [70, 25, 5])[0]
    else:
        verdict = R.choices(['PASS', 'NEUTRAL', 'FAIL', 'ERROR'], [85, 11, 3, 1])[0]
    coverage = {'PASS': 'Submitted and indexed', 'FAIL': R.choice(['Not found (404)', 'Page with redirect']),
                'ERROR': 'URL is unknown to Google'}.get(verdict) or R.choice(['Discovered - currently not indexed', 'Crawled - currently not indexed'])
    indexing.append(dict(page=x['path'], url=url_of(x['path']), title=x['title'], content_type=typ, verdict=verdict, coverage=coverage,
                         last_crawl=iso(END - dt.timedelta(days=R.randint(0, 40))) if verdict != 'ERROR' else None, indexed=verdict == 'PASS'))

# ----------------------------------------------------------------------------------------------- coverage, every article page, no-meta list
article_coverage, article_pages_all, nometa_web = [], [], []
for a in articles:
    status = 'In Google' if a['i28'] else ('Unclear' if a['path'] and len(enc(a['path'])) > CUT else 'No impressions')
    article_coverage.append(dict(page=enc(a['path']), title=a['title'], language=lang_of(a['path']), created_at=iso(a['created']),
                                 updated_at=iso(a['updated']), new_last_week=W0 <= a['created'] <= END,
                                 impr_28d=a['i28'] if status != 'Unclear' else None, clicks_28d=a['c28'] if status != 'Unclear' else None,
                                 search_status=status))
    if a['i28']:
        article_pages_all.append(dict(page=key(a['path']), clicks_28d=a['c28'], impr_28d=a['i28'], pos_28d=a['p28']))
    if not a['meta']:
        nometa_web.append(dict(id=a['id'], title=a['title'], path=a['path'], created=f"{iso(a['created'])} 10:00:00",
                               updated=f"{iso(a['updated'])} 10:00:00", article_key=a['key_type'],
                               has_description=R.choice(['Yes', 'No', 'No'])))

# ----------------------------------------------------------------------------------------------- duplicates
duplicate_articles = []
for b in [a for a in articles if a.get('dup_of')]:
    a = next(x for x in articles if x['id'] == b['dup_of'])
    norm = re.sub(r'[^a-z0-9 ]', '', a['title'].lower())
    duplicate_articles.append(dict(grp=f'article|{norm}', a_id=a['id'], a_path=a['path'], a_title=a['title'], a_created=iso(a['created']),
                                   a_updated=iso(a['updated']), a_words=a['words'], b_id=b['id'], b_path=b['path'], b_title=b['title'],
                                   b_created=iso(b['created']), b_updated=iso(b['updated']), b_words=b['words'],
                                   overlap=round(R.choice([R.uniform(0.62, 0.95), R.uniform(0.3, 0.59), R.uniform(0.05, 0.28)]), 2)))

# ----------------------------------------------------------------------------------------------- redirect check
redirects = []
checked = R.sample([a for a in articles if a['daily']], 300) + R.sample(qa_list, 120)
for x in checked:
    roll = R.random()
    url = url_of(x['path'])
    if roll < 0.92:
        r = dict(status=200, final_url=url, final_status=200, hops=0, chain=[200], issues=[])
    elif roll < 0.95:
        r = dict(status=301, final_url=SITE + '/article/removed-page', final_status=404, hops=1, chain=[301, 404], issues=['Ends in 404'])
    elif roll < 0.97:
        r = dict(status=301, final_url=url, final_status=200, hops=3, chain=[301, 301, 301, 200], issues=['Redirect chain (3 hops)'])
    elif roll < 0.985:
        r = dict(status=302, final_url=url, final_status=200, hops=1, chain=[302, 200], issues=['Temporary redirect (302)'])
    elif roll < 0.993:
        r = dict(status=301, final_url=SITE + '/', final_status=200, hops=1, chain=[301, 200], issues=['Redirects to the homepage'])
    else:
        r = dict(status=301, final_url=url, final_status='loop', hops=10, chain=[301, 301, 'loop'], issues=['Redirect loop'])
    redirects.append(dict(path=x['path'], reason='Q&A' if x in qa_list else 'Top article', url=url, **r))
# one finished merge: the weaker copy now 301s to the winner
if duplicate_articles:
    d0 = duplicate_articles[0]
    redirects.append(dict(path=d0['b_path'], reason='Competing page', url=url_of(d0['b_path']), status=301,
                          final_url=url_of(d0['a_path']), final_status=200, hops=1, chain=[301, 200], issues=[]))

# ----------------------------------------------------------------------------------------------- edit history (changelog)
content_changelog, older_edits = [], []
web_by_id = {a['id']: a for a in articles}


def edit_row(x, kind, day, when, changed, real='true'):
    path = x.get('path', '')
    wb = x.get('words', 900)
    wa = wb if 'Body' not in changed else int(wb * R.choice([R.uniform(1.02, 1.35), R.uniform(0.92, 1.0), R.uniform(0.55, 0.78)]))
    row = dict(kind=kind, id=x['id'], path=path, name=x['title'], date=iso(day), edited_at=when, key=f"{kind}|{x['id']}|{iso(day)}",
               page_key=enc(path) if path else '', language=lang_of(path) if path else 'English',
               language_ids=LANG_ID.get(x.get('lang', ''), '1'), seo='true' if path else 'false', real=real,
               web='true' if path else 'false', changed=changed, words_before=wb, words_after=wa,
               sections_added=R.sample(SECTIONS, R.randint(0, 2)) if 'Body' in changed else [],
               sections_removed=R.sample(SECTIONS, R.randint(0, 1)) if 'Body' in changed else [])
    if 'Meta title' in changed:
        row.update(meta_title_before=x['title'][:50] if R.random() < 0.6 else '', meta_title_after=x['title'][:58] + ' | BloomNest')
    if 'Meta description' in changed:
        row.update(meta_desc_before='Read about ' + x['title'].lower()[:60], meta_desc_after='Expert-reviewed guide: ' + x['title'].lower()[:80])
    if 'Title' in changed:
        row.update(title_before=x['title'].replace(':', ' -'), title_after=x['title'])
    return row


day = HIST_START
while day <= END:
    for _ in range(R.randint(20, 45)):
        if R.random() < 0.85:
            x, kind = R.choice(articles), 'Article'
        else:
            x, kind = R.choice(qa_list), 'Community Q&A'
        changed = R.choice([['Body'], ['Meta title'], ['Meta title', 'Meta description'], ['Formatting'], ['Body', 'H1'],
                            ['Title', 'Body'], ['Footnote'], ['Body', 'Formatting']] + ([['Target keyword']] if kind != 'Article' else []))
        content_changelog.append(edit_row(x, kind, day, rnd_time(day), changed))
    if R.random() < 0.18:   # an app-only story edit
        x = R.choice(app_only)
        content_changelog.append(edit_row(dict(x, path=''), 'Article', day, rnd_time(day), ['Body']))
    day += dt.timedelta(days=1)
bulk_day = END - dt.timedelta(days=R.randint(9, 20))
bulk_when = f'{iso(bulk_day)} 08:48:12'
for a in R.sample([a for a in articles if not a['meta']] or articles, min(60, len([a for a in articles if not a['meta']]) or 60)):
    content_changelog.append(edit_row(a, 'Article', bulk_day, bulk_when, ['Meta title']))
content_changelog.sort(key=lambda r: r['edited_at'])
for x, kind in [(a, 'Article') for a in R.sample(articles, 420)] + [(c, 'Community Q&A') for c in R.sample(qa_list, 60)]:
    last = HIST_START - dt.timedelta(days=R.randint(1, 360))
    older_edits.append(dict(kind=kind, id=x['id'], path=x['path'], name=x['title'], created=iso(min(x['created'], last)), last_edited=iso(last)))

# edited pages need daily numbers for "did our updates work?"
known = {r['page'] for r in article_daily}
for r in content_changelog:
    pk = r['page_key'][:CUT] if len(r['page_key']) > CUT else r['page_key']
    if r['page_key'] and pk not in known and r['kind'] == 'Article' and r['id'] in web_by_id and web_by_id[r['id']]['daily']:
        for d, c, i, p in web_by_id[r['id']]['daily']:
            article_daily.append(dict(page=pk, date=d, clicks=c, impressions=i, position=p))
        known.add(pk)
# some edits worked, some didn't: bend the clicks after the edit date
for r in content_changelog:
    if r['kind'] != 'Article' or r['page_key'] == '':
        continue
    pk = r['page_key'][:CUT] if len(r['page_key']) > CUT else r['page_key']
    effect = R.choice([1.35, 1.2, 1.0, 0.85, 0.7]) if R.random() < 0.35 else None
    if not effect:
        continue
    for x in article_daily:
        if x['page'] == pk and x['date'] > r['date']:
            x['clicks'] = int(x['clicks'] * effect)

# ----------------------------------------------------------------------------------------------- app view
real_web = [a for a in articles if a['key_type'] == '2']
app_articles = ([dict(id=a['id'], kind='Web article', title=a['title'], url=url_of(a['path']), language=lang_of(a['path']),
                      created=iso(a['created']), updated=iso(a['updated']), has_meta=a['meta']) for a in real_web]
                + [dict(id=a['id'], kind='App-only article', title=a['title'], url=None, language='English', created=iso(a['created']),
                        updated=iso(a['updated']), has_meta=None) for a in app_only])
app_pop = {r['id']: R.lognormvariate(math.log(60), 1.3) for r in app_articles}
app_weekly = []
for w in range(12, -1, -1):
    wk = W0 - dt.timedelta(days=7 * w)
    for r in app_articles:
        v = app_pop[r['id']] * R.uniform(0.7, 1.3)
        if v < 6:
            continue
        impr = int(v * R.uniform(18, 40)); clicks = int(impr * R.uniform(0.005, 0.02)); views = int(v)
        app_weekly.append(dict(week=iso(wk), id=r['id'], served=int(impr * 1.6), impressions=impr, clicks=clicks, views=views))
app_daily = []
for i in range(90, -1, -1):
    d = END - dt.timedelta(days=i)
    web = dict(served=0, impressions=0, clicks=0, views=0); only = dict(web)
    for seg, store, share in (('Web articles in app', web, 0.52), ('App-only articles', only, 0.48)):
        base = 11000 * share * (1.05 if d.weekday() >= 5 else 1) * R.uniform(0.92, 1.08)
        store.update(views=int(base), impressions=int(base * 26), clicks=int(base * 26 * 0.0093), served=int(base * 41))
        app_daily.append(dict(date=iso(d), segment=seg, **store))
    app_daily.append(dict(date=iso(d), segment='All app articles', **{k: web[k] + only[k] for k in web}))
recent_ids = [r['id'] for r in app_articles if r['updated'] >= iso(END - dt.timedelta(days=21))]
recent_ids += [r['id'] for r in content_changelog if r['kind'] == 'Article' and r['real'] == 'true']
recent_ids = list(dict.fromkeys(recent_ids))[:400]
app_recent_daily = []
for aid in recent_ids:
    base = app_pop.get(aid, 20) / 7
    drop_day = next((r['date'] for r in content_changelog if r['id'] == aid), None)
    dropped = R.random() < 0.25
    for i in range(39, -1, -1):
        d = iso(END - dt.timedelta(days=i))
        f = 0.15 if dropped and drop_day and d > drop_day else 1
        impr = int(base * 30 * f * R.uniform(0.7, 1.3))
        app_recent_daily.append(dict(date=d, id=aid, impressions=impr, clicks=int(impr * 0.01), views=int(base * f * R.uniform(0.7, 1.3))))
for x in R.sample(app_only, 12):
    x['created'] = x['updated'] = END - dt.timedelta(days=R.randint(0, 27))
app_content_weekly = weekly_counts(real_web, 'Web article') + weekly_counts(app_only, 'App-only article')
app_content_daily = daily_counts(real_web, 'Web article') + daily_counts(app_only, 'App-only article')
app_content_lastweek = []
for x, kind in [(a, 'Web article') for a in real_web] + [(a, 'App-only article') for a in app_only]:
    for action, d in (('Created', x['created']), ('Updated', x['updated'] if x['updated'] != x['created'] else None)):
        if d and d >= END - dt.timedelta(days=83):
            app_content_lastweek.append(dict(id=x['id'], content_type=kind, action=action, path=x.get('path'), title=x['title'], at=rnd_time(d)))

# ----------------------------------------------------------------------------------------------- write
for name, rows in [('daily_trend', daily_trend), ('articles_pages', articles_pages), ('qa_pages', qa_pages),
                   ('article_daily', article_daily), ('query_pages', query_pages), ('site_query_pages', site_query_pages),
                   ('indexing', indexing), ('article_coverage', article_coverage), ('article_pages_all', article_pages_all),
                   ('lastweek_searches', lastweek_searches), ('redirects', redirects), ('content_changelog', content_changelog),
                   ('app_daily', app_daily), ('app_weekly', app_weekly), ('app_articles', app_articles),
                   ('app_recent_daily', app_recent_daily), ('content_weekly', content_weekly), ('content_daily', content_daily),
                   ('content_lastweek', content_lastweek), ('app_content_weekly', app_content_weekly),
                   ('app_content_daily', app_content_daily), ('app_content_lastweek', app_content_lastweek),
                   ('nometa_web', nometa_web), ('keyword_movers', keyword_movers), ('keyword_tracker', keyword_tracker),
                   ('older_edits', older_edits), ('duplicate_articles', duplicate_articles)]:
    save(name, rows)
with open(os.path.join(args.out, '_meta.json'), 'w', encoding='utf-8') as f:
    json.dump(dict(site='BloomNest (fictional)', generated=iso(TODAY), data_through=iso(END), history_since=iso(HIST_START),
                   seed=args.seed, note='All data is synthetic, generated by mock-data/generate.py.'), f, indent=1)
print('data through', END, '| history since', HIST_START)
