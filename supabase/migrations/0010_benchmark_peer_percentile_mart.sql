-- ============================================================
-- Creator Hub — Migration 0010 : Benchmark peer percentile mart
-- ============================================================
-- PR6: read-only mart layer that turns the raw benchmark pool
-- (raw_benchmark_instagram_account_daily, raw_benchmark_instagram_media)
-- into actionable peer-percentile distributions consumed by the
-- post-detail page (/analytics/post/[id]).
--
-- Doctrine:
--   * Public Meta data only — exposes per-follower rates derived
--     from like_count and comments_count, the two metrics that
--     Business Discovery surfaces reliably and that align with
--     the owner's own post_metrics_daily counterparts.
--   * No reach / saves / shares / profile_visits — those are not
--     available cross-account and would be doctrine-breaking if
--     introduced via this view.
--   * `aspirational` cohort is explicitly excluded from the pool.
--   * `view_count` is intentionally NOT exposed — comparing peer
--     view rates without media-type bucketing would mislead on
--     non-Reel owner posts. Deferred to a later PR alongside
--     format-aware bucketing.
--
-- Pool inclusion (peer-percentile V1):
--     active = true
--     AND cohort IN ('core_peer', 'french_francophone')
--     AND latest_daily.followers_count BETWEEN 20000 AND 800000
--
-- Per-media rate normalisation: each peer media row is divided
-- by its OWN account's latest followers_count. We never divide
-- by a synthetic average — that would smear small-account rates.
--
-- Access model: authenticated-only, mirrors the convention in
-- 0004_mart_views.sql / 0005_mart_views_bootstrap.sql.
-- Idempotency: drop view if exists then create — safe to rerun.
--
-- Numbering note (drift): packages/db/migrations is offset by
-- three because mart_views (0004, 0005) and post_content_analysis
-- (0006) were only mirrored into supabase/migrations. The matching
-- mirror for THIS file lives at
-- packages/db/migrations/0007_benchmark_peer_percentile_mart.sql
-- and is body-identical.

drop view if exists public.v_mart_benchmark_peer_percentile cascade;
drop view if exists public.v_mart_benchmark_peer_pool       cascade;

-- ------------------------------------------------------------
-- v_mart_benchmark_peer_pool
-- ------------------------------------------------------------
-- Grain: one row per benchmark_accounts row.
-- The `eligible` boolean folds active + cohort + latest snapshot
-- followers band into a single flag so consumers can either filter
-- on `eligible = true` (production read path) or read the full set
-- with the inclusion reason for diagnostics.

create view public.v_mart_benchmark_peer_pool as
with latest_daily as (
  select distinct on (benchmark_account_id)
    benchmark_account_id,
    date           as latest_snapshot_date,
    followers_count
  from public.raw_benchmark_instagram_account_daily
  order by benchmark_account_id, date desc, synced_at desc
),
media_counts as (
  select
    benchmark_account_id,
    count(*)::int as media_sample_size
  from public.raw_benchmark_instagram_media
  group by benchmark_account_id
)
select
  a.id                              as benchmark_account_id,
  a.ig_username,
  a.cohort,
  a.language,
  a.active,
  d.latest_snapshot_date,
  d.followers_count,
  coalesce(mc.media_sample_size, 0) as media_sample_size,
  (
    a.active
    and a.cohort in ('core_peer', 'french_francophone')
    and d.followers_count is not null
    and d.followers_count between 20000 and 800000
  )                                 as eligible
from public.benchmark_accounts a
left join latest_daily  d  on d.benchmark_account_id  = a.id
left join media_counts  mc on mc.benchmark_account_id = a.id;

grant select on public.v_mart_benchmark_peer_pool to authenticated, service_role;

-- ------------------------------------------------------------
-- v_mart_benchmark_peer_percentile
-- ------------------------------------------------------------
-- Grain: one row per metric ('likes', 'comments').
-- Each row carries:
--   * rates           — full sorted-asc array of per-media rates
--                       (peer.metric / peer.followers_count) drawn
--                       from media rows whose
--                       metric_availability[<metric_field>] = 'available'
--                       and whose owning peer is eligible per
--                       v_mart_benchmark_peer_pool.
--   * p10..p90        — percentile_cont breakpoints over the same
--                       rate sample. Useful for diagnostics and
--                       coarse UI rendering; the exact owner-rank
--                       percentile is computed in TS from `rates`.
--   * sample_size     — count of media rows feeding `rates`.
--   * account_count   — distinct eligible accounts contributing.
--   * pool_*          — inclusion-rule audit fields, surfaced in UI.
--
-- The full sorted array lets callers compute exact owner-rate
-- percentiles (rank-based, average of count(rate < ownerRate) and
-- count(rate <= ownerRate)) without being constrained to the
-- precomputed quantiles. Payload stays bounded by the natural pool
-- size (~30 accounts × ≤5 media each = ≤150 rows).

create view public.v_mart_benchmark_peer_percentile as
with eligible_accounts as (
  select
    benchmark_account_id,
    followers_count
  from public.v_mart_benchmark_peer_pool
  where eligible = true
),
per_media as (
  select
    m.benchmark_account_id,
    m.like_count,
    m.comments_count,
    m.metric_availability,
    ea.followers_count
  from public.raw_benchmark_instagram_media m
  join eligible_accounts ea
    on ea.benchmark_account_id = m.benchmark_account_id
),
likes_rates as (
  select
    benchmark_account_id,
    (like_count::double precision / followers_count::double precision) as rate
  from per_media
  where like_count is not null
    and followers_count > 0
    and (metric_availability ->> 'like_count') = 'available'
),
comments_rates as (
  select
    benchmark_account_id,
    (comments_count::double precision / followers_count::double precision) as rate
  from per_media
  where comments_count is not null
    and followers_count > 0
    and (metric_availability ->> 'comments_count') = 'available'
),
likes_agg as (
  select
    'likes'::text                                                              as metric,
    coalesce(array_agg(rate order by rate), array[]::double precision[])       as rates,
    count(*)::int                                                              as sample_size,
    count(distinct benchmark_account_id)::int                                  as account_count,
    percentile_cont(0.10) within group (order by rate)                         as p10,
    percentile_cont(0.25) within group (order by rate)                         as p25,
    percentile_cont(0.50) within group (order by rate)                         as p50,
    percentile_cont(0.75) within group (order by rate)                         as p75,
    percentile_cont(0.90) within group (order by rate)                         as p90
  from likes_rates
),
comments_agg as (
  select
    'comments'::text                                                           as metric,
    coalesce(array_agg(rate order by rate), array[]::double precision[])       as rates,
    count(*)::int                                                              as sample_size,
    count(distinct benchmark_account_id)::int                                  as account_count,
    percentile_cont(0.10) within group (order by rate)                         as p10,
    percentile_cont(0.25) within group (order by rate)                         as p25,
    percentile_cont(0.50) within group (order by rate)                         as p50,
    percentile_cont(0.75) within group (order by rate)                         as p75,
    percentile_cont(0.90) within group (order by rate)                         as p90
  from comments_rates
),
unioned as (
  select * from likes_agg
  union all
  select * from comments_agg
)
select
  metric,
  rates,
  sample_size,
  account_count,
  array['core_peer','french_francophone']::text[] as pool_cohorts,
  20000::int                                       as followers_floor,
  800000::int                                      as followers_ceiling,
  p10,
  p25,
  p50,
  p75,
  p90,
  now()                                            as computed_at
from unioned;

grant select on public.v_mart_benchmark_peer_percentile to authenticated, service_role;
