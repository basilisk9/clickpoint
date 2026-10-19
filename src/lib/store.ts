import { Pool } from "pg";
import type { GuestRecord, PathwayRecord, PathwaySummary } from "./types";

/* Postgres-backed store (Supabase). This replaces the old DATA_DIR filesystem
   store: the app used to need a mounted volume, which disqualified every free
   host. Records now live in the database, so the container needs no disk.

   DATABASE_URL must point at Supabase's *pooler* (port 6543), not the direct
   connection (5432). Each serverless invocation opens its own connection, and
   the direct port runs out of slots almost immediately under load. */

const globalForPg = globalThis as unknown as { clickpointPool?: Pool };

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }

  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
  return new Pool({
    connectionString,
    /* Small on purpose: the pooler multiplexes many clients onto few real
       connections, and every extra one costs a slot. */
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    /* Supabase's pooler serves a chain Node has no root for, so verification
       is relaxed on the managed endpoint. Traffic is still TLS-encrypted.
       Set DATABASE_CA to a CA bundle to verify fully instead. */
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
}

/* Cached on globalThis so dev hot-reloads and warm serverless invocations
   reuse one pool instead of leaking a new one per request. */
function pool(): Pool {
  if (!globalForPg.clickpointPool) {
    globalForPg.clickpointPool = createPool();
  }
  return globalForPg.clickpointPool;
}

type GuestRow = {
  id: string;
  created_at: Date;
  last_pathway_at: Date | null;
  pathway_ids: string[] | null;
};

/* A missing row is `rows[0] === undefined`, not an exception, so there is no
   try/catch here. The old filesystem version swallowed *every* error into
   null — including real I/O failures — which turned a broken disk into
   "this user has no data" and then silently overwrote it. Connection errors
   now propagate instead. */
export async function getGuest(id: string): Promise<GuestRecord | null> {
  const { rows } = await pool().query<GuestRow>(
    "select id, created_at, last_pathway_at, pathway_ids from guests where id = $1",
    [id],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    createdAt: row.created_at.toISOString(),
    lastPathwayAt: row.last_pathway_at?.toISOString(),
    pathwayIds: row.pathway_ids ?? [],
  };
}

export async function saveGuest(guest: GuestRecord): Promise<void> {
  await pool().query(
    `insert into guests (id, created_at, last_pathway_at, pathway_ids)
     values ($1, $2, $3, $4)
     on conflict (id) do update set
       last_pathway_at = excluded.last_pathway_at,
       pathway_ids = excluded.pathway_ids`,
    [
      guest.id,
      guest.createdAt,
      guest.lastPathwayAt ?? null,
      guest.pathwayIds,
    ],
  );
}

export async function getPathway(id: string): Promise<PathwayRecord | null> {
  const { rows } = await pool().query<{ data: PathwayRecord }>(
    "select data from pathways where id = $1",
    [id],
  );
  return rows[0]?.data ?? null;
}

export async function savePathway(pathway: PathwayRecord): Promise<void> {
  pathway.updatedAt = new Date().toISOString();
  await pool().query(
    `insert into pathways (id, guest_id, created_at, updated_at, status, xp, data)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (id) do update set
       updated_at = excluded.updated_at,
       status = excluded.status,
       xp = excluded.xp,
       data = excluded.data`,
    [
      pathway.id,
      pathway.guestId,
      pathway.createdAt,
      pathway.updatedAt,
      pathway.status,
      pathway.xp,
      JSON.stringify(pathway),
    ],
  );
}

/* One query instead of the old read-the-id-list-then-load-each loop. That
   loop also silently skipped any id that failed to resolve, so a lost file
   just made a pathway disappear; filtering on guest_id can't drift. */
export async function listPathwaysForGuest(
  guestId: string,
): Promise<PathwaySummary[]> {
  const { rows } = await pool().query<{ data: PathwayRecord }>(
    `select data from pathways
     where guest_id = $1
     order by created_at desc`,
    [guestId],
  );

  return rows.map(({ data }) => ({
    id: data.id,
    title: data.banner.title,
    blurb: data.banner.blurb,
    createdAt: data.createdAt,
    status: data.status,
    completedNodes: data.completedNodeIds.length,
    totalNodes: data.nodes.length,
    xp: data.xp,
  }));
}

/* How long a background-fill claim is held before it's considered stale and
   can be stolen again. Comfortably past the route's 300s maxDuration, so a
   legitimately running fill is never stolen, but a killed run's claim expires
   instead of deadlocking the row. */
export const FILLING_LEASE_SECONDS = 10 * 60;

/* Cross-process claim for the background fill job, taken as a *lease*. Exactly
   one caller gets `true` — a single atomic UPDATE can only match once — so a
   second request or a retry can't start a duplicate run. The lease replaces the
   old in-process `jobs` Set (which could never dedupe across serverless
   invocations) AND a plain boolean flag (which a killed process would leave set
   forever, stranding the pathway). `filling_until` expiring is what makes a dead
   run claimable again. */
export async function claimFilling(pathwayId: string): Promise<boolean> {
  const { rowCount } = await pool().query(
    `update pathways
     set filling_until = now() + make_interval(secs => $2)
     where id = $1
       and (filling_until is null or filling_until < now())`,
    [pathwayId, FILLING_LEASE_SECONDS],
  );
  return rowCount === 1;
}

export async function releaseFilling(pathwayId: string): Promise<void> {
  await pool().query("update pathways set filling_until = null where id = $1", [
    pathwayId,
  ]);
}

export function publicPathway(pathway: PathwayRecord): PathwayRecord {
  return {
    ...pathway,
    rawNotes: "",
  };
}
