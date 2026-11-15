"""Fail if any file meant for GitHub contains private text.

    python tools/check_private.py          # exit code 1 if anything is found

The words to look for (the original company, its systems, people's names) are kept in
_source/private_words.txt, one regular expression per line. That file is never committed (see .gitignore),
so this public script doesn't reveal them. Generic checks (local paths, email addresses) always run.
Scans every file except _source/ and .git/.
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'_source', '.git', 'node_modules', '__pycache__', '.claude'}
GENERIC = [r'C:\\\\Users', r'C:/Users', r'/home/[a-z]', r'[\w.+-]+@(?!users\.noreply\.github\.com)[a-z0-9-]+\.(com|in|co|org|net)\b']
ALLOW = [r'users\.noreply\.github\.com']

words_file = os.path.join(ROOT, '_source', 'private_words.txt')
private = []
if os.path.exists(words_file):
    private = [l.strip() for l in open(words_file, encoding='utf-8') if l.strip() and not l.startswith('#')]
else:
    print('note: _source/private_words.txt not found, running the generic checks only')
rx = re.compile('|'.join(GENERIC + private), re.I)
allow = re.compile('|'.join(ALLOW), re.I)
hits = 0
for base, dirs, files in os.walk(ROOT):
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
    for f in files:
        p = os.path.join(base, f)
        if os.path.abspath(p) == os.path.abspath(__file__):   # its own generic patterns, nothing private
            continue
        try:
            text = open(p, encoding='utf-8').read()
        except (UnicodeDecodeError, OSError):
            continue
        for n, line in enumerate(text.splitlines(), 1):
            m = rx.search(line)
            if m and not allow.search(m.group(0)):
                hits += 1
                print(f'{os.path.relpath(p, ROOT)}:{n}: {m.group(0)!r}  {line.strip()[:120]}')
print('OK: nothing found' if not hits else f'{hits} line(s) found')
sys.exit(1 if hits else 0)
