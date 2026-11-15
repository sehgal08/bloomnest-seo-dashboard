"""Check how a list of bloomnest.example URLs answers: status code, where redirects go, how many hops.

Usage: python -I redirect_check.py <urls.json> <out.json>
urls.json: [{"path": "/article/...", "reason": "Top article" | "Q&A" | "URL change (old)" | ...}, ...]
Each path is fetched without following redirects; redirects are followed by hand up to 6 hops.
Polite: 4 requests at a time, a short pause between requests, 20 s timeout.
"""
import json, sys, time, urllib.request, urllib.error
from urllib.parse import quote, urljoin
from concurrent.futures import ThreadPoolExecutor

SITE = 'https://bloomnest.example'
src, dst = sys.argv[1], sys.argv[2]
items = json.load(open(src, encoding='utf-8'))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


opener = urllib.request.build_opener(NoRedirect)
UA = {'User-Agent': 'Mozilla/5.0 (compatible; BloomNestSEODashboard/1.0; redirect check)'}


def fetch(url):
    try:
        r = opener.open(urllib.request.Request(url, headers=UA, method='GET'), timeout=20)
        r.read(512)
        return r.status, None
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get('Location')
    except Exception as e:  # network error, timeout
        return None, str(e)[:120]


def check(item):
    path = item['path']
    url = SITE + quote(path, safe="/-_.~%")
    hops, seen = [], set()
    for _ in range(6):
        status, loc = fetch(url)
        hops.append({'url': url, 'status': status})
        if status in (301, 302, 303, 307, 308) and loc:
            nxt = urljoin(url, loc)
            if nxt in seen:
                hops.append({'url': nxt, 'status': 'loop'})
                break
            seen.add(url)
            url = nxt
            time.sleep(0.2)
            continue
        if status is None:
            hops[-1]['error'] = loc
        break
    first, last = hops[0], hops[-1]
    codes = [h['status'] for h in hops[:-1]]
    issues = []
    if last['status'] == 'loop': issues.append('Redirect loop')
    elif last['status'] is None: issues.append('Could not load')
    elif isinstance(last['status'], int) and last['status'] >= 400: issues.append('Ends in ' + str(last['status']))
    if len(codes) >= 2: issues.append('Redirect chain (' + str(len(codes)) + ' hops)')
    if any(c in (302, 303, 307) for c in codes): issues.append('Temporary redirect (' + '/'.join(str(c) for c in codes if c in (302, 303, 307)) + ')')
    if codes and last['url'].rstrip('/') == SITE: issues.append('Redirects to the homepage')
    time.sleep(0.25)
    return {**item, 'url': hops[0]['url'], 'status': first['status'], 'final_url': last['url'], 'final_status': last['status'],
            'hops': len(codes), 'chain': [h['status'] for h in hops], 'issues': issues}


t0 = time.time()
with ThreadPoolExecutor(max_workers=4) as ex:
    out = list(ex.map(check, items))
json.dump(out, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
from collections import Counter
print(len(out), 'checked in', round(time.time() - t0), 's;', Counter(str(r['status']) for r in out).most_common(), '; issues:', Counter(i.split(' (')[0] for r in out for i in r['issues']).most_common())
