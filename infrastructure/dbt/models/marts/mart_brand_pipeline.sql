-- mart_brand_pipeline : état du pipe par brand avec valeur pondérée
select
  b.id                                                        as brand_id,
  b.name,
  b.status,
  b.aesthetic_fit_score,
  b.business_fit_score,
  count(distinct o.id)                                        as opportunity_count,
  sum(o.estimated_value)                                      as total_pipeline_value,
  sum(o.estimated_value * o.probability / 100.0)              as weighted_pipeline_value,
  max(o.last_activity_at)                                     as last_activity_at,
  array_agg(distinct o.stage)                                 as active_stages
from {{ source('public', 'brands') }} b
left join {{ source('public', 'opportunities') }} o
  on o.brand_id = b.id
  and o.stage not in ('won', 'lost', 'dormant')
group by b.id, b.name, b.status, b.aesthetic_fit_score, b.business_fit_score
