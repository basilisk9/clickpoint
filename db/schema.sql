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

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/*                                                                     */
/* A user owns exactly ONE guest row (users.guest_id). That row is      */
/* where every pathway they generate lives, so signing in on a second  */
/* device resolves to the same guest id — and therefore the same       */
/* library — without copying a single row.                             */
/*                                                                     */
/* Apply these with `psql -f db/schema.sql`. They are all idempotent,  */
/* and lib/auth.ts also runs them on first use, so local dev works     */
/* without a manual migration step.                                    */
/* ------------------------------------------------------------------ */

create table if not exists users (
  id text primary key,
  -- Stored lowercased; the unique index below is the real guard.
  username text not null,
  -- scrypt output. Hash and salt are separate columns so the salt is
  -- never mixed into the digest blob.
  password_hash text not null,
  password_salt text not null,
  guest_id text not null references guests(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Case-insensitive uniqueness: normalizeUsername() lowercases on write, and
-- this index stops any caller that forgets from creating "Bob" + "bob".
create unique index if not exists users_username_key on users (lower(username));

-- One account per guest row. Without this, two accounts could point at the
-- same guest and see each other's pathways.
create unique index if not exists users_guest_key on users (guest_id);

/* Sessions. Only the SHA-256 of the token is stored: a leaked dump cannot be
   replayed as a login, the same reason password hashes are never the password. */
create table if not exists sessions (
  token_hash text primary key,
  user_id text not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists sessions_user_idx on sessions (user_id);

-- Which account (if any) owns a guest row. NULL = anonymous visitor.
alter table guests add column if not exists user_id text;

create unique index if not exists guests_user_idx
  on guests (user_id) where user_id is not null;

/* ------------------------------------------------------------------ */
/* Quota                                                               */
/*                                                                     */
/* One row per pathway STARTED, appended before any LLM work begins.    */
/* The gate used to read guests.last_pathway_at, a single timestamp     */
/* that can only express "one per window"; the rule is now N per        */
/* rolling 24h, so the count has to come from rows. Appending is also   */
/* race-free in a way a read-modify-write of the guest record is not:   */
/* two concurrent generations can never lose or double a stamp.         */
/*                                                                     */
/* guests.last_pathway_at is left in place as a legacy mirror (like     */
/* pathway_ids) so old rows stay readable; nothing reads it any more.   */
/* ------------------------------------------------------------------ */

create table if not exists pathway_starts (
  id text primary key,
  guest_id text not null references guests(id) on delete cascade,
  started_at timestamptz not null default now()
);

create index if not exists pathway_starts_guest_idx
  on pathway_starts (guest_id, started_at desc);

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/*                                                                     */
/* In-app reports, read straight from the Supabase SQL editor — the     */
/* smallest thing that can answer "what is wrong with the output", and  */
/* the only failure signal the app had before this was console.warn.    */
/*                                                                     */
/* pathway_id / node_id are set when the report is anchored to a card   */
/* or a checkpoint, which is what makes it actionable: a report that    */
/* knows which node it is about can be checked against the generator's  */
/* own output. They are plain text, not foreign keys, so a report        */
/* outlives the pathway it describes.                                   */
/* ------------------------------------------------------------------ */

create table if not exists feedback (
  id text primary key,
  -- Nullable: a report is kept even if the guest row is ever removed.
  guest_id text references guests(id) on delete set null,
  -- Account at report time, when there was one.
  user_id text,
  pathway_id text,
  node_id text,
  kind text not null default 'general',
  body text not null,
  page_url text,
  created_at timestamptz not null default now()
);

create index if not exists feedback_created_idx on feedback (created_at desc);
create index if not exists feedback_guest_idx on feedback (guest_id, created_at desc);
