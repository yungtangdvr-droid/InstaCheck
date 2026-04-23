-- sample_size_confidence must be in [0, 1].
select theme_name, period_days, sample_size_confidence
from {{ ref('mart_theme_performance') }}
where sample_size_confidence < 0
   or sample_size_confidence > 1
