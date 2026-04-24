-- ============================================================
-- Creator Hub — Migration 0005 : Supabase-only mart bootstrap
-- ============================================================
-- PRODUCTION BOOTSTRAP. READ THIS FIRST.
--
-- Context (2026-04-24):
-- Instagram ingestion is live in production (accounts, posts,
-- post_metrics_daily all populate correctly). The analytics marts
-- are not: `marts.mart_*` are empty because dbt / the n8n
-- `scoring-refresh` workflow have no production host yet, and
-- therefore migration 0004 — which forwards `public.v_mart_*`
-- from `marts.*` — cannot materialize a useful surface.
--
-- This migration is the smallest safe workaround: it redefines
-- `public.v_mart_*` directly on top of `public.posts`,
-- `public.post_metrics_daily`, `public.post_tags`, and
-- `public.content_themes`, so the Analytics Dashboard and Content
-- Lab can read real (if simpler) data today without waiting for
-- dbt infrastructure.
--
-- Lifecycle:
--   * Keep this migration applied until the production dbt runner
--     is operational and `marts.mart_*` tables are being refreshed
--     on a schedule.
--   * When dbt is live again, either (a) revert this migration and
--     re-apply 0004, or (b) replace the bodies below with
--     `select * from marts.<table>` forwards. The column contract
--     in 0004 and here is intentionally identical so either path
--     is a drop-in swap — the app query surface does not change.
--
-- Non-goals / invariants:
--   * The `marts` schema and the dbt SQL files under
--     `infrastructure/dbt/` are NOT touched. They remain the
--     long-term source of truth.
--   * The app code path (`v_mart_*` view names, column names,
--     filters like `.eq('period_days', N)` and `.eq('in_last_30d',
--     true)`) is preserved exactly. No app changes are required.
--   * Frozen modules (CRM / deals / assets / attribution /
--     automations / brand-watch / calcom) are not referenced.
--
-- Access model: authenticated-only, same as 0004.
-- Idempotency: fully idempotent — `drop view if exists` then
-- `create view` so reruns are safe. Drops use CASCADE in case an
-- earlier partial 0004 left `public.v_mart_*` views pointing at
-- non-existent `marts.*` tables.

drop view if exists public.v_mart_post_performance      cascade;
drop view if exists public.v_mart_format_performance    cascade;
drop view if exists public.v_mart_theme_performance     cascade;
drop view if exists public.v_mart_best_posting_windows  cascade;

-- ------------------------------------------------------------
-- v_mart_post_performance
-- ------------------------------------------------------------
-- Grain: one row per public.posts.id.
-- Scoring: weighted-sum of per-metric ratios vs. per-format 30d
-- baseline, clamped to [0, 100]. Weights mirror
-- packages/scoring/index.ts / infrastructure/dbt/models/marts/
-- mart_post_performance.sql (saves 0.35, shares 0.30, comments
-- 0.15, likes 0.10, profile_visits 0.10) so the bootstrap stays
-- numerically compatible with the dbt mart it temporarily replaces.
-- Timezone: Europe/Paris for posted_at_local / posted_dow /
-- posted_hour (operator TZ — do not change without coordinating
-- with FormatMatrix / BestWindowHeatmap).

create view public.v_mart_post_performance as
with metrics as (
  select
    m.post_id,
    sum(m.reach)::numeric           as total_reach,
    sum(m.impressions)::numeric     as total_impressions,
    sum(m.saves)::numeric           as total_saves,
    sum(m.shares)::numeric          as total_shares,
    sum(m.likes)::numeric           as total_likes,
    sum(m.comments)::numeric        as total_comments,
    sum(m.profile_visits)::numeric  as total_profile_visits
  from public.post_metrics_daily m
  group by m.post_id
),
post_tag_array as (
  select
    post_id,
    array_agg(distinct lower(btrim(tag)) order by lower(btrim(tag))) as tags
  from public.post_tags
  where tag is not null and btrim(tag) <> ''
  group by post_id
),
post_theme_array as (
  select
    pt.post_id,
    array_agg(distinct ct.name order by ct.name) as theme_names
  from public.post_tags pt
  join public.content_themes ct
    on lower(btrim(pt.tag)) = any(
      array(select lower(btrim(t)) from unnest(ct.tags) t
            where t is not null and btrim(t) <> '')
    )
  group by pt.post_id
),
joined as (
  select
    p.id                                                          as post_id,
    p.account_id,
    p.media_id,
    p.media_type::text                                            as media_type,
    p.caption,
    p.permalink,
    p.posted_at,
    (p.posted_at at time zone 'Europe/Paris')                     as posted_at_local,
    (p.posted_at at time zone 'Europe/Paris')::date               as posted_date_local,
    extract(isodow from p.posted_at at time zone 'Europe/Paris')::int as posted_dow,
    extract(hour   from p.posted_at at time zone 'Europe/Paris')::int as posted_hour,
    (p.posted_at >= now() - interval '7 days')                    as in_last_7d,
    (p.posted_at >= now() - interval '30 days')                   as in_last_30d,
    (p.posted_at >= now() - interval '90 days')                   as in_last_90d,
    coalesce(tg.tags,        array[]::text[])                     as tags,
    coalesce(th.theme_names, array[]::text[])                     as theme_names,
    coalesce(m.total_reach,           0)::numeric                 as total_reach,
    coalesce(m.total_impressions,     0)::numeric                 as total_impressions,
    coalesce(m.total_saves,           0)::numeric                 as total_saves,
    coalesce(m.total_shares,          0)::numeric                 as total_shares,
    coalesce(m.total_likes,           0)::numeric                 as total_likes,
    coalesce(m.total_comments,        0)::numeric                 as total_comments,
    coalesce(m.total_profile_visits,  0)::numeric                 as total_profile_visits
  from public.posts p
  left join metrics          m  on m.post_id  = p.id
  left join post_tag_array   tg on tg.post_id = p.id
  left join post_theme_array th on th.post_id = p.id
),
baseline_agg as (
  select
    media_type,
    sum(total_saves)          as sum_saves,
    sum(total_shares)         as sum_shares,
    sum(total_comments)       as sum_comments,
    sum(total_likes)          as sum_likes,
    sum(total_profile_visits) as sum_profile_visits,
    count(*)                  as sample_size
  from joined
  where in_last_30d
  group by media_type
),
scored as (
  select
    j.*,
    case
      when j.in_last_30d and b.sample_size > 1
        then (b.sum_saves - j.total_saves) / (b.sample_size - 1)::numeric
      when coalesce(b.sample_size, 0) > 0
        then b.sum_saves / b.sample_size::numeric
      else null
    end as baseline_saves,
    case
      when j.in_last_30d and b.sample_size > 1
        then (b.sum_shares - j.total_shares) / (b.sample_size - 1)::numeric
      when coalesce(b.sample_size, 0) > 0
        then b.sum_shares / b.sample_size::numeric
      else null
    end as baseline_shares,
    case
      when j.in_last_30d and b.sample_size > 1
        then (b.sum_comments - j.total_comments) / (b.sample_size - 1)::numeric
      when coalesce(b.sample_size, 0) > 0
        then b.sum_comments / b.sample_size::numeric
      else null
    end as baseline_comments,
    case
      when j.in_last_30d and b.sample_size > 1
        then (b.sum_likes - j.total_likes) / (b.sample_size - 1)::numeric
      when coalesce(b.sample_size, 0) > 0
        then b.sum_likes / b.sample_size::numeric
      else null
    end as baseline_likes,
    case
      when j.in_last_30d and b.sample_size > 1
        then (b.sum_profile_visits - j.total_profile_visits) / (b.sample_size - 1)::numeric
      when coalesce(b.sample_size, 0) > 0
        then b.sum_profile_visits / b.sample_size::numeric
      else null
    end as baseline_profile_visits,
    coalesce(b.sample_size, 0) as format_sample_size
  from joined j
  left join baseline_agg b on b.media_type = j.media_type
),
ratio_scored as (
  select
    s.*,
    0.35 * case when coalesce(s.baseline_saves,          0) > 0 then least(s.total_saves          / s.baseline_saves,          2) else 0 end +
    0.30 * case when coalesce(s.baseline_shares,         0) > 0 then least(s.total_shares         / s.baseline_shares,         2) else 0 end +
    0.15 * case when coalesce(s.baseline_comments,       0) > 0 then least(s.total_comments       / s.baseline_comments,       2) else 0 end +
    0.10 * case when coalesce(s.baseline_likes,          0) > 0 then least(s.total_likes          / s.baseline_likes,          2) else 0 end +
    0.10 * case when coalesce(s.baseline_profile_visits, 0) > 0 then least(s.total_profile_visits / s.baseline_profile_visits, 2) else 0 end
      as raw_score
  from scored s
)
select
  post_id,
  account_id,
  media_id,
  media_type,
  caption,
  permalink,
  posted_at,
  posted_at_local,
  posted_date_local,
  posted_dow,
  posted_hour,
  in_last_7d,
  in_last_30d,
  in_last_90d,
  tags,
  theme_names,
  total_reach,
  total_impressions,
  total_saves,
  total_shares,
  total_likes,
  total_comments,
  total_profile_visits,
  baseline_saves,
  baseline_shares,
  baseline_comments,
  baseline_likes,
  baseline_profile_visits,
  format_sample_size,
  round(greatest(0, least(1, raw_score)) * 100)::int            as performance_score,
  50::int                                                       as baseline_score,
  (round(greatest(0, least(1, raw_score)) * 100)::int - 50)     as score_delta
from ratio_scored;

-- ------------------------------------------------------------
-- v_mart_format_performance
-- ------------------------------------------------------------
-- Grain: (media_type, period_days) for period_days in (7, 30, 90).
-- Sourced from v_mart_post_performance so the bootstrap shares one
-- score definition with the post-grain surface above.

create view public.v_mart_format_performance as
with periods as (
  select 7  as period_days
  union all select 30
  union all select 90
),
posts_in_period as (
  select
    pp.media_type,
    p.period_days,
    pp.post_id,
    pp.total_reach,
    pp.total_saves,
    pp.total_shares,
    pp.total_likes,
    pp.total_comments,
    pp.total_profile_visits,
    pp.performance_score,
    pp.baseline_score
  from public.v_mart_post_performance pp
  cross join periods p
  where (p.period_days =  7 and pp.in_last_7d)
     or (p.period_days = 30 and pp.in_last_30d)
     or (p.period_days = 90 and pp.in_last_90d)
),
aggregated as (
  select
    media_type,
    period_days,
    count(*)                                  as post_count,
    sum(total_reach)                          as total_reach,
    sum(total_saves)                          as total_saves,
    sum(total_shares)                         as total_shares,
    sum(total_likes)                          as total_likes,
    sum(total_comments)                       as total_comments,
    sum(total_profile_visits)                 as total_profile_visits,
    round(avg(total_reach))::int              as avg_reach_per_post,
    round(avg(total_saves))::int              as avg_saves_per_post,
    round(avg(total_shares))::int             as avg_shares_per_post,
    round(avg(total_likes))::int              as avg_likes_per_post,
    round(avg(total_comments))::int           as avg_comments_per_post,
    round(avg(total_profile_visits))::int     as avg_profile_visits_per_post,
    round(avg(performance_score))::int        as avg_score,
    max(baseline_score)::int                  as baseline_score
  from posts_in_period
  group by media_type, period_days
),
top_per_format as (
  select distinct on (media_type, period_days)
    media_type,
    period_days,
    post_id            as top_post_id,
    performance_score  as top_post_score
  from posts_in_period
  order by media_type, period_days, performance_score desc, post_id
)
select
  a.media_type,
  a.period_days,
  a.post_count,
  a.total_reach,
  a.total_saves,
  a.total_shares,
  a.total_likes,
  a.total_comments,
  a.total_profile_visits,
  a.avg_reach_per_post,
  a.avg_saves_per_post,
  a.avg_shares_per_post,
  a.avg_likes_per_post,
  a.avg_comments_per_post,
  a.avg_profile_visits_per_post,
  a.avg_score,
  a.baseline_score,
  t.top_post_id,
  t.top_post_score
from aggregated a
left join top_per_format t
  on t.media_type = a.media_type and t.period_days = a.period_days;

-- ------------------------------------------------------------
-- v_mart_theme_performance
-- ------------------------------------------------------------
-- Grain: (theme_name, period_days).
-- theme_name = content_themes.name if any theme's tags[] contains
-- the post tag, else the raw tag (unthemed fallback). If a post has
-- no tags at all it contributes no rows here — ThemePerformanceTable
-- already handles the empty-data case with a "tag your posts" prompt.
-- low_sample_flag / sample_size_confidence mirror the dbt mart.

create view public.v_mart_theme_performance as
with tag_rows as (
  select
    pt.post_id,
    lower(btrim(pt.tag))                      as tag,
    ct.id                                     as theme_id,
    coalesce(ct.name, lower(btrim(pt.tag)))   as theme_key,
    (ct.id is not null)                       as is_mapped_theme
  from public.post_tags pt
  left join public.content_themes ct
    on lower(btrim(pt.tag)) = any(
      array(select lower(btrim(t)) from unnest(ct.tags) t
            where t is not null and btrim(t) <> '')
    )
  where pt.tag is not null and btrim(pt.tag) <> ''
),
distinct_post_theme as (
  select distinct post_id, theme_id, theme_key, is_mapped_theme
  from tag_rows
),
periods as (
  select 7  as period_days
  union all select 30
  union all select 90
),
posts_in_period as (
  select
    dpt.theme_id,
    dpt.theme_key,
    dpt.is_mapped_theme,
    p.period_days,
    pp.post_id,
    pp.posted_at,
    pp.total_reach,
    pp.total_saves,
    pp.total_shares,
    pp.total_likes,
    pp.total_comments,
    pp.performance_score,
    pp.baseline_score
  from distinct_post_theme dpt
  join public.v_mart_post_performance pp on pp.post_id = dpt.post_id
  cross join periods p
  where (p.period_days =  7 and pp.in_last_7d)
     or (p.period_days = 30 and pp.in_last_30d)
     or (p.period_days = 90 and pp.in_last_90d)
),
aggregated as (
  select
    theme_key,
    theme_id,
    bool_or(is_mapped_theme)             as is_mapped_theme,
    period_days,
    count(*)                             as post_count,
    sum(total_saves)                     as total_saves,
    sum(total_reach)                     as total_reach,
    sum(total_shares)                    as total_shares,
    sum(total_likes)                     as total_likes,
    sum(total_comments)                  as total_comments,
    round(avg(total_saves))::int         as avg_saves_per_post,
    round(avg(total_reach))::int         as avg_reach_per_post,
    round(avg(performance_score))::int   as avg_score,
    max(baseline_score)::int             as baseline_score,
    max(posted_at)                       as last_posted_at
  from posts_in_period
  group by theme_key, theme_id, period_days
),
top_per_theme as (
  select distinct on (theme_key, period_days)
    theme_key,
    period_days,
    post_id            as top_post_id,
    performance_score  as top_post_score
  from posts_in_period
  order by theme_key, period_days, performance_score desc, post_id
)
select
  a.theme_key                                              as theme_name,
  a.theme_id,
  a.is_mapped_theme,
  a.period_days,
  a.post_count,
  a.total_saves,
  a.total_reach,
  a.total_shares,
  a.total_likes,
  a.total_comments,
  a.avg_saves_per_post,
  a.avg_reach_per_post,
  a.avg_score,
  a.baseline_score,
  a.last_posted_at,
  t.top_post_id,
  t.top_post_score,
  (a.post_count < 3)                                       as low_sample_flag,
  least(1.0, a.post_count / 3.0)::numeric(4,3)             as sample_size_confidence
from aggregated a
left join top_per_theme t
  on t.theme_key = a.theme_key and t.period_days = a.period_days;

-- ------------------------------------------------------------
-- v_mart_best_posting_windows
-- ------------------------------------------------------------
-- Grain: (period_days, day_of_week, hour, media_type) where
--   day_of_week ∈ 1..7 ISO (1 = Monday … 7 = Sunday) Europe/Paris
--   media_type  = NULL for the "all formats" rollup row (getPostingWindows
--                 filters `.is('media_type', null)` on this rollup).
-- sample_confidence = post_count / total_posts_in_(period, media_type).

create view public.v_mart_best_posting_windows as
with periods as (
  select 7  as period_days
  union all select 30
  union all select 90
),
posts_in_period as (
  select
    pp.post_id,
    pp.media_type,
    pp.posted_dow,
    pp.posted_hour,
    pp.total_reach,
    pp.total_saves,
    pp.performance_score,
    p.period_days
  from public.v_mart_post_performance pp
  cross join periods p
  where (p.period_days =  7 and pp.in_last_7d)
     or (p.period_days = 30 and pp.in_last_30d)
     or (p.period_days = 90 and pp.in_last_90d)
),
per_format as (
  select
    period_days,
    posted_dow                              as day_of_week,
    posted_hour                             as hour,
    media_type::text                        as media_type,
    count(*)                                as post_count,
    round(avg(total_saves))::int            as avg_saves,
    round(avg(total_reach))::int            as avg_reach,
    round(avg(performance_score))::int      as avg_score
  from posts_in_period
  group by period_days, posted_dow, posted_hour, media_type
),
all_formats as (
  select
    period_days,
    posted_dow                              as day_of_week,
    posted_hour                             as hour,
    null::text                              as media_type,
    count(*)                                as post_count,
    round(avg(total_saves))::int            as avg_saves,
    round(avg(total_reach))::int            as avg_reach,
    round(avg(performance_score))::int      as avg_score
  from posts_in_period
  group by period_days, posted_dow, posted_hour
),
all_rows as (
  select * from per_format
  union all
  select * from all_formats
),
denominators as (
  select
    period_days,
    media_type::text as media_type,
    count(*) as total_posts
  from posts_in_period
  group by grouping sets ((period_days, media_type), (period_days))
)
select
  r.period_days,
  r.day_of_week,
  r.hour,
  r.media_type,
  r.post_count,
  r.avg_saves,
  r.avg_reach,
  r.avg_score,
  case
    when d.total_posts is null or d.total_posts = 0 then 0
    else round((r.post_count::numeric / d.total_posts), 3)
  end                                       as sample_confidence,
  (r.post_count < 2)                        as low_sample_flag
from all_rows r
left join denominators d
  on d.period_days = r.period_days
  and d.media_type is not distinct from r.media_type;

-- ------------------------------------------------------------
-- Grants (authenticated-only surface, matches 0004)
-- ------------------------------------------------------------
grant select on public.v_mart_post_performance      to authenticated, service_role;
grant select on public.v_mart_format_performance    to authenticated, service_role;
grant select on public.v_mart_theme_performance     to authenticated, service_role;
grant select on public.v_mart_best_posting_windows  to authenticated, service_role;
