# Deploying Clickpoint

Records live in Postgres (Supabase), so the app needs **no persistent disk** and
runs on any free host — including serverless ones.

`pipeline.ts` builds later cards in the background after the response is sent.
That work dies the moment a serverless response returns, so it is wrapped in
`after()` from `next/server`, which keeps the invocation alive until the work
settles. The ceiling is the route's `maxDuration` — **300s on Vercel Hobby, and
Hobby cannot raise it**. A pathway takes ~2.5 min today, so there is roughly 2x
headroom and not much more.

The background job is claimed via a `filling` flag on the `pathways` row
(`claimFilling`), not an in-process `Set`. Every serverless invocation is a new
process, so an in-memory guard can never dedupe across them.

## What the app needs

| Variable | Purpose |
| --- | --- |
| `LOGFARE_API_KEY` | Logfare key (`lfu_...`). **Secret.** |
| `DATABASE_URL` | Postgres connection string. Must be Supabase's **pooler** (port 6543). |
| `LOGFARE_BASE_URL` | Defaults to `https://logfare.ai/v1`. |
| `LOGFARE_MODEL` | Defaults to `deepseek-v4.1-flash-1017`. |
| `LOGFARE_FALLBACK_MODELS` | Comma-separated Logfare model IDs in failover order. The Fly config uses `qwen-3.8-27b,glm-5.3`; leave empty to disable extra models. |
| `LOGFARE_REASONING_EFFORT` | Defaults to the model's own. The default model reasons optionally and defaults to `high`; the deployment pins `low`. |
| `LOGFARE_VISUAL_MODEL` | Draws the simulation. Falls back to `LOGFARE_MODEL`. |
| `LOGFARE_LESSON_MODEL` | Writes the formalization and worked examples. Falls back to `LOGFARE_MODEL`. |
| `LOGFARE_REVIEW_MODEL` | Reviews the finished card against its own simulation and the notes, and patches what is wrong. Falls back to `LOGFARE_MODEL`. Keep this one short-prompt: it is sent a ~10k-character digest, because past roughly that size the gateway answers 200 with an empty body. |

`DATABASE_URL` must be the **pooler** connection string, not the direct one.
Each serverless invocation opens its own connection, so the direct port (5432)
runs out of slots almost immediately and requests fail with connection errors
under trivial load.

Run `db/schema.sql` once against the database. It is idempotent and creates
`guests`, `pathways`, `users`, `sessions`, `pathway_starts`, and `feedback`.

## Supabase + Vercel — the free path

**$0/month.** No persistent disk, no spin-down restarts.

1. **Create the database.** Supabase project → SQL editor → paste `db/schema.sql`
   → run.
2. **Copy the pooler string.** Project → Connect → *Connection pooling* →
   *Transaction* mode:
   `postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres`
   Do **not** use the direct `db.<ref>.supabase.co:5432` string.
3. **Import the repo into Vercel.** Framework is auto-detected as Next.js.
4. **Set env vars** (Settings → Environment Variables): `DATABASE_URL`,
   `LOGFARE_API_KEY`, optionally `LOGFARE_MODEL`.
5. **Deploy**, then verify (below).

### Vercel gotchas

- **300s is a hard `maxDuration` ceiling on Hobby.** Pro allows 800s. The
  generating routes already declare `export const maxDuration = 300`.
- **`after()` shares that budget with the synchronous part of the request.**
  Anything added to the POST path eats into the same 300s.
- **Vercel Hobby is non-commercial use only** per Vercel's terms.
- **Free Supabase projects pause after 1 week of inactivity.** The database
  sleeps and every request fails until you resume it from the dashboard. Keep it
  warm with a free external cron (e.g. cron-job.org) hitting the site weekly.
- **Do not use Render's free Postgres** — it is deleted 30 days after creation.
  Supabase is the database; Render would only ever be the app host.

## Fly.io — previous deployment (currently offline)

Deployed and verified at **https://clickpoint.fly.dev** (app `clickpoint`, region
`ams`, volume `clickpoint_data`).

### Redeploying

```sh
fly deploy --remote-only
```

The image builds on Fly's remote builder (~2 min: `npm ci`, `next build`,
export). A local Docker daemon is not needed.

### The `internal_port` trap — read this before regenerating `fly.toml`

`fly launch` / the dashboard "Deploy from GitHub" flow generates a `fly.toml`
with **`internal_port = 8080`**. The Dockerfile ends with `ENV PORT=3000` and
`EXPOSE 3000`, so the container listens on **3000**. The result is a confusing
half-failure:

- the app logs `✓ Ready in 407ms` and looks perfectly healthy;
- Fly's proxy logs `instance refused connection. is your app listening on
  0.0.0.0:8080?` on every request;
- the public URL hangs, then returns 502 — or does not resolve at all if the
  app also has no public IPs allocated.

`fly.toml` in this repo pins `internal_port = 3000`. If you ever regenerate it,
fix that line. Symptom to remember: **app says Ready, but nothing is reachable.**

### Things the dashboard flow does not do

Deploying via the Fly dashboard skipped two steps; both are now done, but a
fresh app will need them:

```sh
# Public IPs. Without these the app has no DNS record at all —
# `clickpoint.fly.dev` returns NXDOMAIN even though the machine is "started".
fly ips allocate-v4 --shared -a clickpoint
fly ips allocate-v6 -a clickpoint

# The LLM key and the database. Neither is in the repo; the app cannot
# generate a pathway without them.
fly secrets set LOGFARE_API_KEY=lfu_... -a clickpoint
fly secrets set DATABASE_URL=postgresql://...pooler...:6543/postgres -a clickpoint
```

No volume is needed — records live in Postgres.

### Verifying a deployment

```sh
curl -s https://clickpoint.fly.dev/api/pathways
# {"guestId":"gst_...","pathways":[]}

# Building a pathway is account-only. An anonymous POST runs the LLM-free
# gauntlet first, so it is cheap to prove the gate:
curl -s -w '\nHTTP %{http_code}\n' -X POST https://clickpoint.fly.dev/api/pathways \
  -H 'Content-Type: application/json' \
  --data-binary '{"notes":"..."}'
# {"error":"Sign in to build a pathway."}
# HTTP 401

# Confirm records are landing in Postgres, not on disk:
psql "$DATABASE_URL" -c 'select id, status, created_at from pathways order by created_at desc limit 5'
```

Pathway generation takes **~1-3 minutes** (outline + first lesson synchronously,
remaining cards in the background). A `POST` that seems to hang is normal; check
the `pathways` table for a new row rather than assuming a failure.

### Quota check

`PATHWAYS_PER_DAY` (in `src/lib/constants.ts`) is set to **10,000**, so the gate
is effectively open: an account can start as many pathways as it likes while the
counting machinery stays intact for a future re-tightening. If the cap is ever
lowered again, the blocked response looks like:

```sh
curl -s -w '\nHTTP %{http_code}\n' -X POST https://clickpoint.fly.dev/api/pathways \
  -H 'Content-Type: application/json' \
  -H 'cookie: clickpoint_session=...' \
  --data-binary '{"notes":"..."}'
# {"error":"The next pathway opens in 23h 56m.","retryAt":"..."}
# HTTP 429
```

The count comes from the `pathway_starts` table (one row per started pathway,
appended by `createPathwayFromNotes`), not from a single timestamp — see
`src/lib/ratelimit.ts`. To reset a quota for testing:

```sql
delete from pathway_starts where guest_id = 'gst_...';
```

In all these checks the **`clickpoint_session`** cookie must name a live session
row: an anonymous request is refused with 401 before the quota is even read.

### If the app is down

Check in this order — it is usually not the app.

**1. Is it the trial?** The single most likely cause on a new Fly account. The
free trial caps machine runtime at **5 minutes**, and the log says so outright:

```
✓ Ready in 392ms                              ← app is fine
machine became reachable in 3.55s             ← serving normally
warn  Trial machine stopping. To run for
      longer than 5m0s, add a credit card
      by visiting https://fly.io/trial.
reboot: Restarting system
```

Because `min_machines_running = 1`, Fly restarts the machine, it serves for
5 minutes, and dies again — a boot/serve/die loop, then it gives up. Every
`flyctl` command fails with `trial has ended, please add a credit card`. The fix
is adding a card at <https://fly.io/trial>; nothing in this repo can work around
it.

**2. Is Fly itself degraded?** Check the platform status before debugging code:

```sh
curl -s https://status.flyio.net/api/v2/status.json
# {"status":{"indicator":"major","description":"Partial System Outage"}}
```

**3. Is the machine even running?** `flyctl status` / `machine list` are the
authoritative answer, but note they are *also* the first thing the trial
restriction blocks.

Note the failure signature: when the machine is stopped, the edge proxy still
answers TCP on 443 (DNS resolves, `Test-NetConnection` succeeds) but returns
**HTTP 000 / connection closed** rather than 502 — there is no backend to route
to. A 502 is different: that means the machine *is* up but nothing is listening
on `internal_port` (see the trap above).

Volume data from that era survives a stopped machine — `clickpoint_data` is a
separate resource and is not deleted when the trial lapses — but nothing in this
code reads it any more.

## Railway / Render (container hosts)

Connect the GitHub repo — both detect the Dockerfile automatically — then set
`DATABASE_URL` and `LOGFARE_API_KEY` as environment variables.

No volume is needed any more; records live in Postgres. On a long-lived process
there is also no `maxDuration` ceiling, so the background fill is safer here than
on Vercel. `after()` still works under `next start`.

## After deploying, verify

```sh
curl -s https://clickpoint.fly.dev/api/pathways
```

Expect `{"guestId":"gst_...","pathways":[]}`. Then load the site, paste notes at
`/new`, and confirm a pathway builds. Starting a fourth pathway inside the
rolling 24h window should return `429` with a countdown — that is the per-guest
quota working.

## Known limitations

- **`rawNotes` is retained in full** for every pathway and is never cleared.
  Decide retention before making privacy promises.
- **Read-modify-write on the whole `PathwayRecord` in the progression routes.**
  `/complete` and `/quiz` do `getPathway` → mutate → `savePathway` on the entire
  JSON blob without taking the fill lease, so a save that lands while a
  background fill is writing can drop the other's change. The generation paths
  are protected by `filling_until`; progression is not. A per-pathway lock or
  `select ... for update` would close it.
- **Every report lands in the `feedback` table and nothing reads it in the app.**
  That is deliberate (see README), but "someone must look at the table" is a
  manual habit, not a guarantee.
- **A `node.html` record renders in a sandboxed `<iframe>` with both
  `allow-scripts` and `allow-same-origin`**, which together negate the sandbox.
  Only pre-typed-content records carry `html`, so it is legacy-only risk — but
  the pair should not both be there.

## Verified working (2026-11-13, local + Supabase)

- `npx next build` clean; `tsc --noEmit` clean; `vitest run` 92 tests green.
- Quota counts `pathway_starts` rows, per row rather than per clock day. The cap
  is 10,000 (effectively open); with the old 3-cap the boundary was verified at
  3 rows → `429` and `/new` rendered the locked countdown.
- Multi-file upload: two `.txt` files plus pasted notes produced one pathway
  whose `rawNotes` contains the pasted text first, then both files in order, and
  exactly one `pathway_starts` row was appended.
- Feedback over HTTP: a first report → `{ok:true,duplicate:false}`; the same
  stamp retried → `{ok:true,duplicate:true}` with still one row; a different
  report inside the throttle window (10s) → `429`.
- Browser click-through of the checkpoint to the results screen (choices,
  check, continue ×8, XP counter, question log). The floating "Send feedback"
  button was driven through the real UI: a card report saved with `node_id`,
  then "Send another" from the same panel saved a second row.
- Note the ordering fix this found: the throttle used to be checked before the
  duplicate check, so retrying a report that had already been stored returned
  `429` — an error for a report that was in fact saved. The duplicate check now
  runs first.

### Historical (2026-10-15, Fly)

Byte-for-byte still true for that deployment, but it predates the Postgres
migration and the accounts work, so the filesystem and volume details below no
longer describe this code:

- Image builds remotely — `npm ci` + `next build` + export, 181 MB.
- Records then persisted to a mounted volume (`/data/guests/*.json`,
  `/data/pathways/*.json`) and survived machine restart. Superseded: records live
  in Postgres now, so this repo carries no `DATA_DIR` and no `[[mounts]]`
  block — `store.ts` opens a `DATABASE_URL` pool. If you still have the old
  `clickpoint_data` volume on Fly, delete it; nothing reads it.

