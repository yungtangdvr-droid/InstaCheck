-- stg_content_themes : theme definitions with a normalised tag array
--
-- content_themes.tags is a text[] of editorial tags. We lower-case each entry
-- so the overlap check against stg_post_tags.tag is deterministic regardless
-- of how the theme was seeded.
select
  ct.id                                    as theme_id,
  ct.name                                  as theme_name,
  ct.description,
  array(
    select lower(btrim(t))
    from unnest(ct.tags) t
    where t is not null and btrim(t) <> ''
  )                                        as tags
from {{ source('public', 'content_themes') }} ct
