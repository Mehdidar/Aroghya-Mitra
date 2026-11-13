-- =============================================================================
-- 3002: the ASHA sync store in the database instead of files on the server,
-- so the server can run hosted (Supabase Edge Function, any container) without
-- a disk. One row per synced record; the server reads and writes it with the
-- service-role key. No client role can reach it.
-- =============================================================================
create table if not exists public.asha_sync_store (
  collection  text not null check (collection in ('patients', 'visits', 'alerts', 'referrals')),
  id          text not null,
  record      jsonb not null,
  received_at timestamptz not null,
  primary key (collection, id)
);
create index if not exists asha_sync_store_received on public.asha_sync_store (collection, received_at);

alter table public.asha_sync_store enable row level security;
-- No policies on purpose: only the service role (the server) reads or writes this table.
revoke all on public.asha_sync_store from anon, authenticated;
