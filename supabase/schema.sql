create extension if not exists pgcrypto;

create table if not exists recommendations (
  id uuid primary key default gen_random_uuid(),
  restaurant text not null,
  restaurant_slug text not null,
  city text not null default 'Unsorted',
  city_slug text not null default 'unsorted',
  area text,
  address text,
  latitude double precision,
  longitude double precision,
  google_place_id text,
  google_maps_url text,
  location_status text not null default 'needs_lookup',
  location_confidence numeric not null default 0,
  dishes text[] not null default '{}',
  tags text[] not null default '{}',
  cuisine_summary text,
  note text,
  snippet text,
  source_name text,
  confidence numeric not null default 0.5,
  created_by text not null default 'importer',
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recommendation_sources (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references recommendations(id) on delete cascade,
  source_type text not null,
  source_hash text not null unique,
  source_date timestamptz,
  raw_ref_label text,
  created_at timestamptz not null default now()
);

create table if not exists import_batches (
  id uuid primary key default gen_random_uuid(),
  input_name text not null,
  input_hash text not null unique,
  model text,
  status text not null,
  parsed_message_count int not null default 0,
  candidate_count int not null default 0,
  inserted_count int not null default 0,
  merged_count int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists edit_events (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references recommendations(id) on delete cascade,
  editor_name text not null,
  action text not null,
  before_summary jsonb,
  after_summary jsonb,
  created_at timestamptz not null default now()
);

create table if not exists location_lookup_events (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid references recommendations(id) on delete cascade,
  query text not null,
  provider text not null,
  status text not null,
  selected_result_summary jsonb,
  created_at timestamptz not null default now()
);

create index if not exists recommendations_city_slug_idx on recommendations(city_slug);
create index if not exists recommendations_restaurant_slug_idx on recommendations(restaurant_slug);
create index if not exists recommendations_google_place_id_idx on recommendations(google_place_id);
create index if not exists recommendations_created_at_idx on recommendations(created_at desc);
create index if not exists recommendations_city_location_idx on recommendations(city_slug, latitude, longitude);
create index if not exists recommendation_sources_source_hash_idx on recommendation_sources(source_hash);

-- Auth / invites (see migrations/002_auth_invites_rls.sql for RLS policies)
create table if not exists invite_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  label text,
  max_uses int,
  uses_count int not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists contributors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  invite_code_id uuid references invite_codes(id),
  redeemed_at timestamptz not null default now()
);
