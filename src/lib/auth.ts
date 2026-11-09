import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "crypto";
import { cookies } from "next/headers";
import { promisify } from "util";
import { createId } from "./ids";
import { getDbPool } from "./store";

/* ------------------------------------------------------------------ */
/* Accounts: sign up, sign in, sessions.                               */
/*                                                                     */
/* DESIGN: an account is a thin wrapper around ONE guest row. Every    */
/* pathway already hangs off `guest_id`, and every route already       */
/* resolves data through getOrCreateGuest()/requireGuest(). So the     */
/* account only has to say "this browser is guest X" and all the       */
/* existing pages — library, path, quiz, complete — start seeing the   */
/* account's whole history. No route needed rewriting, and "synced     */
/* across devices" is true by construction rather than by copying.     */
/* ------------------------------------------------------------------ */

export const SESSION_COOKIE = "clickpoint_session";

/* 30 days: long enough that the app never feels like it logs you out, short
   enough that a stolen laptop's cookie eventually stops working. */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export const MIN_USERNAME = 3;
export const MAX_USERNAME = 24;
export const MIN_PASSWORD = 8;
/* scrypt hashes 64 bytes; the cap is purely to stop a huge body from turning
   into minutes of CPU on the login endpoint. */
const MAX_PASSWORD = 200;

/* 64-byte digest = 512 bits, the natural output size for scrypt. */
const KEY_LENGTH = 64;

const scryptAsync = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

export type AuthUser = {
  id: string;
  username: string;
  guestId: string;
};

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/*                                                                     */
/* db/schema.sql is the documented migration. This mirror exists so a  */
/* fresh clone works without a manual psql step: the DDL is entirely   */
/* idempotent (IF NOT EXISTS everywhere), and it is memoized per       */
/* process, so the cost is one round trip on the first auth call of a  */
/* cold start and zero afterwards.                                     */
/* ------------------------------------------------------------------ */

const AUTH_SCHEMA = `
create table if not exists users (
  id text primary key,
  username text not null,
  password_hash text not null,
  password_salt text not null,
  guest_id text not null references guests(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists users_username_key on users (lower(username));
create unique index if not exists users_guest_key on users (guest_id);

create table if not exists sessions (
  token_hash text primary key,
  user_id text not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists sessions_user_idx on sessions (user_id);

alter table guests add column if not exists user_id text;

create unique index if not exists guests_user_idx
  on guests (user_id) where user_id is not null;
`;

/* Cached on globalThis like the pool, so dev hot-reloads do not re-run DDL.
   A rejected promise is cleared so the next request retries instead of the
   process remembering the failure forever. */
const globalForAuth = globalThis as unknown as {
  clickpointAuthSchema?: Promise<void>;
};

function ensureAuthSchema(): Promise<void> {
  if (!globalForAuth.clickpointAuthSchema) {
    globalForAuth.clickpointAuthSchema = getDbPool()
      .query(AUTH_SCHEMA)
      .then(() => undefined)
      .catch((error) => {
        globalForAuth.clickpointAuthSchema = undefined;
        throw error;
      });
  }
  return globalForAuth.clickpointAuthSchema;
}

/* ------------------------------------------------------------------ */
/* Credentials                                                         */
/* ------------------------------------------------------------------ */

/* Usernames are case-insensitive: "Bob" and "bob" must not become two
   accounts, so one canonical form is stored and compared. */
export function normalizeUsername(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

/* Returns a human sentence on the first problem, or null when valid. Kept free
   of any database access so it stays cheap to call on every request. */
export function validateCredentials(
  username: string,
  password: string,
): string | null {
  if (!username) return "Pick a username.";
  if (username.length < MIN_USERNAME || username.length > MAX_USERNAME) {
    return `Username must be ${MIN_USERNAME}–${MAX_USERNAME} characters.`;
  }
  if (!/^[a-z0-9_.-]+$/.test(username)) {
    return "Username can only use letters, numbers, dots, dashes and underscores.";
  }
  if (password.length < MIN_PASSWORD) {
    return `Password must be at least ${MIN_PASSWORD} characters.`;
  }
  if (password.length > MAX_PASSWORD) {
    return `Password must be under ${MAX_PASSWORD} characters.`;
  }
  return null;
}

/* scrypt with Node's defaults (N=16384, r=8, p=1) — deliberately slow, which
   is the whole point: a leaked hash should be expensive to attack, and the
   per-user salt means one rainbow table cannot crack two accounts at once. */
export async function hashPassword(
  password: string,
): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  return { hash: derived.toString("hex"), salt };
}

/* timingSafeEqual so response time cannot leak how much of the hash matched.
   A malformed or legacy hash returns false rather than throwing, so one bad
   row cannot 500 the whole login endpoint. */
export async function verifyPassword(
  password: string,
  hash: string,
  salt: string,
): Promise<boolean> {
  try {
    if (!hash || !salt) return false;
    const expected = Buffer.from(hash, "hex");
    if (expected.length === 0) return false;
    const actual = await scryptAsync(password, salt, expected.length);
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function cookieOptions() {
  return {
    httpOnly: true,
    /* lax (not strict) so following a link from another site still arrives
       signed in, while cross-site POSTs stay blocked. */
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
    /* Omitted on http://localhost so local dev is not silently broken. */
    secure: process.env.NODE_ENV === "production",
  };
}

/* The raw token never touches the database — only its SHA-256 does, so a
   leaked dump cannot be replayed as a login. */
export async function createSession(userId: string): Promise<string> {
  await ensureAuthSchema();
  const token = randomBytes(32).toString("hex");
  await getDbPool().query(
    `insert into sessions (token_hash, user_id, expires_at)
     values ($1, $2, now() + make_interval(secs => $3))`,
    [sha256(token), userId, SESSION_MAX_AGE],
  );
  return token;
}

export async function destroySession(token: string): Promise<void> {
  await ensureAuthSchema();
  await getDbPool().query("delete from sessions where token_hash = $1", [
    sha256(token),
  ]);
}

export async function getSessionToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

/* Route-handler-only: Next forbids cookie writes while rendering a Server
   Component, so callers that might be rendering guard with try/catch. */
export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, cookieOptions());
}

export async function clearSessionCookie(): Promise<void> {
  try {
    const jar = await cookies();
    jar.delete(SESSION_COOKIE);
  } catch {
    // Nothing to clear if the jar is read-only in this context.
  }
}

/* The current account, or null for an anonymous visitor. Expiry is enforced
   by the query itself, so a stale row can never authenticate anyone. */
export async function getSessionUser(): Promise<AuthUser | null> {
  const token = await getSessionToken();
  if (!token) return null;

  await ensureAuthSchema();
  const { rows } = await getDbPool().query<{
    id: string;
    username: string;
    guest_id: string;
  }>(
    `select u.id, u.username, u.guest_id
       from sessions s
       join users u on u.id = s.user_id
      where s.token_hash = $1
        and s.expires_at > now()`,
    [sha256(token)],
  );

  const row = rows[0];
  if (!row) return null;
  return { id: row.id, username: row.username, guestId: row.guest_id };
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  password_salt: string;
  guest_id: string;
};

/* Returns the hash/salt too, because sign-in has to verify against them. No
   other caller should be handed this shape. */
export async function findUserByUsername(
  username: string,
): Promise<(AuthUser & { passwordHash: string; passwordSalt: string }) | null> {
  await ensureAuthSchema();
  const { rows } = await getDbPool().query<UserRow>(
    `select id, username, password_hash, password_salt, guest_id
       from users
      where lower(username) = lower($1)`,
    [username],
  );

  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    guestId: row.guest_id,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
  };
}

export type CreateUserInput = {
  username: string;
  passwordHash: string;
  passwordSalt: string;
  /* The guest row whose pathways become the account's library. */
  guestId: string;
};

/* Creates the account and stamps ownership onto its guest row in one place,
   so no caller can create a user without the matching guest link. */
export async function createUser(input: CreateUserInput): Promise<AuthUser> {
  await ensureAuthSchema();
  const pool = getDbPool();
  const id = createId("usr");

  const client = await pool.connect();
  try {
    await client.query("begin");

    await client.query(
      `insert into users (id, username, password_hash, password_salt, guest_id)
       values ($1, $2, $3, $4, $5)`,
      [id, input.username, input.passwordHash, input.passwordSalt, input.guestId],
    );

    /* Only an unclaimed guest can be adopted. If another account already owns
       it, the insert above has already failed on users_guest_key. */
    await client.query(
      `update guests set user_id = $2
        where id = $1 and (user_id is null or user_id = $2)`,
      [input.guestId, id],
    );

    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  return { id, username: input.username, guestId: input.guestId };
}

/* Postgres unique-violation. Turns a duplicate username into a friendly 409
   instead of a 500, and keeps the check race-free: two simultaneous signups
   cannot both win, because the index decides rather than a prior SELECT. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "23505"
  );
}

/* ------------------------------------------------------------------ */
/* Merging anonymous work into an account                              */
/* ------------------------------------------------------------------ */

/* Someone who generated pathways as a guest and only then signed in should
   find that work inside their account — otherwise signing in looks like data
   loss. Two guards keep this safe:

     1. A guest owned by a DIFFERENT account is never touched, so signing in
        on a shared machine cannot pull in someone else's pages.
     2. The UPDATE rewrites the JSON `guestId` alongside the column. Every
        ownership check (path/[id]/page.tsx and all the /api routes) compares
        `pathway.guestId` from the parsed JSON, so moving only the column
        would leave those pages 404ing on data the account does own. */
export async function mergeGuestIntoAccount(
  fromGuestId: string,
  intoGuestId: string,
): Promise<void> {
  if (fromGuestId === intoGuestId) return;
  await ensureAuthSchema();

  const pool = getDbPool();

  const { rows: ownerRows } = await pool.query<{ user_id: string | null }>(
    "select user_id from guests where id = $1",
    [fromGuestId],
  );
  /* Stale cookie pointing at a guest row that no longer exists. */
  if (ownerRows.length === 0) return;

  const { rows: targetRows } = await pool.query<{ id: string }>(
    "select id from users where guest_id = $1",
    [intoGuestId],
  );
  const targetUserId = targetRows[0]?.id;
  if (!targetUserId) return;

  const owner = ownerRows[0].user_id;
  if (owner && owner !== targetUserId) return;

  await pool.query(
    `update pathways
        set guest_id = $2,
            data = jsonb_set(data, '{guestId}', to_jsonb($2::text))
      where guest_id = $1`,
    [fromGuestId, intoGuestId],
  );

  /* Carry the daily-gate stamp across too, otherwise signing in would refund
     the "one pathway per day" limit the guest had already spent. */
  await pool.query(
    `update guests target
        set last_pathway_at = source.last_pathway_at
       from guests source
      where target.id = $2
        and source.id = $1
        and source.last_pathway_at is not null
        and (target.last_pathway_at is null
             or source.last_pathway_at > target.last_pathway_at)`,
    [fromGuestId, intoGuestId],
  );

  /* The source guest row itself stays behind on purpose: pathways.guest_id
     has ON DELETE CASCADE, so deleting it would take the rows just moved. */
}
