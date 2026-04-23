-- mart_theme_performance : aggregate posts by editorial theme.
--
-- Grain: (theme_key, period_days) where
--   theme_key   = content_themes.name if any theme's `tags` array contains
--                 the post tag, else the raw tag ("unthemed fallback").
--   period_days ∈ (7, 30, 90).
--
-- A post with tags ['reel', 'travel', 'paris'] in which 'travel' and
-- 'paris' both map to theme "Voyage" appears ONCE under "Voyage" (distinct
-- theme names, not tag-row fanout), plus once under "reel" if 'reel'
-- doesn't resolve to a theme.
--
-- `low_sample_flag` / `sample_size_confidence` make low-n rows explicit so
-- the UI can grey out themes with too few posts to be trustworthy. Default
-- threshold: 3 posts in the period (see LOW_SAMPLE_THRESHOLD below).

with tag_rows as (
  -- For every (post × tag), look up all theme names that claim this tag,
  -- and if none do emit the raw tag as its own "theme". A tag matching
  -- multiple themes is intentional fan-out — operator may want to see
  -- the same post contribute to each editorial bucket it belongs to.
  select
    pt.post_id,
    pt.tag,
    coalesce(ct.theme_id,   null::uuid)           as theme_id,
    coalesce(ct.theme_name, pt.tag)               as theme_key,
    (ct.theme_id is not null)                     as is_mapped_theme
  from {{ ref('stg_post_tags') }} pt
  left join {{ ref('stg_content_themes') }} ct on pt.tag = any(ct.tags)
),
distinct_post_theme as (
  -- Collapse duplicate (post, theme) pairs that arise when several tags
  -- from the same post map to the same theme.
  select distinct post_id, theme_id, theme_key, is_mapped_theme
  from tag_rows
),
periods as (
  select 7  as period_days
  union all select 30
  union all select 90
),
posts_in_period as (
  select
    dpt.theme_id,
    dpt.theme_key,
    dpt.is_mapped_theme,
    p.period_days,
    pp.post_id,
    pp.posted_at,
    pp.total_reach,
    pp.total_saves,
    pp.total_shares,
    pp.total_likes,
    pp.total_comments,
    pp.performance_score,
    pp.baseline_score
  from distinct_post_theme dpt
  join {{ ref('mart_post_performance') }} pp on pp.post_id = dpt.post_id
  cross join periods p
  where (p.period_days =  7 and pp.in_last_7d)
     or (p.period_days = 30 and pp.in_last_30d)
     or (p.period_days = 90 and pp.in_last_90d)
),
aggregated as (
  select
    theme_key,
    theme_id,
    bool_or(is_mapped_theme)             as is_mapped_theme,
    period_days,
    count(*)                             as post_count,
    sum(total_saves)                     as total_saves,
    sum(total_reach)                     as total_reach,
    sum(total_shares)                    as total_shares,
    sum(total_likes)                     as total_likes,
    sum(total_comments)                  as total_comments,
    round(avg(total_saves))::int         as avg_saves_per_post,
    round(avg(total_reach))::int         as avg_reach_per_post,
    round(avg(performance_score))::int   as avg_score,
    max(baseline_score)::int             as baseline_score,
    max(posted_at)                       as last_posted_at
  from posts_in_period
  group by theme_key, theme_id, period_days
),
top_per_theme as (
  select distinct on (theme_key, period_days)
    theme_key,
    period_days,
    post_id            as top_post_id,
    performance_score  as top_post_score
  from posts_in_period
  order by theme_key, period_days, performance_score desc, post_id
)
select
  a.theme_key                                              as theme_name,
  a.theme_id,
  a.is_mapped_theme,
  a.period_days,
  a.post_count,
  a.total_saves,
  a.total_reach,
  a.total_shares,
  a.total_likes,
  a.total_comments,
  a.avg_saves_per_post,
  a.avg_reach_per_post,
  a.avg_score,
  a.baseline_score,
  a.last_posted_at,
  t.top_post_id,
  t.top_post_score,
  -- Confidence signals. Threshold of 3 posts chosen to match the
  -- single-operator cadence (~2–4 posts/week); tune via a dbt var later if
  -- we add configurability. `sample_size_confidence` is a simple 0–1
  -- linear ramp up to the threshold so the UI can show a progress dot.
  (a.post_count < 3)                                        as low_sample_flag,
  least(1.0, a.post_count / 3.0)::numeric(4,3)              as sample_size_confidence
from aggregated a
left join top_per_theme t
  on t.theme_key = a.theme_key and t.period_days = a.period_days
