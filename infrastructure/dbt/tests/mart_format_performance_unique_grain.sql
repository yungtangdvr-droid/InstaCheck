-- Grain: (media_type, period_days). No duplicates allowed.
select
  media_type,
  period_days,
  count(*) as n
from {{ ref('mart_format_performance') }}
group by media_type, period_days
having count(*) > 1
