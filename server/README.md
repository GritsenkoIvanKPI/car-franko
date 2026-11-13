# Auction lot sync (Copart / IAAI → our database)

This module imports a filtered subset of auction lots into our own PostgreSQL database. The website reads only from that database.

The research behind the design is in [docs/RESEARCH.md](docs/RESEARCH.md).

## Status

| Step | What | State |
|---|---|---|
| 1 | Research | done |
| 2 | Architecture: provider interface, `Lot` schema, normalisation, upsert, tests | **done** |
| 3 | Sync: initial import (**done**, with `--limit`), scheduled refresh, sold/removed handling | in progress |
| 4 | Reliability: per-source queue, rate limit, retries, block → stop, run log (**done**); pause state + Telegram, cron | partly |
| 5 | API for the frontend | |

## Rule: the website never reveals the auction

The source auction is internal information. It lives in our database (`source`, `source_lot_id`, `lot_url`, `raw_json`) and must never reach visitors.

- **Step 5 API:** responses contain no `source`, lot number, lot URL, VIN, `raw_json` or branch name. Cars are identified by our own code (`CF-XXXXXXX`), the same scheme as `publicCode()` in `scripts/sync-lots.mjs`. Staff map a code back to the lot through the database.
- **Photos:** IAAI image URLs (`vis.iaai.com/...`) reveal the source. Before real lots go on the site, photos must be downloaded and served from our own domain (planned as part of the optional photo cache in Step 3). Don't hotlink them.

## Layout

```
src/
  domain/lot.ts            NormalizedLot: the one shape every source maps into
  providers/types.ts       AuctionProvider interface: searchLots / getLot / getPhotos
  providers/iaai.ts        IaaiProvider: sitemap discovery + ProductDetailsVM lot pages
  providers/copart.ts      CopartProvider: frontend JSON endpoints (currently blocked by Imperva → pauses)
  providers/registry.ts    the only place that knows concrete providers (add ApibaraProvider here)
  providers/http.ts        HTTP client interface + block / CAPTCHA / 5xx detection
  providers/errors.ts      ProviderBlockedError, SchemaChangedError, TransientError
  normalize/               source JSON -> NormalizedLot (+ shared parsers)
  config/env.ts            .env settings, validated at startup
  config/filters.ts        filter sets (JSON file today, admin panel later) + matching
  db/                      PostgreSQL client, migrations, LotsRepo.upsert
test/                      vitest; fixtures are real IAAI responses (Copart sample is synthetic, see its _note)
```

### Adding a provider (e.g. a paid API)

1. Create `src/providers/apibara.ts` with a class that implements `AuctionProvider`. Have it return `NormalizedLot`s, using a new normaliser in `src/normalize/` if needed.
2. Add one `case` to `src/providers/registry.ts` and put its id in `PROVIDERS`.

Nothing else changes: sync, database and API only know the interface.

## Run locally

Requirements: Node 20.12+, and Docker for PostgreSQL.

```bash
cd server
npm install
cp .env.example .env
cp config/filters.example.json config/filters.json   # edit filter sets here

npm test              # normalisation, providers, filters, upsert (PGlite, no Docker needed)
npm run typecheck

docker compose up -d db   # PostgreSQL on localhost:5433
npm run migrate           # creates the lots + sync_runs tables
```

## Import lots

```bash
npm run import -- --limit 200 --provider iaai-web     # first 200 matching lots
npm run import -- --limit 1000                        # continue: lots already stored are skipped
```

The import follows these rules:

- **Pace:** one request at a time per source, with a random 2–3 s gap (`RATE_LIMIT_MIN_MS` / `RATE_LIMIT_MAX_MS`).
- **Errors:** network errors and 5xx are retried with backoff.
- **Blocks:** a 403, 429, CAPTCHA or challenge page stops that source immediately, and the run is recorded as `blocked`.
- **Structure changes:** if required fields go missing, the run is recorded as `failed` and nothing more is written.
- **Run log:** every run is stored in `sync_runs`. To see recent runs: `docker compose exec db psql -U carfranko -c "select * from sync_runs order by id desc limit 5"`.

## Move the data to the real host

```bash
npm run db:dump      # -> exports/carfranko-YYYYMMDD-HHMM.sql.gz
```

Then, on the host (Node 20+, PostgreSQL 15+):

```bash
git clone https://github.com/GritsenkoIvanKPI/car-franko.git && cd car-franko/server
npm ci
cp .env.example .env                                   # set DATABASE_URL to the host's database
cp config/filters.example.json config/filters.json
gunzip -c carfranko-YYYYMMDD-HHMM.sql.gz | psql "$DATABASE_URL"   # restores lots + sync_runs
npm run migrate                                        # no-op if up to date
```
