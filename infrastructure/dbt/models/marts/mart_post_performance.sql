-- mart_post_performance : score par post avec baseline et delta format
-- Dépend de : posts, post_metrics_daily, post_tags
with metrics as (
  select
    p.id                    as post_id,
    p.account_id,
    p.media_type,
    p.caption,
    p.permalink,
    p.posted_at,
    sum(m.saves)            as total_saves,
    sum(m.shares)           as total_shares,
    sum(m.comments)         as total_comments,
    sum(m.likes)            as total_likes,
    sum(m.profile_visits)   as total_profile_visits,
    sum(m.reach)            as total_reach,
    sum(m.impressions)      as total_impressions
  from {{ source('public', 'posts') }} p
  left join {{ source('public', 'post_metrics_daily') }} m on m.post_id = p.id
  group by p.id, p.account_id, p.media_type, p.caption, p.permalink, p.posted_at
),
baseline as (
  select
    media_type,
    avg(total_saves)          as avg_saves,
    avg(total_shares)         as avg_shares,
    avg(total_comments)       as avg_comments,
    avg(total_likes)          as avg_likes,
    avg(total_profile_visits) as avg_profile_visits
  from metrics
  where posted_at >= now() - interval '30 days'
  group by media_type
)
select
  m.*,
  round(
    (
      0.35 * case when b.avg_saves > 0        then least(m.total_saves / b.avg_saves, 2)               else 0 end +
      0.30 * case when b.avg_shares > 0       then least(m.total_shares / b.avg_shares, 2)             else 0 end +
      0.15 * case when b.avg_comments > 0     then least(m.total_comments / b.avg_comments, 2)         else 0 end +
      0.10 * case when b.avg_likes > 0        then least(m.total_likes / b.avg_likes, 2)               else 0 end +
      0.10 * case when b.avg_profile_visits > 0 then least(m.total_profile_visits / b.avg_profile_visits, 2) else 0 end
    ) / 2 * 100
  ) as performance_score
from metrics m
left join baseline b on b.media_type = m.media_type
