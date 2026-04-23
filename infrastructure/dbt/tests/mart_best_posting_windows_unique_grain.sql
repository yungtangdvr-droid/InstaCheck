-- Grain: (period_days, day_of_week, hour, media_type). NULL media_type is
-- the "all formats" rollup row — still distinct from any format-specific row
-- because we compare with `is not distinct from`.
select
  period_days,
  day_of_week,
  hour,
  media_type,
  count(*) as n
from {{ ref('mart_best_posting_windows') }}
group by period_days, day_of_week, hour, media_type
having count(*) > 1
