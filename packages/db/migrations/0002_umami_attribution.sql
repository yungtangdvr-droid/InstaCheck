-- ============================================================
-- Creator Hub — Migration 0002 : Umami + Attribution
-- Sprint 7 — traffic sources → opportunities / brands / assets
-- ============================================================

-- Enums ------------------------------------------------------

create type attribution_match_type  as enum ('url_pattern', 'utm_source', 'referrer', 'asset_link_url');
create type attribution_target_type as enum ('opportunity', 'brand', 'asset');

-- Explicit attribution rules --------------------------------

create table attribution_rules (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  match_type  attribution_match_type  not null,
  pattern     text not null,
  target_type attribution_target_type not null,
  target_id   uuid not null,
  priority    integer not null default 100,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index on attribution_rules (active, priority desc);
create index on attribution_rules (target_type, target_id);

-- Resolved attribution events -------------------------------

create table attribution_events (
  id             uuid primary key default gen_random_uuid(),
  raw_event_id   uuid not null references raw_umami_events(id) on delete cascade,
  rule_id        uuid references attribution_rules(id) on delete set null,
  opportunity_id uuid references opportunities(id) on delete set null,
  brand_id       uuid references brands(id)        on delete set null,
  asset_id       uuid references assets(id)        on delete set null,
  matched_by     attribution_match_type not null,
  url            text not null,
  referrer       text,
  event_name     text,
  occurred_at    timestamptz not null,
  -- Canonical single-winner model: at most one attribution per raw event.
  unique (raw_event_id)
);

create index on attribution_events (opportunity_id, occurred_at desc);
create index on attribution_events (brand_id,        occurred_at desc);
create index on attribution_events (asset_id,        occurred_at desc);
create index on attribution_events (occurred_at desc);

-- RLS -------------------------------------------------------

alter table attribution_rules  enable row level security;
alter table attribution_events enable row level security;

create policy "authenticated_full_access" on attribution_rules
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on attribution_events
  for all to authenticated using (true) with check (true);
