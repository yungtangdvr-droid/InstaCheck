-- mart_post_performance : one row per post with weighted performance score.
--
-- Grain: post_id (unique).
-- Timezone: Europe/Paris (all time derivations come from stg_posts).
-- Weights mirror POST_SCORE_WEIGHTS in packages/scoring/index.ts — change
-- both in lockstep or the app + dbt scoring drift silently.
--
-- `performance_score`   : weighted-sum of per-metric ratios against the
--                         per-format baseline, clamped to [0, 100].
-- `baseline_score`      : the score a perfectly-average post of the same
--                         format would receive in this dataset (50 by
--                         construction — each metric ratio = 1). Exposed as
--                         a column so callers can compare score vs baseline
--                         directly without re-deriving the weighting logic.
-- `score_delta`         : performance_score − baseline_score.
-- `in_last_{7,30,90}d`  : rolling-window flags for period filtering.

with posts as (
  select * from {{ ref('stg_posts') }}
),
metrics as (
  select * from {{ ref('stg_post_metrics_daily') }}
),
post_tag_array as (
  select
    post_id,
    array_agg(distinct tag order by tag) as tags
  from {{ ref('stg_post_tags') }}
  group by post_id
),
post_theme_array as (
  select
    pt.post_id,
    array_agg(distinct t.theme_name order by t.theme_name) as theme_names
  from {{ ref('stg_post_tags') }} pt
  join {{ ref('stg_content_themes') }} t on pt.tag = any(t.tags)
  group by pt.post_id
),
joined as (
  select
    p.post_id,
    p.account_id,
    p.media_type,
    p.caption,
    p.permalink,
    p.posted_at,
    p.posted_at_local,
    p.posted_date_local,
    p.posted_dow,
    p.posted_hour,
    p.in_last_7d,
    p.in_last_30d,
    p.in_last_90d,
    coalesce(m.total_reach,          0)::numeric as total_reach,
    coalesce(m.total_impressions,    0)::numeric as total_impressions,
    coalesce(m.total_saves,          0)::numeric as total_saves,
    coalesce(m.total_shares,         0)::numeric as total_shares,
    coalesce(m.total_likes,          0)::numeric as total_likes,
    coalesce(m.total_comments,       0)::numeric as total_comments,
    coalesce(m.total_profile_visits, 0)::numeric as total_profile_visits,
    coalesce(tg.tags,        array[]::text[])    as tags,
    coalesce(th.theme_names, array[]::text[])    as theme_names
  from posts p
  left join metrics         m  on m.post_id  = p.post_id
  left join post_tag_array  tg on tg.post_id = p.post_id
  left join post_theme_array th on th.post_id = p.post_id
),
-- Rolling-30d baseline per format. Aggregated as sums + sample size so we
-- can cheaply subtract the current post in the main select below to avoid
-- self-baseline bias (a single outlier dragging its own baseline up).
baseline_agg as (
  select
    media_type,
    sum(total_saves)          as sum_saves,
    sum(total_shares)         as sum_shares,
    sum(total_comments)       as sum_comments,
    sum(total_likes)          as sum_likes,
    sum(total_profile_visits) as sum_profile_visits,
    count(*)                  as sample_size
  from joined
  where in_last_30d
  group by media_type
),
scored as (
  select
    j.*,
    -- Self-excluding baseline for posts IN the 30d window, plain baseline
    -- for posts OUTSIDE it. Null when the format has zero 30d samples so
    -- the main score falls through to 0 instead of dividing by zero.
    case
      when j.in_last_30d and b.sample_size > 1
        then (b.sum_saves - j.total_saves) / (b.sample_size - 1)::numeric
      when coalesce(b.sample_size, 0) > 0
        then b.sum_saves / b.sample_size::numeric
      else null
    end as baseline_saves,
    case
      when j.in_last_30d and b.sample_size > 1
        then (b.sum_shares - j.total_shares) / (b.sample_size - 1)::numeric
      when coalesce(b.sample_size, 0) > 0
        then b.sum_shares / b.sample_size::numeric
      else null
    end as baseline_shares,
    case
      when j.in_last_30d and b.sample_size > 1
        then (b.sum_comments - j.total_comments) / (b.sample_size - 1)::numeric
      when coalesce(b.sample_size, 0) > 0
        then b.sum_comments / b.sample_size::numeric
      else null
    end as baseline_comments,
    case
      when j.in_last_30d and b.sample_size > 1
        then (b.sum_likes - j.total_likes) / (b.sample_size - 1)::numeric
      when coalesce(b.sample_size, 0) > 0
        then b.sum_likes / b.sample_size::numeric
      else null
    end as baseline_likes,
    case
      when j.in_last_30d and b.sample_size > 1
        then (b.sum_profile_visits - j.total_profile_visits) / (b.sample_size - 1)::numeric
      when coalesce(b.sample_size, 0) > 0
        then b.sum_profile_visits / b.sample_size::numeric
      else null
    end as baseline_profile_visits,
    coalesce(b.sample_size, 0) as format_sample_size
  from joined j
  left join baseline_agg b on b.media_type = j.media_type
),
-- Each per-metric ratio is capped at 2 so a single runaway metric cannot
-- alone push the overall score past 100 on its own weight.
ratio_scored as (
  select
    s.*,
    0.35 * case when coalesce(s.baseline_saves,          0) > 0 then least(s.total_saves          / s.baseline_saves,          2) else 0 end +
    0.30 * case when coalesce(s.baseline_shares,         0) > 0 then least(s.total_shares         / s.baseline_shares,         2) else 0 end +
    0.15 * case when coalesce(s.baseline_comments,       0) > 0 then least(s.total_comments       / s.baseline_comments,       2) else 0 end +
    0.10 * case when coalesce(s.baseline_likes,          0) > 0 then least(s.total_likes          / s.baseline_likes,          2) else 0 end +
    0.10 * case when coalesce(s.baseline_profile_visits, 0) > 0 then least(s.total_profile_visits / s.baseline_profile_visits, 2) else 0 end
      as raw_score
  from scored s
)
select
  post_id,
  account_id,
  media_type,
  caption,
  permalink,
  posted_at,
  posted_at_local,
  posted_date_local,
  posted_dow,
  posted_hour,
  in_last_7d,
  in_last_30d,
  in_last_90d,
  tags,
  theme_names,
  total_reach,
  total_impressions,
  total_saves,
  total_shares,
  total_likes,
  total_comments,
  total_profile_visits,
  baseline_saves,
  baseline_shares,
  baseline_comments,
  baseline_likes,
  baseline_profile_visits,
  format_sample_size,
  -- performance_score: weighted ratio vs per-format baseline, clamped 0–100.
  round(greatest(0, least(1, raw_score)) * 100)::int              as performance_score,
  -- baseline_score: the score a perfectly-average post (all ratios = 1)
  -- would receive. Equal to 50 while weights sum to 1; exposed as a column
  -- so callers never hard-code it.
  round(greatest(0, least(1, 0.35 + 0.30 + 0.15 + 0.10 + 0.10)) * 100 / 2)::int
    as baseline_score,
  (round(greatest(0, least(1, raw_score)) * 100)::int
    - round(greatest(0, least(1, 0.35 + 0.30 + 0.15 + 0.10 + 0.10)) * 100 / 2)::int)
    as score_delta
from ratio_scored
