-- Content changelog: one row per page per day it was edited (IST), from the Delta change feed (kept 7 days).
-- Before = the page before its first edit that day, after = after its last edit that day.
-- Kept: pages with a meta title after the edit (seo = true: the dashboard's Web view), plus app articles
-- (published app articles, web or app-only),
-- with or without a meta title (real = true: the App view and the "Add a meta title" list).
WITH ac AS (
  SELECT id, _change_type, _commit_version AS v, updated_at, web_url, meta_title, meta_description, title, heading, body, footnote
  FROM table_changes('cms.article', current_timestamp() - INTERVAL 167 HOURS)
  WHERE _change_type IN ('update_preimage', 'update_postimage')),
apairs AS (
  SELECT a.id, a.v, CAST(from_utc_timestamp(b.updated_at, 'Asia/Kolkata') AS DATE) AS d,
    struct(a.meta_title AS mt, a.meta_description AS md, a.title AS t, a.heading AS h, a.body AS body, a.footnote AS fn) AS pre,
    struct(b.web_url AS url, b.meta_title AS mt, b.meta_description AS md, b.title AS t, b.heading AS h, b.body AS body, b.footnote AS fn, b.updated_at AS at) AS post
  FROM ac a JOIN ac b ON a.id = b.id AND a.v = b.v AND a._change_type = 'update_preimage' AND b._change_type = 'update_postimage'),
aday AS (SELECT 'Article' AS kind, id, d, min_by(pre, v) AS pre, max_by(post, v) AS post FROM apairs GROUP BY id, d),
pc AS (
  SELECT id, _change_type, _commit_version AS v, updated_at, web_url, meta_title, meta_description, keyword, message
  FROM table_changes('cms.post', current_timestamp() - INTERVAL 167 HOURS)
  WHERE _change_type IN ('update_preimage', 'update_postimage')),
ppairs AS (
  SELECT a.id, a.v, CAST(from_utc_timestamp(b.updated_at, 'Asia/Kolkata') AS DATE) AS d,
    struct(a.meta_title AS mt, a.meta_description AS md, a.keyword AS t, CAST(NULL AS STRING) AS h, a.message AS body, CAST(NULL AS STRING) AS fn) AS pre,
    struct(b.web_url AS url, b.meta_title AS mt, b.meta_description AS md, b.keyword AS t, CAST(NULL AS STRING) AS h, b.message AS body, CAST(NULL AS STRING) AS fn, b.updated_at AS at) AS post
  FROM pc a JOIN pc b ON a.id = b.id AND a.v = b.v AND a._change_type = 'update_preimage' AND b._change_type = 'update_postimage'),
pday AS (SELECT 'Community Q&A' AS kind, id, d, min_by(pre, v) AS pre, max_by(post, v) AS post FROM ppairs GROUP BY id, d),
realset AS (
  SELECT article_id AS id, max(app_tier) AS akey, max(language_ids) AS language_ids
  FROM cms.app_content
  WHERE app_tier IN ('1', '2') AND NOT archived
  GROUP BY article_id),
allday AS (
  SELECT aday.*, (realset.akey = '2' OR (realset.akey = '1' AND aday.post.url LIKE '%/article/%')) AS is_real, realset.language_ids
  FROM aday LEFT JOIN realset ON realset.id = aday.id
  UNION ALL SELECT pday.*, false, CAST(NULL AS STRING) FROM pday),
x AS (
  SELECT kind, id, d, pre, post, coalesce(is_real, false) AS is_real, language_ids,
    size(filter(split(regexp_replace(regexp_replace(coalesce(pre.body, ''), '<style[^>]*>.*?</style>|<[^>]+>|&nbsp;', ' '), '\\s+', ' '), ' '), w -> w <> '')) AS words_before,
    size(filter(split(regexp_replace(regexp_replace(coalesce(post.body, ''), '<style[^>]*>.*?</style>|<[^>]+>|&nbsp;', ' '), '\\s+', ' '), ' '), w -> w <> '')) AS words_after,
    transform(regexp_extract_all(coalesce(pre.body, ''), '<h[23][^>]*>(.*?)</h[23]>', 1), s -> trim(regexp_replace(s, '<[^>]+>|&nbsp;', ' '))) AS heads_before,
    transform(regexp_extract_all(coalesce(post.body, ''), '<h[23][^>]*>(.*?)</h[23]>', 1), s -> trim(regexp_replace(s, '<[^>]+>|&nbsp;', ' '))) AS heads_after
  FROM allday WHERE coalesce(post.mt, '') <> '' OR coalesce(is_real, false)),
y AS (
  SELECT *,
    NOT (pre.mt <=> post.mt) AS c_mt, NOT (pre.md <=> post.md) AS c_md, NOT (pre.t <=> post.t) AS c_t, NOT (pre.h <=> post.h) AS c_h,
    NOT (pre.fn <=> post.fn) AS c_fn, NOT (pre.body <=> post.body) AS c_body,
    array_except(heads_after, heads_before) AS sections_added, array_except(heads_before, heads_after) AS sections_removed
  FROM x)
SELECT to_json(collect_list(named_struct(
  'kind', kind, 'id', id, 'path', post.url, 'name', CASE WHEN coalesce(post.mt, '') <> '' THEN post.mt ELSE post.t END, 'date', CAST(d AS STRING),
  'seo', coalesce(post.mt, '') <> '', 'real', is_real, 'language_ids', language_ids,
  'web', coalesce(post.url, '') LIKE '%/article/%' OR coalesce(post.url, '') LIKE '%/questions/%',
  'edited_at', CAST(from_utc_timestamp(post.at, 'Asia/Kolkata') AS STRING),
  'changed', filter(array(
      CASE WHEN c_mt THEN 'Meta title' END, CASE WHEN c_md THEN 'Meta description' END,
      CASE WHEN c_t THEN CASE WHEN kind = 'Article' THEN 'Title' ELSE 'Target keyword' END END, CASE WHEN c_h THEN 'H1' END,
      CASE WHEN c_body AND (words_before <> words_after OR size(sections_added) + size(sections_removed) > 0) THEN 'Body' END,
      CASE WHEN c_body AND words_before = words_after AND size(sections_added) + size(sections_removed) = 0 THEN 'Formatting' END,
      CASE WHEN c_fn THEN 'Footnote' END), s -> s IS NOT NULL),
  'meta_title_before', CASE WHEN c_mt THEN pre.mt END, 'meta_title_after', CASE WHEN c_mt THEN post.mt END,
  'meta_desc_before', CASE WHEN c_md THEN pre.md END, 'meta_desc_after', CASE WHEN c_md THEN post.md END,
  'title_before', CASE WHEN c_t THEN pre.t END, 'title_after', CASE WHEN c_t THEN post.t END,
  'h1_before', CASE WHEN c_h THEN pre.h END, 'h1_after', CASE WHEN c_h THEN post.h END,
  'words_before', words_before, 'words_after', words_after,
  'sections_added', slice(sections_added, 1, 12), 'sections_removed', slice(sections_removed, 1, 12)
))) AS j
FROM y WHERE c_mt OR c_md OR c_t OR c_h OR c_fn OR c_body
