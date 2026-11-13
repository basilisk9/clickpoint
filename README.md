# clickpoint.

Upload notes. Get a Duolingo-style pathway. Learn the card. Survive the checkpoint.

## Setup

1. Copy `.env.example` to `.env.local`
2. Put your Hack Club AI key in `LOGFARE_API_KEY` (https://ai.hackclub.com)
3. Put your Postgres connection string in `DATABASE_URL` — records live in
   Postgres, so the app needs `db/schema.sql` applied once (it is idempotent):
   `psql "$DATABASE_URL" -f db/schema.sql`
4. `npm install`
5. `npm run dev`

Open [http://localhost:3000](http://localhost:3000)

## Flow

1. Landing page (`/`): what the product is, one real card as proof
2. `/new`: paste notes or attach up to 6 files (PDF / PPTX / TXT / MD)
3. Wait for syllabus + banner + card 1, then read it
4. Walk the pathway. Later cards generate in the background.
5. Finish lesson → 8-question checkpoint → 75% unlocks the next card
6. Three pathways per rolling 24h; the gate copy counts down in the app

## Feedback

There is no admin UI and none is needed. Reports land in the `feedback` table
with their pathway and node ids attached where the report was anchored, so query
the table directly:

```sql
select created_at, kind, node_id, body
  from feedback
 order by created_at desc
 limit 50;
```

Per-card and per-checkpoint reports are asked for on those screens (the button
carries the node id); the library page has the general box.


