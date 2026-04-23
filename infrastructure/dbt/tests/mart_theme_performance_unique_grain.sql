-- Grain: (theme_name, period_days).
select
  theme_name,
  period_days,
  count(*) as n
from {{ ref('mart_theme_performance') }}
group by theme_name, period_days
having count(*) > 1
