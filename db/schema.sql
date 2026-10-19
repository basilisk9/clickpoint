-- Clickpoint schema (Supabase / Postgres).
--
-- Replaces the old DATA_DIR filesystem store. A free host such as Vercel has
-- no persistent disk, so guest + pathway records live here instead. Run this
-- once in the Supabase SQL editor (or `psql -f db/schema.sql`).

create table if not exists guests (
  id text primary key,
  created_at timestamptz not null default now(),
  -- Rolling 24h rate limit: when this guest last *started* a generation.
  last_pathway_at timestamptz,
  -- Legacy mirror of the pathways table, kept because GuestRecord carries it.
  -- listPathwaysForGuest() queries the pathways table directly rather than
  -- trusting this array, so drift here can never hide a pathway.
  pathway_ids text[] not null default '{}'
);

create table if not exists pathways (
  id text primary key,
  guest_id text not null references guests(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'generating',
  xp integer not null default 0,
  -- Cross-process claim for the background fill job, held as a *lease* rather
  -- than a boolean: the holder records when its claim expires, so a run killed
  -- by maxDuration / a deploy / a crash does not deadlock the row forever.
  -- NULL means free to claim. Replaces the old in-process Set, which cannot
  -- work on serverless (every invocation is a fresh process).
  filling_until timestamptz,
  -- The whole PathwayRecord. The extracted columns above exist only so the
  -- library list can be built without parsing every blob.
  data jsonb not null
);

create index if not exists pathways_guest_created_idx
  on pathways (guest_id, created_at desc);
