-- ============================================================
-- Creator Hub — Migration 0008 : Benchmark cohort peer-pool
-- correction
-- ============================================================
-- PR 3a: schema-only correction. Replaces the content-category
-- enum introduced in 0007 (meme/lifestyle/fashion/...) with the
-- peer-pool taxonomy required by the benchmark doctrine. Future
-- peer-percentile logic must be able to exclude `aspirational`
-- accounts; the previous enum encoded a different axis (content
-- topic) and could not express that distinction safely.
--
-- New `benchmark_cohort` values:
--   core_peer            — direct comparable peers
--   adjacent_culture     — adjacent meme/culture accounts
--   french_francophone   — francophone scope reference
--   aspirational         — out-of-pool reference; excluded from
--                          peer percentile computations
--
-- Safety: there is no defensible automatic mapping from a content
-- category (meme, lifestyle, ...) to a peer-pool cohort. PR 2 was
-- schema-only and PR 3 persistence is not yet authored, so the
-- canonical pipeline has not written any rows. The DO-block below
-- aborts the migration loudly if any developer hand-inserted rows
-- into benchmark_accounts. Recovery: empty the table (or write a
-- backfill mapping) and re-run.
--
-- Numbering note (drift): packages/db/migrations is one number
-- behind because the mart_views (0004, 0005) and post_content_
-- analysis (0006) migrations were only mirrored into supabase/
-- migrations. The matching mirror for THIS file lives at
-- packages/db/migrations/0005_benchmark_cohort_peer_pool.sql and
-- is body-identical.

do $$
begin
  if exists (select 1 from benchmark_accounts) then
    raise exception
      'PR3a aborted: benchmark_accounts is not empty (% rows). '
      'There is no automatic mapping from the old category enum '
      '(meme/lifestyle/...) to the peer-pool enum '
      '(core_peer/adjacent_culture/french_francophone/aspirational). '
      'Empty the table or write a backfill mapping before re-running.',
      (select count(*) from benchmark_accounts);
  end if;
end$$;

-- Detach the column from the old type so the type can be dropped.
alter table benchmark_accounts
  alter column cohort type text using cohort::text;

drop type benchmark_cohort;

create type benchmark_cohort as enum (
  'core_peer',
  'adjacent_culture',
  'french_francophone',
  'aspirational'
);

-- Re-attach. The cast only succeeds because the table is empty;
-- the DO-block above guarantees that. NOT NULL is preserved by
-- ALTER COLUMN TYPE; the cohort btree index is rebuilt
-- automatically.
alter table benchmark_accounts
  alter column cohort type benchmark_cohort using cohort::benchmark_cohort;
