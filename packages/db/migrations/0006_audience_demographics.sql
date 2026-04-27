-- ============================================================
-- Creator Hub — Migration 0009 : Audience demographics
-- ============================================================
-- PR5: persist Instagram `follower_demographics` insight rows
-- so the /audience page can replace its hardcoded "non
-- synchronisées" empty state with a real read across four
-- breakdowns: country, city, age, gender.
--
-- The Meta endpoint requires the `instagram_manage_insights`
-- permission. When that scope is missing, the sync still
-- completes and writes one sentinel row per breakdown with
-- threshold_state='unavailable' and a reason. The UI surfaces
-- that string verbatim. PR5 does not perform app review or
-- token reauth.
--
-- Timeframe: PR5 wires `last_30_days` only, but the column is
-- in the unique key so future timeframes (last_14_days,
-- last_90_days, this_month, …) can coexist without collision.
--
-- Sentinel: rows that do not represent a real demographic key
-- use `key='__meta_unavailable__'`. Meta does not emit that
-- string; safe reserved value.
--
-- Numbering note: packages/db/migrations is offset by three
-- because mart_views (0004, 0005) and post_content_analysis
-- (0006) were only mirrored into supabase/migrations. The
-- matching mirror for THIS file lives at
-- supabase/migrations/0009_audience_demographics.sql and
-- is body-identical.

create table raw_instagram_audience_demographics (
  id              uuid primary key default gen_random_uuid(),
  account_id      text not null,
  date            date not null,
  timeframe       text not null,
  breakdown       text not null check (breakdown in ('country','city','age','gender')),
  key             text not null,
  label           text,
  value           bigint not null default 0,
  threshold_state text not null check (threshold_state in ('available','available_below_threshold','unavailable')),
  fetched_via     text not null default 'graph_api',
  reason          text,
  raw_json        jsonb not null default '{}'::jsonb,
  synced_at       timestamptz not null default now(),
  unique (account_id, date, timeframe, breakdown, key)
);

create index on raw_instagram_audience_demographics
  (account_id, timeframe, breakdown, date desc);

alter table raw_instagram_audience_demographics enable row level security;

create policy "authenticated_full_access"
  on raw_instagram_audience_demographics
  for all to authenticated
  using (true) with check (true);
