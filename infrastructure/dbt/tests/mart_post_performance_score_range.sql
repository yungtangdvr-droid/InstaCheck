-- performance_score and baseline_score must stay in [0, 100].
-- sample_size_confidence equivalent tests live in other files.
select
  post_id,
  performance_score,
  baseline_score
from {{ ref('mart_post_performance') }}
where performance_score < 0
   or performance_score > 100
   or baseline_score    < 0
   or baseline_score    > 100
