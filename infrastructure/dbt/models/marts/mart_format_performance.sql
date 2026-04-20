-- mart_format_performance : agrégat par format (REEL, CAROUSEL, IMAGE, STORY)
select
  p.media_type,
  count(distinct p.id)          as post_count,
  avg(m.reach)                  as avg_reach,
  avg(m.saves)                  as avg_saves,
  avg(m.shares)                 as avg_shares,
  avg(m.comments)               as avg_comments,
  avg(m.likes)                  as avg_likes,
  avg(m.profile_visits)         as avg_profile_visits
from {{ source('public', 'posts') }} p
left join {{ source('public', 'post_metrics_daily') }} m on m.post_id = p.id
group by p.media_type
