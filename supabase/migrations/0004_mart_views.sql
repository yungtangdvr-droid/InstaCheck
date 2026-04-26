-- ============================================================
-- Creator Hub — Migration 0004 : dbt mart exposure (Sprint 3+)
-- ============================================================
-- dbt writes the analytics marts into the `marts` schema. We do NOT
-- expose that schema to PostgREST (it would leak internal shape +
-- force every app call site to prefix .schema('marts')). Instead,
-- thin `public.v_mart_*` views forward `select *` from each mart so
-- the app keeps its existing `Database['public']` typing posture and
-- gets a stable surface that survives mart-internal refactors.
--
-- Access model: authenticated-only (single-tenant operator). anon
-- role stays blocked even if RLS is ever toggled off on the base
-- tables. The marts schema itself gets usage so the views can
-- resolve their underlying references.
--
-- OPERATIONAL CONTRACT — REAPPLY AFTER EVERY dbt RUN.
-- dbt materializes marts as `table` (per dbt_project.yml). Every
-- `dbt run` drops and recreates the underlying mart tables, which
-- cascades and drops these views. This file is intentionally fully
-- idempotent (`drop view if exists` + `create view`) so it can be
-- reapplied on every refresh without state. The wiring lives in
-- infrastructure/n8n/scoring-refresh.json — its `dbt-run` node now
-- chains `&& psql -f .../0004_mart_views.sql` so Analytics never
-- sees a 60-second outage between mart rebuild and view recreation.
-- Any new dbt invocation path (manual `dbt run`, future workflow,
-- etc.) MUST also reapply this file or Analytics will 404.
--
-- LOCAL-DB GUARD (added 2026-04-26).
-- Each `public.v_mart_*` view forwards `select * from marts.<table>`,
-- so it can only be created when dbt has already materialized the
-- underlying mart. On a fresh local Supabase (`db reset`) dbt has
-- never run, the `marts.mart_*` tables do not exist, and a bare
-- `create view … as select * from marts.mart_*` would abort this
-- migration in transaction — blocking 0005 (the Supabase-only
-- bootstrap that recreates these views directly from public.*) and
-- every later migration. We therefore wrap each create/grant pair
-- in a `do $$ … end $$;` that no-ops when the source mart is
-- missing. End-state is unchanged: in production where the marts
-- already exist, this still creates the forwarder views; on fresh
-- local, 0005 takes over and creates the bootstrap views from
-- public.* a few statements later.

create schema if not exists marts;
grant usage on schema marts to authenticated, service_role;

-- Views are recreated (drop + create) rather than `create or replace`
-- because `replace` blocks column-shape changes from dbt. Running this
-- migration in order on a fresh schema and on a live DB both work.

drop view if exists public.v_mart_post_performance;
drop view if exists public.v_mart_format_performance;
drop view if exists public.v_mart_theme_performance;
drop view if exists public.v_mart_best_posting_windows;

do $$
begin
  if to_regclass('marts.mart_post_performance') is not null then
    execute 'create view public.v_mart_post_performance as
             select * from marts.mart_post_performance';
    execute 'grant select on public.v_mart_post_performance to authenticated, service_role';
  end if;
end $$;

do $$
begin
  if to_regclass('marts.mart_format_performance') is not null then
    execute 'create view public.v_mart_format_performance as
             select * from marts.mart_format_performance';
    execute 'grant select on public.v_mart_format_performance to authenticated, service_role';
  end if;
end $$;

do $$
begin
  if to_regclass('marts.mart_theme_performance') is not null then
    execute 'create view public.v_mart_theme_performance as
             select * from marts.mart_theme_performance';
    execute 'grant select on public.v_mart_theme_performance to authenticated, service_role';
  end if;
end $$;

do $$
begin
  if to_regclass('marts.mart_best_posting_windows') is not null then
    execute 'create view public.v_mart_best_posting_windows as
             select * from marts.mart_best_posting_windows';
    execute 'grant select on public.v_mart_best_posting_windows to authenticated, service_role';
  end if;
end $$;
