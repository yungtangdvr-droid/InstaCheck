-- mart_best_posting_windows : average performance per (day_of_week, hour)
-- bucket, sliced by format and period.
--
-- Grain: (period_days, day_of_week, hour, media_type) where
--   period_days   ∈ (7, 30, 90)
--   day_of_week   ∈ 1..7 (ISO: 1 = Monday … 7 = Sunday) in Europe/Paris
--   hour          ∈ 0..23 in Europe/Paris
--   media_type    = NULL for the "all formats" rollup row, else the actual
--                   Instagram media_type.
--
-- TIMEZONE — Europe/Paris. Chosen as the canonical timezone for Creator
-- Hub (operator TZ). All DOW/hour derivations flow from stg_posts.posted_
-- at_local. Do NOT switch to UTC without coordinating with the app's
-- FormatMatrix / BestWindowHeatmap components.
--
-- `sample_confidence` is post_count / total_posts_in_period_and_format,
-- exposed so the UI can weight cells or hide low-confidence buckets.

with periods as (
  select 7  as period_days
  union all select 30
  union all select 90
),
posts_in_period as (
  select
    pp.post_id,
    pp.media_type,
    pp.posted_dow,
    pp.posted_hour,
    pp.total_reach,
    pp.total_saves,
    pp.performance_score,
    p.period_days
  from {{ ref('mart_post_performance') }} pp
  cross join periods p
  where (p.period_days =  7 and pp.in_last_7d)
     or (p.period_days = 30 and pp.in_last_30d)
     or (p.period_days = 90 and pp.in_last_90d)
),
per_format as (
  select
    period_days,
    posted_dow                              as day_of_week,
    posted_hour                             as hour,
    media_type::text                        as media_type,
    count(*)                                as post_count,
    round(avg(total_saves))::int            as avg_saves,
    round(avg(total_reach))::int            as avg_reach,
    round(avg(performance_score))::int      as avg_score
  from posts_in_period
  group by period_days, posted_dow, posted_hour, media_type
),
all_formats as (
  select
    period_days,
    posted_dow                              as day_of_week,
    posted_hour                             as hour,
    null::text                              as media_type,
    count(*)                                as post_count,
    round(avg(total_saves))::int            as avg_saves,
    round(avg(total_reach))::int            as avg_reach,
    round(avg(performance_score))::int      as avg_score
  from posts_in_period
  group by period_days, posted_dow, posted_hour
),
all_rows as (
  select * from per_format
  union all
  select * from all_formats
),
-- Denominator for sample_confidence: total posts in the same
-- (period, media_type) slice (media_type null for the rollup row).
denominators as (
  select
    period_days,
    media_type::text as media_type,
    count(*) as total_posts
  from posts_in_period
  group by grouping sets ((period_days, media_type), (period_days))
)
select
  r.period_days,
  r.day_of_week,
  r.hour,
  r.media_type,
  r.post_count,
  r.avg_saves,
  r.avg_reach,
  r.avg_score,
  case
    when d.total_posts is null or d.total_posts = 0 then 0
    else round((r.post_count::numeric / d.total_posts), 3)
  end                                       as sample_confidence,
  (r.post_count < 2)                        as low_sample_flag
from all_rows r
left join denominators d
  on d.period_days = r.period_days
  and d.media_type is not distinct from r.media_type
