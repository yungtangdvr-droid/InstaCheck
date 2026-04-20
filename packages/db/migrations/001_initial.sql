-- ============================================================
-- Creator Hub — Migration 001 : Schéma initial complet
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- TABLES RAW (ingestion brute)
-- ============================================================

create table if not exists raw_instagram_account_daily (
  id              uuid primary key default gen_random_uuid(),
  account_id      text not null,
  date            date not null,
  followers_count integer,
  reach           integer,
  impressions     integer,
  synced_at       timestamptz not null default now(),
  unique (account_id, date)
);

create table if not exists raw_instagram_media (
  id          uuid primary key default gen_random_uuid(),
  media_id    text not null unique,
  account_id  text not null,
  media_type  text,
  caption     text,
  permalink   text,
  timestamp   timestamptz,
  raw_json    jsonb,
  synced_at   timestamptz not null default now()
);

create table if not exists raw_instagram_media_insights (
  id          uuid primary key default gen_random_uuid(),
  media_id    text not null,
  metric_name text not null,
  value       bigint,
  period      text,
  synced_at   timestamptz not null default now(),
  unique (media_id, metric_name, period)
);

create table if not exists raw_papermark_events (
  id          uuid primary key default gen_random_uuid(),
  event_id    text not null unique,
  asset_id    text not null,
  event_type  text not null,
  viewer_id   text,
  duration_ms integer,
  occurred_at timestamptz not null
);

create table if not exists raw_umami_events (
  id          uuid primary key default gen_random_uuid(),
  event_id    text not null unique,
  session_id  text,
  url         text,
  event_name  text,
  referrer    text,
  occurred_at timestamptz not null
);

create table if not exists raw_watchlist_events (
  id              uuid primary key default gen_random_uuid(),
  url             text not null,
  change_summary  text,
  detected_at     timestamptz not null
);

-- ============================================================
-- TABLES MÉTIER — Compte
-- ============================================================

create table if not exists accounts (
  id             uuid primary key default gen_random_uuid(),
  instagram_id   text not null unique,
  username       text not null,
  avatar_url     text,
  created_at     timestamptz not null default now()
);

-- ============================================================
-- TABLES MÉTIER — Contenu
-- ============================================================

create table if not exists posts (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  media_id    text not null unique,
  media_type  text not null,
  caption     text,
  permalink   text,
  posted_at   timestamptz
);

create table if not exists post_metrics_daily (
  id               uuid primary key default gen_random_uuid(),
  post_id          uuid not null references posts(id) on delete cascade,
  date             date not null,
  reach            integer default 0,
  impressions      integer default 0,
  saves            integer default 0,
  shares           integer default 0,
  likes            integer default 0,
  comments         integer default 0,
  profile_visits   integer default 0,
  follower_delta   integer default 0,
  unique (post_id, date)
);

create table if not exists post_tags (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references posts(id) on delete cascade,
  tag        text not null,
  created_at timestamptz not null default now(),
  unique (post_id, tag)
);

create table if not exists content_themes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  tags        text[] default '{}'
);

create table if not exists content_recommendations (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid references posts(id) on delete set null,
  type       text not null check (type in ('replicate','adapt','drop')),
  reason     text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- TABLES MÉTIER — CRM
-- ============================================================

create table if not exists brands (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  website             text,
  country             text,
  category            text,
  premium_level       integer default 0 check (premium_level between 0 and 5),
  aesthetic_fit_score integer default 0 check (aesthetic_fit_score between 0 and 20),
  business_fit_score  integer default 0 check (business_fit_score between 0 and 20),
  status              text not null default 'cold' check (status in ('cold','warm','intro','active')),
  notes               text,
  created_at          timestamptz not null default now()
);

create table if not exists agencies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  website    text,
  country    text,
  notes      text,
  created_at timestamptz not null default now()
);

create table if not exists contacts (
  id                uuid primary key default gen_random_uuid(),
  full_name         text not null,
  email             text,
  title             text,
  company_id        uuid,
  company_type      text check (company_type in ('brand','agency')),
  linkedin_url      text,
  instagram_handle  text,
  warmness          integer default 0 check (warmness between 0 and 5),
  last_contact_at   timestamptz,
  next_follow_up_at timestamptz,
  notes             text
);

create table if not exists brand_contacts (
  brand_id   uuid not null references brands(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  primary key (brand_id, contact_id)
);

create table if not exists touchpoints (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid references contacts(id) on delete set null,
  brand_id    uuid references brands(id) on delete set null,
  type        text not null check (type in ('email','dm','call','meeting','other')),
  note        text,
  occurred_at timestamptz not null default now()
);

-- ============================================================
-- TABLES MÉTIER — Deals
-- ============================================================

create table if not exists assets (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  type                text not null check (type in ('creator_deck','case_study','concept','proposal','media_kit','pitch')),
  papermark_link_id   text,
  papermark_link_url  text,
  created_at          timestamptz not null default now()
);

create table if not exists opportunities (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  brand_id          uuid references brands(id) on delete set null,
  contact_id        uuid references contacts(id) on delete set null,
  collab_type       text,
  estimated_value   numeric(10,2),
  currency          text default 'EUR',
  stage             text not null default 'target_identified' check (stage in (
    'target_identified','outreach_drafted','outreach_sent','opened',
    'replied','concept_shared','negotiation','verbal_yes','won','lost','dormant'
  )),
  probability       integer default 0 check (probability between 0 and 100),
  expected_close_at date,
  last_activity_at  timestamptz default now(),
  next_action       text,
  deck_id           uuid references assets(id) on delete set null
);

create table if not exists opportunity_stage_history (
  id               uuid primary key default gen_random_uuid(),
  opportunity_id   uuid not null references opportunities(id) on delete cascade,
  stage            text not null,
  changed_at       timestamptz not null default now()
);

create table if not exists asset_events (
  id                  uuid primary key default gen_random_uuid(),
  asset_id            uuid not null references assets(id) on delete cascade,
  event_type          text not null check (event_type in ('opened','completed','clicked')),
  viewer_fingerprint  text,
  duration_ms         integer,
  occurred_at         timestamptz not null
);

-- ============================================================
-- TABLES MÉTIER — Tâches
-- ============================================================

create table if not exists tasks (
  id                     uuid primary key default gen_random_uuid(),
  label                  text not null,
  status                 text not null default 'todo' check (status in ('todo','done','snoozed')),
  due_at                 timestamptz,
  linked_brand_id        uuid references brands(id) on delete set null,
  linked_opportunity_id  uuid references opportunities(id) on delete set null,
  linked_contact_id      uuid references contacts(id) on delete set null,
  created_at             timestamptz not null default now()
);

-- ============================================================
-- TABLES MÉTIER — Automations & Veille
-- ============================================================

create table if not exists automation_runs (
  id               uuid primary key default gen_random_uuid(),
  automation_name  text not null,
  status           text not null check (status in ('success','failed','skipped')),
  result_summary   text,
  ran_at           timestamptz not null default now()
);

create table if not exists weekly_summaries (
  id             uuid primary key default gen_random_uuid(),
  week_start     date not null unique,
  reach_delta    integer default 0,
  saves_delta    integer default 0,
  new_leads      integer default 0,
  deals_moved    integer default 0,
  deck_opens     integer default 0,
  created_at     timestamptz not null default now()
);

create table if not exists brand_watchlists (
  id             uuid primary key default gen_random_uuid(),
  brand_id       uuid references brands(id) on delete cascade,
  url            text not null,
  label          text,
  last_change_at timestamptz,
  active         boolean not null default true
);

-- ============================================================
-- INDEX
-- ============================================================

create index if not exists idx_raw_ig_media_account on raw_instagram_media(account_id);
create index if not exists idx_raw_ig_insights_media on raw_instagram_media_insights(media_id);
create index if not exists idx_posts_account on posts(account_id);
create index if not exists idx_post_metrics_post on post_metrics_daily(post_id);
create index if not exists idx_post_metrics_date on post_metrics_daily(date desc);
create index if not exists idx_brands_status on brands(status);
create index if not exists idx_opportunities_stage on opportunities(stage);
create index if not exists idx_opportunities_brand on opportunities(brand_id);
create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_tasks_due on tasks(due_at);
create index if not exists idx_automation_runs_name on automation_runs(automation_name, ran_at desc);
