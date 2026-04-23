-- mart_format_performance : aggregate by (media_type, period_days).
--
-- Grain: (media_type, period_days) where period_days in (7, 30, 90).
-- Sourced from mart_post_performance so averages are per-post (not
-- per-metric-row as in the Sprint-1 draft) and share the same score
-- definition as /analytics.
--
-- Null `top_post_id` means no posts of that format in the period.

with periods as (
  select 7  as period_days
  union all select 30
  union all select 90
),
posts_in_period as (
  select
    pp.media_type,
    p.period_days,
    pp.post_id,
    pp.total_reach,
    pp.total_saves,
    pp.total_shares,
    pp.total_likes,
    pp.total_comments,
    pp.total_profile_visits,
    pp.performance_score,
    pp.baseline_score
  from {{ ref('mart_post_performance') }} pp
  cross join periods p
  where (p.period_days =  7 and pp.in_last_7d)
     or (p.period_days = 30 and pp.in_last_30d)
     or (p.period_days = 90 and pp.in_last_90d)
),
aggregated as (
  select
    media_type,
    period_days,
    count(*)                                  as post_count,
    sum(total_reach)                          as total_reach,
    sum(total_saves)                          as total_saves,
    sum(total_shares)                         as total_shares,
    sum(total_likes)                          as total_likes,
    sum(total_comments)                       as total_comments,
    sum(total_profile_visits)                 as total_profile_visits,
    round(avg(total_reach))::int              as avg_reach_per_post,
    round(avg(total_saves))::int              as avg_saves_per_post,
    round(avg(total_shares))::int             as avg_shares_per_post,
    round(avg(total_likes))::int              as avg_likes_per_post,
    round(avg(total_comments))::int           as avg_comments_per_post,
    round(avg(total_profile_visits))::int     as avg_profile_visits_per_post,
    round(avg(performance_score))::int        as avg_score,
    max(baseline_score)::int                  as baseline_score
  from posts_in_period
  group by media_type, period_days
),
top_per_format as (
  select distinct on (media_type, period_days)
    media_type,
    period_days,
    post_id            as top_post_id,
    performance_score  as top_post_score
  from posts_in_period
  order by media_type, period_days, performance_score desc, post_id
)
select
  a.media_type,
  a.period_days,
  a.post_count,
  a.total_reach,
  a.total_saves,
  a.total_shares,
  a.total_likes,
  a.total_comments,
  a.total_profile_visits,
  a.avg_reach_per_post,
  a.avg_saves_per_post,
  a.avg_shares_per_post,
  a.avg_likes_per_post,
  a.avg_comments_per_post,
  a.avg_profile_visits_per_post,
  a.avg_score,
  a.baseline_score,
  t.top_post_id,
  t.top_post_score
from aggregated a
left join top_per_format t
  on t.media_type = a.media_type and t.period_days = a.period_days
