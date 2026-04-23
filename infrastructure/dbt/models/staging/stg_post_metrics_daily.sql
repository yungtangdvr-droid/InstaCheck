-- stg_post_metrics_daily : per-post totals of Instagram insights
--
-- Aggregates every raw metric column over the full history available in
-- public.post_metrics_daily and also emits the last_posted_metric_date so
-- freshness can be checked downstream without re-reading the raw table.
select
  m.post_id,
  sum(m.reach)                                as total_reach,
  sum(m.impressions)                          as total_impressions,
  sum(m.saves)                                as total_saves,
  sum(m.shares)                               as total_shares,
  sum(m.likes)                                as total_likes,
  sum(m.comments)                             as total_comments,
  sum(m.profile_visits)                       as total_profile_visits,
  sum(m.follower_delta)                       as total_follower_delta,
  count(*)                                    as daily_row_count,
  max(m.date)                                 as last_metric_date
from {{ source('public', 'post_metrics_daily') }} m
group by m.post_id
