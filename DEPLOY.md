# Deploying Clickpoint

The app is a long-lived Node server, not a serverless function. `pipeline.ts`
uses fire-and-forget `void generateRemaining(...)` to build later cards while
the user reads card 1. That work dies the moment a serverless response returns,
so this needs a container host (Fly.io, Railway, Render) rather than
Vercel/Netlify. Vercel's `waitUntil`/`after()` can extend an invocation, but only
up to the route's `maxDuration` (300s on Hobby) — a pathway takes ~2.5 min today
and would fail silently if it ever overran that ceiling. Once `store.ts` talks
to a real database instead of the local filesystem, Vercel becomes viable.

## What the app needs

| Variable | Purpose |
| --- | --- |
| `LOGFARE_API_KEY` | Hack Club AI key (`sk-hc-v1-...`). **Secret.** |
| `DATA_DIR` | Writable dir for guest + pathway JSON. Must be a mounted volume. |
| `LOGFARE_BASE_URL` | Defaults to the Hack Club proxy. |
| `LOGFARE_MODEL` | Defaults to `deepseek/deepseek-v4.1-flash`. |

`DATA_DIR` is the whole ballgame. Unset, records go to the container's
ephemeral disk and **every user's progress is wiped on the next deploy**.

## Fly.io — current deployment

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

## Railway

Connect the GitHub repo, then:

1. Add a volume mounted at `/data`.
2. Set `DATA_DIR=/data` and `LOGFARE_API_KEY` as variables.
3. Railway detects the Dockerfile automatically.

## After deploying, verify

```sh
curl -s https://clickpoint.fly.dev/api/pathways
```

Expect `{"guestId":"gst_...","pathways":[]}`. Then load the site, paste notes,
and confirm a pathway builds. Re-running the same POST within 24h should return
`429` with a countdown — that is the per-guest limit working.

## Not yet done

- **No accounts.** Identity is a guest cookie, so clearing cookies resets both
  the library and the daily limit. Real enforcement needs the sign-up work.
- **No database.** Records are JSON on the volume; `rawNotes` is retained in
  full for every pathway and is never cleared. With accounts this becomes a
  privacy claim, so decide retention before shipping sign-up.
- **`getGuest` swallows every error and returns `null`** (`store.ts`). A
  truncated or corrupt guest file silently hands that user a brand-new empty
  library with no error logged anywhere. Narrow the catch to `ENOENT` only.
- **Single machine only.** File-per-record storage means last-write-wins with no
  locking, and the background generator is in-process. Running two machines
  would have them fight over the same volume.
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

