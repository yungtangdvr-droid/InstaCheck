-- hour in [0, 23] and sample_confidence in [0, 1].
select
  period_days,
  day_of_week,
  hour,
  media_type,
  sample_confidence
from {{ ref('mart_best_posting_windows') }}
where hour < 0
   or hour > 23
   or sample_confidence < 0
   or sample_confidence > 1
