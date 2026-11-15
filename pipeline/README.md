# Pipeline

The processing scripts behind the weekly refresh and the daily changelog job, cleaned for this demo (site and table names are generic). They read API and SQL answers saved as JSON and write the dashboard's datasets.

| Script | What it does |
|---|---|
| `parse_gsc.py` | Turns Search Console API answers (any dimensions, paginated) into flat rows |
| `build.py` | Builds the page-level datasets: 28-day and week-over-week numbers, daily rows, page × query pairs, curated page lists, URLs to check |
| `cut_split.py`, `take_urls.py` | Recovers URLs Search Console cut at 78 characters: matches them by prefix and plans per-article pulls for small groups |
| `site_pairs.py`, `pages_all.py` | Whole-site search × page pairs, with a page type (article, Q&A, baby name, product, tool…) |
| `parse_inspect.py`, `coverage.py` | URL Inspection results: indexed or not, and why |
| `redirect_check.py` | Fetches URLs without following redirects: final status, hops, chains, 302s, loops, homepage redirects |
| `changelog_merge.py`, `url_changes_merge.py` | Merge each daily change-feed pull into the running edit history |
| `sql/changelog.sql` | One row per page per day edited: before/after meta title, description, title, H1, word counts, added/removed sections |
| `sql/url_changes.sql` | Pages whose URL changed, for the redirect check |
