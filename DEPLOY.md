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
| `LOGFARE_API_KEY` | Hack Club AI key (`sk-hc-v1-...`). **Secret.** |
| `DATABASE_URL` | Postgres connection string. Must be Supabase's **pooler** (port 6543). |
| `LOGFARE_BASE_URL` | Defaults to the Hack Club proxy. |
| `LOGFARE_MODEL` | Defaults to `deepseek/deepseek-v4.1-flash`. |

`DATABASE_URL` must be the **pooler** connection string, not the direct one.
Each serverless invocation opens its own connection, so the direct port (5432)
runs out of slots almost immediately and requests fail with connection errors
under trivial load.

Run `db/schema.sql` once against the database to create `guests` and `pathways`.

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

# The LLM key. Not in the repo; the app cannot generate a pathway without it.
fly secrets set LOGFARE_API_KEY=sk-hc-v1-... -a clickpoint
```

The dashboard flow *does* create and attach the volume and mount it at `/data`,
so `DATA_DIR` is handled for you.

### Verifying a deployment

```sh
curl -s https://clickpoint.fly.dev/api/pathways
# {"guestId":"gst_...","pathways":[]}

# Confirm records are landing on the persistent volume, not ephemeral disk:
fly ssh console -a clickpoint -C 'find /data -type f'
# /data/guests/gst_....json
```

Pathway generation takes **~2.5 minutes** (outline + first lesson synchronously,
remaining cards in the background). A `POST` that seems to hang is normal; check
`find /data -type f` for a new `pathways/path_*.json` rather than assuming a
failure.

### Rate-limit check

The guest cookie is named **`clickpoint_guest`** (not `cp_guest`). A second
`POST` from the same guest within 24h returns:

```sh
curl -s -w '\nHTTP %{http_code}\n' -X POST https://clickpoint.fly.dev/api/pathways \
  -H 'Content-Type: application/json' \
  -H 'cookie: clickpoint_guest=gst_...' \
  --data-binary '{"notes":"..."}'
# {"error":"You've already built a pathway today. You can build your next one in 23h 56m.","retryAt":"..."}
# HTTP 429
```

An unrecognized or missing cookie mints a **new** guest instead of erroring, so
a wrong cookie name looks like the limit silently not working. Check that the
`guestId` in the response matches the cookie you sent.

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

Volume data survives a stopped machine — `clickpoint_data` is a separate
resource and is not deleted when the trial lapses.

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

Expect `{"guestId":"gst_...","pathways":[]}`. Then load the site, paste notes,
and confirm a pathway builds. Re-running the same POST within 24h should return
`429` with a countdown — that is the per-guest limit working.

## Not yet done

- **No accounts.** Identity is still a guest cookie, so clearing cookies resets
  both the library and the daily limit. Supabase Auth is included on the free
  tier (50k monthly active users) and would replace the planned hand-rolled
  `users`/`sessions` tables — use `@supabase/ssr`, which handles App Router
  cookies, and verify identity with `getClaims()` on the server.
- **`rawNotes` is retained in full** for every pathway and is never cleared.
  With accounts this becomes a privacy claim, so decide retention before
  shipping sign-up.
- **Read-modify-write on the whole `PathwayRecord`.** `savePathway` writes the
  entire JSON blob, and `fillLesson` re-reads, mutates, and writes. Two
  concurrent writers — a user finishing a lesson while the background fill runs —
  can still clobber each other. This was last-write-wins on the filesystem too,
  and Postgres does not fix it by itself; it needs a per-pathway lock or
  `select ... for update`.
- **A generation killed mid-run permanently strands the pathway.** `filling` is
  a bare boolean with no expiry, and a killed process never reaches the
  `finally` that would release it. The pathway stays `ready` with its first
  lesson, the rest keep their placeholder status, and every later attempt to
  claim returns `false` — so it is never retried and never resumed. This is not
  specific to `maxDuration`: a deploy, an OOM, or any crash during a run does the
  same thing. The fix is a lease (`filling_until timestamptz`, claimed with
  `where filling_until is null or filling_until < now()`) plus skipping lessons
  whose card and quiz are already populated, so a retry resumes rather than
  redoing the work.
- **Browser click-through not done.** The quiz fail path (lose 3 hearts →
  "Out of hearts") and the results screen (XP count-up, question log) have only
  been verified via API and SSR HTML, not a real browser.

## Verified working (2026-10-15)

Deployed to Fly and confirmed live, end to end:

- Image builds remotely — `npm ci` + `next build` + export, 181 MB.
- `GET /` → 200; `GET /api/pathways` → `{"guestId":"gst_...","pathways":[]}`.
- A real pathway generated from pasted notes: `status: "ready"` in ~2.5 min.
- Records persist to the mounted volume (`/data/guests/*.json`,
  `/data/pathways/*.json`) and survive machine restart.
- Rate limit: second POST from the same guest → `429` with a 23h 56m countdown.
- `lastPathwayAt` is stamped ~17s **before** the pathway's `createdAt`,
  confirming the "stamp before generation" ordering — a run that fails partway
  still counts against the limit.

