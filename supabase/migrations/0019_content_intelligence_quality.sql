-- ============================================================
-- Creator Hub — Migration 0019 : Content Intelligence V2
--                                quality / guardrails (views)
-- ============================================================
-- Adds three guardrails to the auto-recommendation pipeline shipped
-- in migration 0017 / PR #91, without changing the global scoring
-- (v_mart_post_performance), without writing new tables, without
-- adding any dependency, and without touching the UI:
--
--   1. Outlier Guard
--        Prevents an isolated freak-viral post from becoming a
--        'replicate' recommendation. Replicate now requires
--        two-channel corroboration (saves AND shares above
--        baseline), a peer in the same theme/format, and rejects
--        small-sample top-of-distribution scores.
--
--   2. Early Performance Prediction
--        Prevents an immature or partially-synced post from
--        becoming a 'drop' recommendation. Drop now requires
--        sufficient daily metric coverage, a recent terminal
--        observation, and a flat (or shrinking) growth slope.
--
--   3. Recommendation Confidence Engine
--        Computes a deterministic 0..100 confidence per candidate
--        using six data-quality factors and bands it into
--        strong / moderate / weak. Candidates with confidence < 50
--        are filtered out at the view level and never inserted.
--
-- New views in this migration
--   * public.v_post_metric_growth        -- per post, lifetime → delta
--   * public.v_post_theme_peers          -- corroborating peers
--   * public.v_post_intelligence_quality -- confidence + band
--
-- Recreated view (additive output, same identity)
--   * public.v_post_intelligence_candidates
--        Same (post_id, type, reason_code) identity as in 0017.
--        New projected columns: confidence, signal_strength.
--        Old projected columns are preserved byte-for-byte so the
--        TS reason builder keeps working.
--
-- Metric semantics (IMPORTANT)
-- ----------------------------
-- post_metrics_daily.{saves,shares,reach,impressions,likes,
-- comments,profile_visits} are LIFETIME CUMULATIVE SNAPSHOTS, not
-- daily deltas. Confirmed in apps/web/lib/meta/instagram-client.ts
-- (period: 'lifetime') and apps/web/lib/meta/sync-insights.ts
-- (one row upserted per (post_id, sync-date) carrying the lifetime
-- value as of that sync). Therefore growth is computed as the
-- difference between two snapshots in time, NOT as sum() over a
-- window. The candidate view in 0017 still uses sum() because
-- baseline normalisation absorbs the inflation; we do not change
-- that here (out of scope: global scoring is frozen).
--
-- security_invoker = true mirrors migrations 0015–0017 so RLS on
-- the underlying tables remains authoritative.
--
-- Rollback (no down-migration convention in this repo)
-- ----------------------------------------------------
--   drop view if exists public.v_post_intelligence_candidates cascade;
--   drop view if exists public.v_post_intelligence_quality    cascade;
--   drop view if exists public.v_post_theme_peers             cascade;
--   drop view if exists public.v_post_metric_growth           cascade;
--   -- and re-run migration 0017 to restore the V1 candidate view.

drop view if exists public.v_post_intelligence_candidates cascade;
drop view if exists public.v_post_intelligence_quality    cascade;
drop view if exists public.v_post_theme_peers             cascade;
drop view if exists public.v_post_metric_growth           cascade;

-- ------------------------------------------------------------
-- v_post_metric_growth
-- ------------------------------------------------------------
-- Grain: one row per post_id (only posts that have at least one
-- post_metrics_daily row).
--
-- Reads cumulative-lifetime snapshots and derives:
--   * metric_days_count        : distinct snapshot dates
--   * first_metric_date        : earliest snapshot date
--   * last_metric_date         : latest snapshot date
--   * latest_saves / shares    : value on last_metric_date
--   * saves_at_or_before_7d_ago / saves_at_or_before_14d_ago
--                              : closest snapshot at-or-before that
--                                anchor; coalesce(0) when none
--   * delta_saves_last_7d      = latest - at_or_before_7d_ago
--   * delta_saves_prev_7d      = at_or_before_7d_ago - at_or_before_14d_ago
--   * saves_growth_pct_7d      = delta_saves_last_7d / NULLIF(latest, 0) * 100
--   * recent_surge_flag        = delta_saves_last_7d > 2 × delta_saves_prev_7d
--                                AND delta_saves_last_7d >= 5
--                                (the >= 5 floor avoids tagging tiny moves
--                                 as a "surge" purely by ratio).
--
-- The 7d / 14d anchors are tied to last_metric_date (not now()) so a
-- post whose last sync was 10 days ago still gets a meaningful
-- delta — the metric coverage gate in v_post_intelligence_candidates
-- handles the staleness case separately.

create view public.v_post_metric_growth
  with (security_invoker = true)
  as
with bounds as (
  select
    m.post_id,
    count(distinct m.date)::int       as metric_days_count,
    min(m.date)                       as first_metric_date,
    max(m.date)                       as last_metric_date
  from public.post_metrics_daily m
  group by m.post_id
),
latest as (
  select distinct on (m.post_id)
    m.post_id,
    m.date          as anchor_date,
    m.saves         as latest_saves,
    m.shares        as latest_shares
  from public.post_metrics_daily m
  order by m.post_id, m.date desc
),
saves_7d as (
  select distinct on (m.post_id)
    m.post_id,
    m.saves         as saves_7d_ago
  from public.post_metrics_daily m
  join bounds b on b.post_id = m.post_id
  where m.date <= b.last_metric_date - interval '7 days'
  order by m.post_id, m.date desc
),
saves_14d as (
  select distinct on (m.post_id)
    m.post_id,
    m.saves         as saves_14d_ago
  from public.post_metrics_daily m
  join bounds b on b.post_id = m.post_id
  where m.date <= b.last_metric_date - interval '14 days'
  order by m.post_id, m.date desc
)
select
  b.post_id,
  b.metric_days_count,
  b.first_metric_date,
  b.last_metric_date,
  l.latest_saves,
  l.latest_shares,
  coalesce(s7.saves_7d_ago, 0)::numeric                    as saves_7d_ago,
  coalesce(s14.saves_14d_ago, 0)::numeric                  as saves_14d_ago,
  greatest(
    0,
    coalesce(l.latest_saves, 0)::numeric - coalesce(s7.saves_7d_ago, 0)::numeric
  )                                                        as delta_saves_last_7d,
  greatest(
    0,
    coalesce(s7.saves_7d_ago,  0)::numeric - coalesce(s14.saves_14d_ago, 0)::numeric
  )                                                        as delta_saves_prev_7d,
  case
    when coalesce(l.latest_saves, 0) > 0
      then round(
        (greatest(0, coalesce(l.latest_saves, 0)::numeric - coalesce(s7.saves_7d_ago, 0)::numeric)
           / l.latest_saves::numeric) * 100,
        2
      )
    else null
  end                                                      as saves_growth_pct_7d,
  -- Surge: last 7d delta is more than 2× the previous 7d delta AND at
  -- least 5 absolute saves. The absolute floor matters because a post
  -- moving from 1 → 3 saves yields a 200% growth but is not a surge.
  (
    greatest(0, coalesce(l.latest_saves, 0)::numeric - coalesce(s7.saves_7d_ago, 0)::numeric) >=
      2 * greatest(0, coalesce(s7.saves_7d_ago, 0)::numeric - coalesce(s14.saves_14d_ago, 0)::numeric)
    and
    greatest(0, coalesce(l.latest_saves, 0)::numeric - coalesce(s7.saves_7d_ago, 0)::numeric) >= 5
  )                                                        as recent_surge_flag
from bounds b
left join latest    l   on l.post_id   = b.post_id
left join saves_7d  s7  on s7.post_id  = b.post_id
left join saves_14d s14 on s14.post_id = b.post_id;

grant select on public.v_post_metric_growth to authenticated, service_role;

-- ------------------------------------------------------------
-- v_post_theme_peers
-- ------------------------------------------------------------
-- Grain: one row per (media_type, primary_theme) combination that
-- has at least one peer post in the last 90d with
-- performance_score >= 55. Used by the Outlier Guard so the
-- candidate view does not become a correlated subquery per row.
--
-- A "peer" is a different post sharing the same media_type and the
-- same primary_theme. We do not filter out the candidate post
-- itself in the aggregate — the candidate view applies the
-- "at least one OTHER post" condition by checking
-- peer_count_90d_score_ge_55 - (1 if the candidate itself counts) >= 1
-- via a simple comparison against 2 (because the candidate is one
-- of the rows that satisfies the >= 55 filter when applicable).
-- For posts that themselves score below 55, the candidate is not
-- in the peer count and 1 is enough.

create view public.v_post_theme_peers
  with (security_invoker = true)
  as
select
  pp.media_type,
  pca.primary_theme,
  count(*)::int                                  as peer_count_90d_score_ge_55
from public.v_mart_post_performance pp
left join public.post_content_analysis pca
  on pca.post_id = pp.post_id
where pp.in_last_90d
  and pp.performance_score >= 55
  and pca.primary_theme is not null
  and pca.primary_theme <> 'unknown'
group by pp.media_type, pca.primary_theme;

grant select on public.v_post_theme_peers to authenticated, service_role;

-- ------------------------------------------------------------
-- v_post_intelligence_quality
-- ------------------------------------------------------------
-- Grain: one row per post_id that exists in v_post_intelligence_features.
--
-- Computes the 6-factor confidence and the categorical band:
--
--   format_sample_score     = least(format_sample_size / 10, 1)            w=0.20
--   archive_sample_score    = least(coalesce(year, era, 0) / 12, 1)        w=0.15
--   archive_coverage_score  = coalesce(archive_coverage_pct, 0) / 100      w=0.10
--   analysis_score          = coalesce(content_analysis_confidence, 0)     w=0.15
--                             (already in [0,1])
--   maturity_score          = least(metric_days_count / expected_days, 1)  w=0.20
--                             expected_days = least(days_since_posted, 30)
--   agreement_score         = 1.0 if both multipliers same side of 1 AND
--                                    |log2(saves_m / shares_m)| < 1
--                             0.5 if both same side of 1 only
--                             0.0 otherwise (or either is null)            w=0.20
--
--   confidence = round(weighted_sum × 100)
--   signal_strength : strong (>= 75), moderate (50..74), weak (< 50)
--
-- Missing-metric handling: every input goes through coalesce(..., 0)
-- so confidence is never NULL. A post with no archive baseline and
-- no analysis still gets a deterministic score (it will simply be
-- low and probably hard-gated below).

create view public.v_post_intelligence_quality
  with (security_invoker = true)
  as
with f as (
  select * from public.v_post_intelligence_features
),
g as (
  select * from public.v_post_metric_growth
),
joined as (
  select
    f.post_id,
    f.media_type,
    f.primary_theme,
    f.format_sample_size,
    f.archive_year_sample_size,
    f.archive_era_sample_size,
    f.archive_coverage_pct,
    f.content_analysis_confidence,
    f.saves_multiplier,
    f.shares_multiplier,
    f.days_since_posted,
    coalesce(g.metric_days_count, 0)            as metric_days_count,
    g.last_metric_date,
    g.delta_saves_last_7d,
    g.delta_saves_prev_7d,
    g.saves_growth_pct_7d,
    g.recent_surge_flag,
    -- expected_days caps at 30 so a 90-day-old post is not punished
    -- for "missing" 60 historical sync days.
    least(coalesce(f.days_since_posted, 0), 30)::int as expected_days
  from f
  left join g on g.post_id = f.post_id
),
scored as (
  select
    j.*,
    -- format sample factor
    least(coalesce(j.format_sample_size, 0)::numeric / 10::numeric, 1::numeric)
                                                              as format_sample_score,
    -- archive sample factor (year first, fallback era)
    least(
      coalesce(j.archive_year_sample_size, j.archive_era_sample_size, 0)::numeric / 12::numeric,
      1::numeric
    )                                                         as archive_sample_score,
    -- archive coverage factor
    coalesce(j.archive_coverage_pct, 0)::numeric / 100::numeric
                                                              as archive_coverage_score,
    -- analysis confidence factor (already 0..1)
    least(greatest(coalesce(j.content_analysis_confidence, 0)::numeric, 0::numeric), 1::numeric)
                                                              as analysis_score,
    -- maturity factor
    case
      when j.expected_days <= 0 then 0::numeric
      else least(j.metric_days_count::numeric / j.expected_days::numeric, 1::numeric)
    end                                                       as maturity_score,
    -- multiplier agreement factor
    case
      when j.saves_multiplier is null or j.shares_multiplier is null then 0::numeric
      when j.saves_multiplier = 0 or j.shares_multiplier = 0 then 0::numeric
      when sign(j.saves_multiplier - 1) <> sign(j.shares_multiplier - 1)
       and (j.saves_multiplier <> 1 and j.shares_multiplier <> 1) then 0::numeric
      when abs(ln((j.saves_multiplier::numeric) / (j.shares_multiplier::numeric)) / ln(2::numeric)) < 1::numeric
        then 1::numeric
      else 0.5::numeric
    end                                                       as agreement_score
  from joined j
),
confident as (
  select
    s.*,
    round(
      (
        0.20 * s.format_sample_score    +
        0.15 * s.archive_sample_score   +
        0.10 * s.archive_coverage_score +
        0.15 * s.analysis_score         +
        0.20 * s.maturity_score         +
        0.20 * s.agreement_score
      ) * 100
    )::int as confidence
  from scored s
)
select
  c.post_id,
  c.metric_days_count,
  c.last_metric_date,
  c.delta_saves_last_7d,
  c.delta_saves_prev_7d,
  c.saves_growth_pct_7d,
  c.recent_surge_flag,
  c.format_sample_score,
  c.archive_sample_score,
  c.archive_coverage_score,
  c.analysis_score,
  c.maturity_score,
  c.agreement_score,
  least(greatest(c.confidence, 0), 100) as confidence,
  case
    when least(greatest(c.confidence, 0), 100) >= 75 then 'strong'
    when least(greatest(c.confidence, 0), 100) >= 50 then 'moderate'
    else 'weak'
  end::text                              as signal_strength
from confident c;

grant select on public.v_post_intelligence_quality to authenticated, service_role;

-- ------------------------------------------------------------
-- v_post_intelligence_candidates  (recreated, V2)
-- ------------------------------------------------------------
-- Grain : (post_id, type) — same as V1.
-- Identity for idempotency : (post_id, type, reason_code) — UNCHANGED.
-- Reason codes : same three codes as V1 — UNCHANGED.
--
-- Output columns are a strict superset of V1: the existing TS
-- reason builder consumes the same fields by name, plus we project
-- two new internal fields (confidence, signal_strength) that the
-- writer persists onto content_recommendations.
--
-- Hard gate : every branch additionally requires
--             quality.confidence >= 50. A row with confidence < 50
--             never enters the candidate set.
--
-- Branch rules
-- ------------
-- replicate (Outlier Guard applied):
--   in_last_30d
--   AND performance_score >= 65 AND score_delta >= 15
--   AND format_sample_size >= 5
--   AND content_analysis_status = 'completed'
--   AND replication_potential IN ('high', 'medium')
--   AND saves_multiplier  >= 1.5     -- two-channel corroboration
--   AND shares_multiplier >= 1.3     -- two-channel corroboration
--   AND NOT (performance_score >= 95 AND format_sample_size < 8)
--                                    -- small-sample top-of-distribution guard
--   AND has_theme_peer               -- a peer post in same (media_type,
--                                    --   primary_theme) scored >= 55 in last 90d.
--                                    -- See has_theme_peer expression below.
--
-- adapt :
--   Same as V1, plus confidence >= 50 hard gate.
--
-- drop (Early Performance Prediction applied):
--   in_last_90d
--   AND performance_score <= 30 AND score_delta <= -15
--   AND format_sample_size >= 5
--   AND days_since_posted BETWEEN 30 AND 90
--   AND metric_days_count >=
--         GREATEST(14, FLOOR(LEAST(days_since_posted, 30) * 0.5))
--                                  -- enough sync coverage relative to
--                                  --   the meaningful 30-day window
--   AND last_metric_date >= (now() at time zone 'UTC')::date - interval '7 days'
--                                  -- a recent terminal observation exists
--   AND COALESCE(saves_growth_pct_7d, 0) <= 5    -- post no longer accumulating
--   AND COALESCE(recent_surge_flag, false) = false
--                                  -- no late "second wind"
--
-- has_theme_peer (subquery semantics)
-- -----------------------------------
--  * If primary_theme is non-null AND not 'unknown':
--      EXISTS a v_post_theme_peers row matching the candidate's
--      (media_type, primary_theme), with peer_count_90d_score_ge_55
--      strictly greater than the candidate's own contribution to that
--      peer count. Concretely:
--        peer_count_90d_score_ge_55 >= (case when candidate is itself
--                                              counted then 2 else 1 end)
--      We approximate "candidate is itself counted" with
--        (in_last_90d AND performance_score >= 55)
--      which is always true for a 'replicate' branch row (gate is >= 65),
--      so the threshold simplifies to >= 2 for replicate.
--  * Else (theme missing/unknown):
--      Fallback: at least 1 same-format post in last 90d with score >= 55
--      OTHER than the candidate. Same approximation: peer_count_format >= 2.

create view public.v_post_intelligence_candidates
  with (security_invoker = true)
  as
with f as (
  select * from public.v_post_intelligence_features
),
q as (
  select * from public.v_post_intelligence_quality
),
-- Per-format peer counts for the fallback branch of the Outlier Guard.
peers_by_format as (
  select
    pp.media_type,
    count(*)::int as peer_count_90d_score_ge_55
  from public.v_mart_post_performance pp
  where pp.in_last_90d
    and pp.performance_score >= 55
  group by pp.media_type
),
base as (
  select
    f.*,
    q.confidence,
    q.signal_strength,
    q.metric_days_count,
    q.last_metric_date,
    q.saves_growth_pct_7d,
    q.recent_surge_flag,
    -- Outlier Guard helper. peers_themed counts the candidate itself
    -- when applicable (replicate gate score >= 65 ⇒ always counted).
    coalesce(pt.peer_count_90d_score_ge_55, 0)               as peers_themed,
    coalesce(pf.peer_count_90d_score_ge_55, 0)               as peers_format
  from f
  left join q on q.post_id = f.post_id
  left join public.v_post_theme_peers pt
    on pt.media_type::text   = f.media_type
   and pt.primary_theme      = f.primary_theme
  left join peers_by_format pf
    on pf.media_type::text   = f.media_type
)
-- replicate -------------------------------------------------------
select
  b.post_id,
  'replicate'::content_recommendation_type      as type,
  'recent_strong_performer'::text               as reason_code,
  b.media_type,
  b.posted_at,
  b.performance_score,
  b.score_delta,
  b.saves_multiplier,
  b.shares_multiplier,
  b.era_index_saves,
  b.era_index_shares,
  b.primary_theme,
  b.format_pattern,
  b.replication_potential,
  b.format_sample_size,
  b.archive_year_sample_size,
  b.archive_coverage_pct,
  b.days_since_posted,
  b.confidence,
  b.signal_strength
from base b
where b.in_last_30d = true
  and b.performance_score      >= 65
  and b.score_delta            >= 15
  and b.format_sample_size     >= 5
  and b.content_analysis_status = 'completed'
  and b.replication_potential in ('high', 'medium')
  and coalesce(b.saves_multiplier,  0) >= 1.5
  and coalesce(b.shares_multiplier, 0) >= 1.3
  and not (b.performance_score >= 95 and b.format_sample_size < 8)
  and (
        case
          when b.primary_theme is not null and b.primary_theme <> 'unknown'
            then b.peers_themed >= 2     -- candidate is itself counted (score >= 65 >= 55)
          else b.peers_format  >= 2      -- fallback to format-only corroboration
        end
      )
  and coalesce(b.confidence, 0) >= 50

union all
-- adapt ----------------------------------------------------------
select
  b.post_id,
  'adapt'::content_recommendation_type          as type,
  'era_format_match'::text                      as reason_code,
  b.media_type,
  b.posted_at,
  b.performance_score,
  b.score_delta,
  b.saves_multiplier,
  b.shares_multiplier,
  b.era_index_saves,
  b.era_index_shares,
  b.primary_theme,
  b.format_pattern,
  b.replication_potential,
  b.format_sample_size,
  b.archive_year_sample_size,
  b.archive_coverage_pct,
  b.days_since_posted,
  b.confidence,
  b.signal_strength
from base b
where b.in_last_90d = true
  and b.performance_score between 45 and 64
  and (
        coalesce(b.era_index_saves,  0) >= 1.3
     or coalesce(b.era_index_shares, 0) >= 1.3
      )
  and coalesce(b.archive_year_sample_size, 0) >= 8
  and b.content_analysis_status = 'completed'
  -- Don't double-emit a post that's already a 'replicate' candidate.
  and not (
        b.in_last_30d = true
    and b.performance_score >= 65
    and b.score_delta       >= 15
    and b.format_sample_size >= 5
    and b.replication_potential in ('high', 'medium')
    and coalesce(b.saves_multiplier,  0) >= 1.5
    and coalesce(b.shares_multiplier, 0) >= 1.3
    and not (b.performance_score >= 95 and b.format_sample_size < 8)
  )
  and coalesce(b.confidence, 0) >= 50

union all
-- drop -----------------------------------------------------------
select
  b.post_id,
  'drop'::content_recommendation_type           as type,
  'recent_underperform'::text                   as reason_code,
  b.media_type,
  b.posted_at,
  b.performance_score,
  b.score_delta,
  b.saves_multiplier,
  b.shares_multiplier,
  b.era_index_saves,
  b.era_index_shares,
  b.primary_theme,
  b.format_pattern,
  b.replication_potential,
  b.format_sample_size,
  b.archive_year_sample_size,
  b.archive_coverage_pct,
  b.days_since_posted,
  b.confidence,
  b.signal_strength
from base b
where b.in_last_90d = true
  and b.performance_score   <= 30
  and b.score_delta         <= -15
  and b.format_sample_size  >= 5
  and b.days_since_posted between 30 and 90
  -- Early Performance Prediction guards
  and b.metric_days_count >=
      greatest(14, floor(least(coalesce(b.days_since_posted, 0), 30)::numeric * 0.5)::int)
  and b.last_metric_date is not null
  and b.last_metric_date >= ((now() at time zone 'UTC')::date - interval '7 days')
  and coalesce(b.saves_growth_pct_7d, 0) <= 5
  and coalesce(b.recent_surge_flag, false) = false
  and coalesce(b.confidence, 0) >= 50;

grant select on public.v_post_intelligence_candidates to authenticated, service_role;
