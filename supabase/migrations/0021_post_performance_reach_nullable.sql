-- ============================================================
-- Creator Hub — Migration 0021 : nullable total_reach in
--                                 v_mart_post_performance
-- ============================================================
-- Problem (2026-05-18):
-- The bootstrap view (migration 0005) wraps total_reach in
-- `coalesce(m.total_reach, 0)`. When Meta has not yet returned a
-- reach insight for a very recent post — common when saves/shares
-- land before reach — sum(reach) is NULL and the coalesce flattens
-- it to 0. The chronological feed then shows "reach = 0" next to
-- real saves/shares, indistinguishable from a genuine zero-reach
-- post.
--
-- Fix:
-- Drop the coalesce on total_reach ONLY, so an unknown reach stays
-- NULL through the analytics surface. Every TypeScript reader
-- already guards with `?? 0`, so their behaviour is unchanged; the
-- chronological feed is updated separately to render "—".
--
-- Scope / invariants:
--   * Scored metrics (saves / shares / comments / likes /
--     profile_visits) stay coalesced — they feed the performance
--     score and a NULL would break the ratio arithmetic. The
--     scoring formula is NOT touched.
--   * total_reach is not an input to the score, so making it
--     nullable is numerically inert for performance_score.
--   * Downstream views (format / theme / posting-windows) aggregate
--     total_reach with sum()/avg(), which ignore NULLs — an unknown
--     reach is simply excluded rather than counted as 0.
--   * Column name, type (numeric) and ordinal position are
--     unchanged, so `create or replace view` succeeds without
--     dropping the dependent v_mart_* views.
--   * Archive backfill behaviour is untouched.

create or replace view public.v_mart_post_performance as
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
    -- total_reach intentionally NOT coalesced: a NULL means "Meta has
    -- not returned a reach insight yet", which the UI surfaces as "—".
    m.total_reach::numeric                                        as total_reach,
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

grant select on public.v_mart_post_performance to authenticated, service_role;
