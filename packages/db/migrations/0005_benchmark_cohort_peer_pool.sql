-- ============================================================
-- Creator Hub — packages/db Migration 0005 : Benchmark cohort
-- peer-pool correction
-- ============================================================
-- IMPORTANT — numbering drift notice:
-- This file is numbered 0005 (next valid for packages/db) while
-- the matching Supabase migration is numbered 0008. The drift
-- is pre-existing (see packages/db/migrations/0004_benchmark_
-- foundation.sql header). Body below is identical to
-- supabase/migrations/0008_benchmark_cohort_peer_pool.sql.
--
-- See that file for the full doctrine notes (peer-pool taxonomy,
-- empty-table guard, NOT NULL preservation).

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
