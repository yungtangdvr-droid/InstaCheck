-- Parity check: per-post total_saves in the mart must equal the raw sum of
-- post_metrics_daily.saves for the same post. Catches silent baseline/join
-- regressions before they corrupt /analytics and /content-lab.
with raw_totals as (
  select post_id, coalesce(sum(saves), 0)::numeric as raw_saves
  from {{ source('public', 'post_metrics_daily') }}
  group by post_id
)
select
  p.post_id,
  p.total_saves as mart_saves,
  coalesce(r.raw_saves, 0) as raw_saves
from {{ ref('mart_post_performance') }} p
left join raw_totals r on r.post_id = p.post_id
where p.total_saves <> coalesce(r.raw_saves, 0)
