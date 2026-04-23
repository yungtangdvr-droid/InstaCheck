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

create schema if not exists marts;
grant usage on schema marts to authenticated, service_role;

-- Views are recreated (drop + create) rather than `create or replace`
-- because `replace` blocks column-shape changes from dbt. Running this
-- migration in order on a fresh schema and on a live DB both work.

drop view if exists public.v_mart_post_performance;
drop view if exists public.v_mart_format_performance;
drop view if exists public.v_mart_theme_performance;
drop view if exists public.v_mart_best_posting_windows;

create view public.v_mart_post_performance as
  select * from marts.mart_post_performance;

create view public.v_mart_format_performance as
  select * from marts.mart_format_performance;

create view public.v_mart_theme_performance as
  select * from marts.mart_theme_performance;

create view public.v_mart_best_posting_windows as
  select * from marts.mart_best_posting_windows;

grant select on public.v_mart_post_performance      to authenticated, service_role;
grant select on public.v_mart_format_performance    to authenticated, service_role;
grant select on public.v_mart_theme_performance     to authenticated, service_role;
grant select on public.v_mart_best_posting_windows  to authenticated, service_role;
