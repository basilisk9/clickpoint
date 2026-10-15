# Deploying Clickpoint

The app is a long-lived Node server, not a serverless function. `pipeline.ts`
uses fire-and-forget `void generateRemaining(...)` to build later cards while
the user reads card 1. That work dies the moment a serverless response returns,
so this needs a container host (Fly.io, Railway) rather than Vercel/Netlify.

## What the app needs

| Variable | Purpose |
| --- | --- |
| `LOGFARE_API_KEY` | Hack Club AI key (`sk-hc-v1-...`). **Secret.** |
| `DATA_DIR` | Writable dir for guest + pathway JSON. Must be a mounted volume. |
| `LOGFARE_BASE_URL` | Defaults to the Hack Club proxy. |
| `LOGFARE_MODEL` | Defaults to `deepseek/deepseek-v4.1-flash`. |

`DATA_DIR` is the whole ballgame. Unset, records go to the container's
ephemeral disk and **every user's progress is wiped on the next deploy**.

## Fly.io

```sh
# 1. Install + log in (once).
#    https://fly.io/docs/flyctl/install/
fly auth login

# 2. Pick a globally unique name and set it in fly.toml (`app = ...`).
#    Then adopt the config without deploying.
fly launch --no-deploy

# 3. Create the volume. Must match the `source` in fly.toml's [mounts].
fly volumes create clickpoint_data --size 1 --region sin

# 4. Set the secret. Never commit this.
fly secrets set LOGFARE_API_KEY=sk-hc-v1-...

# 5. Deploy.
fly deploy

# 6. Confirm it is up.
fly open
fly logs
```

The Dockerfile builds the image remotely, so a Dockerfile error shows up here
rather than locally. If the build fails, `fly logs` shows the failing step.

## Railway

Connect the GitHub repo, then:

1. Add a volume mounted at `/data`.
2. Set `DATA_DIR=/data` and `LOGFARE_API_KEY` as variables.
3. Railway detects the Dockerfile automatically.

## After deploying, verify

```sh
curl -s https://<your-app>/api/pathways
```

Expect `{"guestId":"gst_...","pathways":[]}`. Then load the site, paste notes,
and confirm a pathway builds. Re-running the same POST within 24h should return
`429` with a countdown — that is the per-guest limit working.

## Not yet done

- **No accounts.** Identity is a guest cookie, so clearing cookies resets both
  the library and the daily limit. Real enforcement needs the sign-up work.
- **No database.** Records are JSON on the volume; `rawNotes` is retained in
  full for every pathway.
- **The Dockerfile has not been executed locally** (no running Docker daemon
  during development), so treat the first `fly deploy` as the real test.
