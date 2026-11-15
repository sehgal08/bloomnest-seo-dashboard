-- URL changes of SEO articles and community Q&A pages in the last 7 days (Delta change feed), for the redirect check.
WITH c AS (
  SELECT 'Article' AS kind, id, _change_type, _commit_version AS v, web_url, meta_title, updated_at
  FROM table_changes('cms.article', current_timestamp() - INTERVAL 167 HOURS) WHERE _change_type IN ('update_preimage', 'update_postimage')
  UNION ALL
  SELECT 'Community Q&A', id, _change_type, _commit_version, web_url, meta_title, updated_at
  FROM table_changes('cms.post', current_timestamp() - INTERVAL 167 HOURS) WHERE _change_type IN ('update_preimage', 'update_postimage'))
SELECT to_json(collect_list(named_struct('kind', a.kind, 'id', a.id, 'old_path', a.web_url, 'new_path', b.web_url, 'name', b.meta_title,
  'date', CAST(CAST(from_utc_timestamp(b.updated_at, 'Asia/Kolkata') AS DATE) AS STRING)))) AS j
FROM c a JOIN c b ON a.kind = b.kind AND a.id = b.id AND a.v = b.v AND a._change_type = 'update_preimage' AND b._change_type = 'update_postimage'
WHERE NOT (a.web_url <=> b.web_url) AND a.web_url IS NOT NULL
