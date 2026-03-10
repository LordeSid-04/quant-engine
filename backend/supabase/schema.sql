begin;

create extension if not exists pgcrypto;

create table if not exists public.market_quotes_latest (
  symbol text primary key,
  date text not null,
  time text not null,
  open text not null,
  high text not null,
  low text not null,
  close text not null,
  volume text not null,
  source_provider text not null default 'unknown',
  source_symbol text not null default '',
  source_mode text not null default 'unknown',
  source_observed_at text not null default '',
  source_fetched_at text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.market_quotes_latest add column if not exists source_provider text not null default 'unknown';
alter table public.market_quotes_latest add column if not exists source_symbol text not null default '';
alter table public.market_quotes_latest add column if not exists source_mode text not null default 'unknown';
alter table public.market_quotes_latest add column if not exists source_observed_at text not null default '';
alter table public.market_quotes_latest add column if not exists source_fetched_at text not null default '';

create table if not exists public.risk_snapshots (
  id uuid primary key default gen_random_uuid(),
  as_of timestamptz not null default now(),
  payload jsonb not null
);

create table if not exists public.world_pulse_snapshots (
  id uuid primary key default gen_random_uuid(),
  as_of timestamptz not null default now(),
  payload jsonb not null
);

create table if not exists public.theme_snapshots (
  id uuid primary key default gen_random_uuid(),
  as_of timestamptz not null default now(),
  payload jsonb not null
);

create table if not exists public.theme_scores_timeseries (
  id uuid primary key default gen_random_uuid(),
  as_of timestamptz not null,
  theme_id text not null,
  theme_label text not null,
  temperature int not null,
  state text not null,
  mention_count int not null,
  source_diversity int not null,
  cross_region_spread int not null,
  market_reaction_score int not null,
  momentum double precision not null default 0,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.news_articles (
  id text primary key,
  published_at timestamptz not null,
  source text not null,
  title text not null,
  url text not null,
  summary text not null default '',
  region_tags text[] not null default '{}',
  asset_tags text[] not null default '{}',
  matched_theme_ids text[] not null default '{}',
  matched_keywords text[] not null default '{}',
  relevance_score double precision not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_brief_snapshots (
  id uuid primary key default gen_random_uuid(),
  as_of timestamptz not null default now(),
  payload jsonb not null
);

create table if not exists public.public_memory_entries (
  id text primary key,
  created_at timestamptz not null default now(),
  payload jsonb not null
);

create index if not exists idx_theme_scores_theme_asof
  on public.theme_scores_timeseries (theme_id, as_of);

create index if not exists idx_news_articles_published
  on public.news_articles (published_at desc);

create index if not exists idx_news_articles_matched_themes
  on public.news_articles using gin (matched_theme_ids);

create index if not exists idx_daily_brief_snapshots_asof
  on public.daily_brief_snapshots (as_of desc);

create index if not exists idx_public_memory_entries_created_at
  on public.public_memory_entries (created_at desc);

alter table public.market_quotes_latest enable row level security;
alter table public.risk_snapshots enable row level security;
alter table public.world_pulse_snapshots enable row level security;
alter table public.theme_snapshots enable row level security;
alter table public.theme_scores_timeseries enable row level security;
alter table public.news_articles enable row level security;
alter table public.daily_brief_snapshots enable row level security;
alter table public.public_memory_entries enable row level security;

drop policy if exists "allow_service_role_market_quotes" on public.market_quotes_latest;
create policy "allow_service_role_market_quotes"
on public.market_quotes_latest
for all
to service_role
using (true)
with check (true);

drop policy if exists "allow_service_role_risk_snapshots" on public.risk_snapshots;
create policy "allow_service_role_risk_snapshots"
on public.risk_snapshots
for all
to service_role
using (true)
with check (true);

drop policy if exists "allow_service_role_world_pulse" on public.world_pulse_snapshots;
create policy "allow_service_role_world_pulse"
on public.world_pulse_snapshots
for all
to service_role
using (true)
with check (true);

drop policy if exists "allow_service_role_theme_snapshots" on public.theme_snapshots;
create policy "allow_service_role_theme_snapshots"
on public.theme_snapshots
for all
to service_role
using (true)
with check (true);

drop policy if exists "allow_service_role_theme_scores" on public.theme_scores_timeseries;
create policy "allow_service_role_theme_scores"
on public.theme_scores_timeseries
for all
to service_role
using (true)
with check (true);

drop policy if exists "allow_service_role_news_articles" on public.news_articles;
create policy "allow_service_role_news_articles"
on public.news_articles
for all
to service_role
using (true)
with check (true);

drop policy if exists "allow_service_role_daily_brief" on public.daily_brief_snapshots;
create policy "allow_service_role_daily_brief"
on public.daily_brief_snapshots
for all
to service_role
using (true)
with check (true);

drop policy if exists "allow_service_role_public_memory" on public.public_memory_entries;
create policy "allow_service_role_public_memory"
on public.public_memory_entries
for all
to service_role
using (true)
with check (true);

commit;
