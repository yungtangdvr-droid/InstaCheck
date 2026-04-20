-- ============================================================
-- Creator Hub — Migration initiale
-- Sprint 0 — Toutes les tables MVP
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

create type brand_status as enum ('cold', 'warm', 'intro', 'active');
create type company_type as enum ('brand', 'agency');
create type touchpoint_type as enum ('email', 'dm', 'call', 'meeting', 'other');
create type deal_stage as enum (
  'target_identified',
  'outreach_drafted',
  'outreach_sent',
  'opened',
  'replied',
  'concept_shared',
  'negotiation',
  'verbal_yes',
  'won',
  'lost',
  'dormant'
);
create type asset_type as enum ('creator_deck', 'case_study', 'concept', 'proposal', 'media_kit', 'pitch');
create type asset_event_type as enum ('opened', 'completed', 'clicked');
create type task_status as enum ('todo', 'done', 'snoozed');
create type automation_status as enum ('success', 'failed', 'skipped');
create type content_recommendation_type as enum ('replicate', 'adapt', 'drop');
create type media_type as enum ('IMAGE', 'VIDEO', 'CAROUSEL_ALBUM');

-- ============================================================
-- TABLES RAW (ingestion brute)
-- ============================================================

create table raw_instagram_account_daily (
  id            uuid primary key default gen_random_uuid(),
  account_id    text not null,
  date          date not null,
  followers_count integer not null default 0,
  reach         integer not null default 0,
  impressions   integer not null default 0,
  synced_at     timestamptz not null default now(),
  unique (account_id, date)
);

create table raw_instagram_media (
  id            uuid primary key default gen_random_uuid(),
  media_id      text not null unique,
  account_id    text not null,
  media_type    media_type not null,
  caption       text,
  permalink     text not null,
  timestamp     timestamptz not null,
  raw_json      jsonb not null default '{}'
);

create table raw_instagram_media_insights (
  id            uuid primary key default gen_random_uuid(),
  media_id      text not null,
  metric_name   text not null,
  value         bigint not null default 0,
  period        text not null,
  synced_at     timestamptz not null default now(),
  unique (media_id, metric_name, period)
);

create table raw_papermark_events (
  id            uuid primary key default gen_random_uuid(),
  event_id      text not null unique,
  asset_id      text not null,
  event_type    text not null,
  viewer_id     text not null,
  duration_ms   integer,
  occurred_at   timestamptz not null
);

create table raw_umami_events (
  id            uuid primary key default gen_random_uuid(),
  event_id      text not null unique,
  session_id    text not null,
  url           text not null,
  event_name    text not null,
  referrer      text,
  occurred_at   timestamptz not null
);

create table raw_watchlist_events (
  id            uuid primary key default gen_random_uuid(),
  url           text not null,
  change_summary text not null,
  detected_at   timestamptz not null default now()
);

-- ============================================================
-- TABLES MÉTIER CORE
-- ============================================================

-- Compte Instagram
create table accounts (
  id            uuid primary key default gen_random_uuid(),
  instagram_id  text not null unique,
  username      text not null,
  avatar_url    text,
  created_at    timestamptz not null default now()
);

-- Contenu
create table posts (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  media_id      text not null unique,
  media_type    media_type not null,
  caption       text,
  permalink     text not null,
  posted_at     timestamptz not null
);

create table post_metrics_daily (
  id              uuid primary key default gen_random_uuid(),
  post_id         uuid not null references posts(id) on delete cascade,
  date            date not null,
  reach           integer not null default 0,
  impressions     integer not null default 0,
  saves           integer not null default 0,
  shares          integer not null default 0,
  likes           integer not null default 0,
  comments        integer not null default 0,
  profile_visits  integer not null default 0,
  follower_delta  integer not null default 0,
  unique (post_id, date)
);

create table post_tags (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references posts(id) on delete cascade,
  tag         text not null,
  created_at  timestamptz not null default now(),
  unique (post_id, tag)
);

create table content_themes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  tags        text[] not null default '{}'
);

create table content_recommendations (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references posts(id) on delete cascade,
  type        content_recommendation_type not null,
  reason      text not null,
  created_at  timestamptz not null default now()
);

-- CRM
create table brands (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  website              text,
  country              text,
  category             text,
  premium_level        text,
  aesthetic_fit_score  integer check (aesthetic_fit_score between 0 and 100),
  business_fit_score   integer check (business_fit_score between 0 and 100),
  status               brand_status not null default 'cold',
  notes                text,
  created_at           timestamptz not null default now()
);

create table agencies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  website     text,
  country     text,
  notes       text,
  created_at  timestamptz not null default now()
);

create table contacts (
  id                uuid primary key default gen_random_uuid(),
  full_name         text not null,
  email             text,
  title             text,
  company_id        uuid,
  company_type      company_type,
  linkedin_url      text,
  instagram_handle  text,
  warmness          integer not null default 0 check (warmness between 0 and 100),
  last_contact_at   timestamptz,
  next_follow_up_at timestamptz,
  notes             text
);

create table brand_contacts (
  brand_id    uuid not null references brands(id) on delete cascade,
  contact_id  uuid not null references contacts(id) on delete cascade,
  primary key (brand_id, contact_id)
);

create table touchpoints (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references contacts(id) on delete cascade,
  brand_id    uuid references brands(id) on delete set null,
  type        touchpoint_type not null,
  note        text,
  occurred_at timestamptz not null default now()
);

-- Deals
create table assets (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  type                asset_type not null,
  papermark_link_id   text,
  papermark_link_url  text,
  created_at          timestamptz not null default now()
);

create table opportunities (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  brand_id          uuid references brands(id) on delete set null,
  contact_id        uuid references contacts(id) on delete set null,
  collab_type       text,
  estimated_value   numeric(12,2),
  currency          text not null default 'EUR',
  stage             deal_stage not null default 'target_identified',
  probability       integer not null default 0 check (probability between 0 and 100),
  expected_close_at date,
  last_activity_at  timestamptz,
  next_action       text,
  deck_id           uuid references assets(id) on delete set null
);

create table opportunity_stage_history (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references opportunities(id) on delete cascade,
  stage           deal_stage not null,
  changed_at      timestamptz not null default now()
);

create table asset_events (
  id                  uuid primary key default gen_random_uuid(),
  asset_id            uuid not null references assets(id) on delete cascade,
  event_type          asset_event_type not null,
  viewer_fingerprint  text,
  duration_ms         integer,
  occurred_at         timestamptz not null default now()
);

-- Tâches
create table tasks (
  id                      uuid primary key default gen_random_uuid(),
  label                   text not null,
  status                  task_status not null default 'todo',
  due_at                  timestamptz,
  linked_brand_id         uuid references brands(id) on delete set null,
  linked_opportunity_id   uuid references opportunities(id) on delete set null,
  linked_contact_id       uuid references contacts(id) on delete set null,
  created_at              timestamptz not null default now()
);

-- Automations
create table automation_runs (
  id               uuid primary key default gen_random_uuid(),
  automation_name  text not null,
  status           automation_status not null,
  result_summary   text,
  ran_at           timestamptz not null default now()
);

create table weekly_summaries (
  id            uuid primary key default gen_random_uuid(),
  week_start    date not null unique,
  reach_delta   integer not null default 0,
  saves_delta   integer not null default 0,
  new_leads     integer not null default 0,
  deals_moved   integer not null default 0,
  deck_opens    integer not null default 0,
  created_at    timestamptz not null default now()
);

-- Veille
create table brand_watchlists (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references brands(id) on delete cascade,
  url           text not null,
  label         text,
  last_change_at timestamptz,
  active        boolean not null default true
);

-- ============================================================
-- INDEX
-- ============================================================

create index on raw_instagram_account_daily (account_id, date desc);
create index on raw_instagram_media (account_id);
create index on raw_instagram_media_insights (media_id);
create index on posts (account_id, posted_at desc);
create index on post_metrics_daily (post_id, date desc);
create index on post_tags (post_id);
create index on touchpoints (contact_id, occurred_at desc);
create index on touchpoints (brand_id);
create index on opportunities (brand_id, stage);
create index on opportunity_stage_history (opportunity_id, changed_at desc);
create index on asset_events (asset_id, occurred_at desc);
create index on tasks (status, due_at);
create index on automation_runs (automation_name, ran_at desc);
create index on brand_watchlists (brand_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- RLS activé — single user, toutes les opérations autorisées
-- pour le rôle authenticated.
-- ============================================================

alter table accounts              enable row level security;
alter table posts                 enable row level security;
alter table post_metrics_daily    enable row level security;
alter table post_tags             enable row level security;
alter table content_themes        enable row level security;
alter table content_recommendations enable row level security;
alter table brands                enable row level security;
alter table agencies              enable row level security;
alter table contacts              enable row level security;
alter table brand_contacts        enable row level security;
alter table touchpoints           enable row level security;
alter table opportunities         enable row level security;
alter table opportunity_stage_history enable row level security;
alter table assets                enable row level security;
alter table asset_events          enable row level security;
alter table tasks                 enable row level security;
alter table automation_runs       enable row level security;
alter table weekly_summaries      enable row level security;
alter table brand_watchlists      enable row level security;
alter table raw_instagram_account_daily enable row level security;
alter table raw_instagram_media   enable row level security;
alter table raw_instagram_media_insights enable row level security;
alter table raw_papermark_events  enable row level security;
alter table raw_umami_events      enable row level security;
alter table raw_watchlist_events  enable row level security;

-- Politique universelle authenticated → accès total (solo user)
do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'posts', 'post_metrics_daily', 'post_tags',
    'content_themes', 'content_recommendations',
    'brands', 'agencies', 'contacts', 'brand_contacts', 'touchpoints',
    'opportunities', 'opportunity_stage_history',
    'assets', 'asset_events', 'tasks',
    'automation_runs', 'weekly_summaries', 'brand_watchlists',
    'raw_instagram_account_daily', 'raw_instagram_media',
    'raw_instagram_media_insights', 'raw_papermark_events',
    'raw_umami_events', 'raw_watchlist_events'
  ]
  loop
    execute format(
      'create policy "authenticated_full_access" on %I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;
