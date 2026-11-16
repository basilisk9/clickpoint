# clickpoint.

Upload notes. Get a Duolingo-style pathway. Learn the card. Survive the checkpoint.

## Setup

1. Copy `.env.example` to `.env.local`
2. Put your Logfare key in `LOGFARE_API_KEY` (https://logfare.ai, `lfu_...`)
3. Put your Postgres connection string in `DATABASE_URL` — records live in
   Postgres, so the app needs `db/schema.sql` applied once (it is idempotent):
   `psql "$DATABASE_URL" -f db/schema.sql`
4. `npm install`
5. `npm run dev`

Open [http://localhost:3000](http://localhost:3000)

## Flow

1. Landing page (`/`): what the product is, plus a live pathway preview
2. `/new`: paste notes or attach up to 6 files (PDF / PPTX / TXT / MD) — account required
3. Wait for syllabus + banner + card 1, then read it
4. Walk the pathway. Later cards generate in the background.
5. Finish lesson → 8-question checkpoint → 75% unlocks the next card
6. Three pathways per rolling 24h; the gate copy counts down in the app

## Feedback

There is no admin UI and none is needed. Reports land in the `feedback` table
with their pathway and node ids attached where the report was anchored, so query
the table directly:

```sql
select created_at, kind, pathway_id, node_id, body
  from feedback
 order by created_at desc
 limit 50;
```

One floating "Send feedback" button sits bottom-right on every screen. Its
catalogue narrows by route — a card page asks about the card, a checkpoint
about the answer key, everything else gets bug/idea/general — and the pathway
and node ids are read from the URL, so an anchored report can be checked
against the generator's own output. The panel stays open after a send, so
several reports can follow one another (server throttle: 10s).


