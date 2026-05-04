-- ============================================================
-- Creator Hub — Migration 0015 : Archive baseline views (V1)
-- ============================================================
-- Two read-only baseline aggregates for the Archive Pattern Library:
--
--   * public.v_archive_baseline_year_format
--   * public.v_archive_baseline_era_format
--
-- Purpose
-- -------
-- The archive review queue (`/content-lab/archive/review`) computes an
-- era-normalized index per post — each post's latest metric divided by
-- the mean of comparable archive posts (same year + same media_type,
-- with same era + same media_type as a fallback). Until now that
-- baseline was hydrated per-request in JS via N+M Supabase round-trips
-- against `posts` and `post_metrics_daily`, which both:
--   1. capped each cell at BASELINE_PER_*_BUCKET_LIMIT = 500 rows, so
--      "comparable archive" was a bounded sample rather than the full
--      eligible archive, and
--   2. fanned out a chunked `.in('post_id', …)` over the union of the
--      candidate window AND the baseline universe, multiplying request
--      cost as more historical buckets entered the page.
--
-- These views move that aggregation into the database, computed over
-- the *full imported archive*. The consumer then issues two flat
-- selects filtered to the (year, media_type) and (era, media_type)
-- pairs actually present in the candidate window.
--
-- Baseline gate (deliberate)
-- --------------------------
-- The baseline includes every row with
--   post_archive_state.metadata_status = 'imported'
-- regardless of human_review_status. Approving or rejecting a post in
-- the review queue must NOT remove it from the historical comparison
-- baseline — the whole archive is the reference, not just the
-- still-pending tail of it.
--
-- Candidate gate (unchanged, in app code)
-- ---------------------------------------
-- The review-queue page itself still filters candidate rows by
-- metadata_status = 'imported' AND human_review_status = 'pending'.
-- That is the queue gate, not the baseline gate.
--
-- Latest-metric definition
-- ------------------------
-- For each post, the "latest metric" is the row from
-- post_metrics_daily with the highest `date`. This mirrors the JS
-- pick at archive-review-queue.ts (`order by date desc, first one
-- wins per post_id`). `distinct on (post_id)` makes ties deterministic.
--
-- Era buckets
-- -----------
-- Mirror exactly the ERA_YEAR_RANGE constants in
-- apps/web/lib/meta/queries/archive-review-queue.ts:
--   pre_2019    : year <= 2018
--   2019_2020   : year 2019..2020
--   2021_2022   : year 2021..2022
--   2023_2024   : year 2023..2024
--   2025_plus   : year >= 2025
-- If those constants are ever changed, the CASE below MUST be updated
-- in lockstep or app + DB drift silently.
--
-- Year basis
-- ----------
-- Year is extracted from `posts.posted_at` in UTC, matching `yearOfIso`
-- in the JS (which uses `getUTCFullYear`). Do NOT switch to
-- Europe/Paris here: era cut-points are calendar-year buckets the
-- operator reasons about in UTC alongside the Meta API timestamps.
--
-- Security
-- --------
-- Postgres views default to running with the *creator's* privileges
-- (security_definer-ish behavior — they bypass RLS on underlying
-- tables for the table owner). We declare these views WITH
-- (security_invoker = true) — Postgres 15+ — so RLS on `posts`,
-- `post_archive_state`, and `post_metrics_daily` is evaluated as the
-- caller. This keeps the existing single-tenant `authenticated_full
-- _access` policies authoritative and prevents the views from
-- accidentally widening access.
--
-- Lifecycle
-- ---------
-- These are non-materialised views. No refresh job is required. If
-- production read volume becomes a concern, the bodies can be
-- promoted to materialised views (with a refresh hook on the existing
-- `scoring-refresh` n8n workflow) without changing the column
-- contract — the consumer reads `select … from <view>` either way.
--
-- Rollback (no down-migration convention in this repo)
-- ----------------------------------------------------
--   drop view if exists public.v_archive_baseline_year_format;
--   drop view if exists public.v_archive_baseline_era_format;
--
-- No data is moved; rollback is metadata-only.

drop view if exists public.v_archive_baseline_year_format cascade;
drop view if exists public.v_archive_baseline_era_format  cascade;

-- Helper CTE shared shape (inlined into each view body so the views
-- stay independent and individually droppable):
--
--   imported_posts : posts ⋈ post_archive_state on metadata_status='imported'
--   latest_metrics : distinct on (post_id) … from post_metrics_daily
--                    order by post_id, date desc
--   joined         : imported_posts ⋈ latest_metrics, with derived
--                    `year` (UTC) and `era`.

create view public.v_archive_baseline_year_format
  with (security_invoker = true)
  as
with imported_posts as (
  select
    p.id          as post_id,
    p.media_type,
    p.posted_at
  from public.posts p
  join public.post_archive_state s on s.post_id = p.id
  where s.metadata_status = 'imported'
),
latest_metrics as (
  select distinct on (m.post_id)
    m.post_id,
    m.date,
    m.likes,
    m.comments,
    m.saves,
    m.shares,
    m.profile_visits
  from public.post_metrics_daily m
  order by m.post_id, m.date desc
),
joined as (
  select
    ip.post_id,
    ip.media_type,
    extract(year from ip.posted_at at time zone 'UTC')::int as year,
    lm.likes,
    lm.comments,
    lm.saves,
    lm.shares,
    lm.profile_visits
  from imported_posts ip
  left join latest_metrics lm on lm.post_id = ip.post_id
)
select
  year,
  media_type,
  count(*) filter (
    where coalesce(saves, shares, comments, likes, profile_visits) is not null
  )::int                                                  as sample_size,
  count(saves)::int                                       as count_saves,
  count(shares)::int                                      as count_shares,
  count(comments)::int                                    as count_comments,
  count(likes)::int                                       as count_likes,
  count(profile_visits)::int                              as count_profile_visits,
  avg(saves)::numeric                                     as mean_saves,
  avg(shares)::numeric                                    as mean_shares,
  avg(comments)::numeric                                  as mean_comments,
  avg(likes)::numeric                                     as mean_likes,
  avg(profile_visits)::numeric                            as mean_profile_visits
from joined
where year is not null
group by year, media_type;

create view public.v_archive_baseline_era_format
  with (security_invoker = true)
  as
with imported_posts as (
  select
    p.id          as post_id,
    p.media_type,
    p.posted_at
  from public.posts p
  join public.post_archive_state s on s.post_id = p.id
  where s.metadata_status = 'imported'
),
latest_metrics as (
  select distinct on (m.post_id)
    m.post_id,
    m.date,
    m.likes,
    m.comments,
    m.saves,
    m.shares,
    m.profile_visits
  from public.post_metrics_daily m
  order by m.post_id, m.date desc
),
joined as (
  select
    ip.post_id,
    ip.media_type,
    case
      when extract(year from ip.posted_at at time zone 'UTC')::int <= 2018 then 'pre_2019'
      when extract(year from ip.posted_at at time zone 'UTC')::int <= 2020 then '2019_2020'
      when extract(year from ip.posted_at at time zone 'UTC')::int <= 2022 then '2021_2022'
      when extract(year from ip.posted_at at time zone 'UTC')::int <= 2024 then '2023_2024'
      else '2025_plus'
    end                                                   as era,
    lm.likes,
    lm.comments,
    lm.saves,
    lm.shares,
    lm.profile_visits
  from imported_posts ip
  left join latest_metrics lm on lm.post_id = ip.post_id
)
select
  era,
  media_type,
  count(*) filter (
    where coalesce(saves, shares, comments, likes, profile_visits) is not null
  )::int                                                  as sample_size,
  count(saves)::int                                       as count_saves,
  count(shares)::int                                      as count_shares,
  count(comments)::int                                    as count_comments,
  count(likes)::int                                       as count_likes,
  count(profile_visits)::int                              as count_profile_visits,
  avg(saves)::numeric                                     as mean_saves,
  avg(shares)::numeric                                    as mean_shares,
  avg(comments)::numeric                                  as mean_comments,
  avg(likes)::numeric                                     as mean_likes,
  avg(profile_visits)::numeric                            as mean_profile_visits
from joined
group by era, media_type;

-- Grants — authenticated-only surface, mirrors the v_mart_* pattern in
-- migration 0005. With security_invoker = true these grants only let
-- the role *attempt* to read; the underlying RLS on posts /
-- post_archive_state / post_metrics_daily still applies.
grant select on public.v_archive_baseline_year_format to authenticated, service_role;
grant select on public.v_archive_baseline_era_format  to authenticated, service_role;
