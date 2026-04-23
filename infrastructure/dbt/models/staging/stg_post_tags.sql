-- stg_post_tags : normalised (post_id, tag) pairs
--
-- Tags are lower-cased and trimmed at insertion (see addTag server action),
-- but we defensively re-normalise here so the theme-matching join against
-- content_themes.tags[] is not brittle to casing changes upstream.
select distinct
  pt.post_id,
  lower(btrim(pt.tag))        as tag
from {{ source('public', 'post_tags') }} pt
where pt.tag is not null
  and btrim(pt.tag) <> ''
