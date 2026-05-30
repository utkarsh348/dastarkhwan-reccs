-- Invite codes (store hashes only)
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

alter table recommendations enable row level security;
alter table recommendation_sources enable row level security;
alter table import_batches enable row level security;
alter table edit_events enable row level security;
alter table location_lookup_events enable row level security;
alter table invite_codes enable row level security;
alter table contributors enable row level security;

-- Public read for the notebook
create policy recommendations_public_read on recommendations
  for select to anon, authenticated using (true);

create policy recommendation_sources_public_read on recommendation_sources
  for select to anon, authenticated using (true);

create policy edit_events_public_read on edit_events
  for select to anon, authenticated using (true);

-- Contributors may insert/update recommendations
create policy recommendations_contributor_insert on recommendations
  for insert to authenticated
  with check (exists (select 1 from contributors c where c.user_id = auth.uid()));

create policy recommendations_contributor_update on recommendations
  for update to authenticated
  using (exists (select 1 from contributors c where c.user_id = auth.uid()))
  with check (exists (select 1 from contributors c where c.user_id = auth.uid()));

create policy recommendation_sources_contributor_insert on recommendation_sources
  for insert to authenticated
  with check (exists (select 1 from contributors c where c.user_id = auth.uid()));

create policy edit_events_contributor_insert on edit_events
  for insert to authenticated
  with check (exists (select 1 from contributors c where c.user_id = auth.uid()));

-- Contributors can read their own row
create policy contributors_read_own on contributors
  for select to authenticated using (user_id = auth.uid());

-- No direct client access to invite_codes
create policy invite_codes_deny_all on invite_codes
  for all to anon, authenticated using (false) with check (false);
