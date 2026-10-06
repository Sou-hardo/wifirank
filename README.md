<img src="assets/icon.svg" width="64" height="64" alt="">

# WifiRank

Crowdsourced internet speed tests and reviews for ISPs in Dhaka. Anonymous users pick their provider and area, run a browser test, and optionally leave a review. Results are aggregated per provider and per neighbourhood.

Astro (server-rendered) + React islands + Postgres (Neon) + MapLibre.

## Screenshots

Figures in these screenshots come from local demo data, except the test result, which is a real run.

![Home page with the speed test](docs/screenshots/home.png)

| Test in progress | Result |
|---|---|
| ![Test running, with the data stream behind the gauge](docs/screenshots/test-running.png) | ![Finished test with thank-you and speed tier](docs/screenshots/result.png) |

| Map | Rankings |
|---|---|
| ![Dhaka speed map with an area selected](docs/screenshots/map.png) | ![Provider rankings](docs/screenshots/rankings.png) |

| Provider page | Mobile |
|---|---|
| ![Provider page with peak vs off-peak](docs/screenshots/provider.png) | <img src="docs/screenshots/mobile.png" alt="Home page on a phone" width="300"> |

## Run locally

```sh
npm install
cp .env.example .env
npm run db:local          # throwaway local Postgres (PGlite) on :5432, keep running
npm run db:migrate        # schema + 147 seeded ISPs
node --env-file=.env scripts/seed-demo.ts   # optional: fake results to design against (local DBs only)
npm run dev
```

`npm run check` runs the stats self-check. `npx astro check` type-checks.

## Deploy

1. **Database:** create a Neon project, put its *pooled* connection string in `DATABASE_URL`, then run `npm run db:migrate` once (safe to re-run; it also re-syncs `data/isps.json`).
2. **App:** deploy to Vercel. Set `DATABASE_URL`, `IP_SALT` (any long random string) and optionally `SITE_URL` (your domain, used for canonical URLs and the sitemap).
3. **Packet loss (optional):** create a Cloudflare Realtime TURN key and set `CF_TURN_KEY_ID` / `CF_TURN_API_TOKEN`.
4. **ISP check (optional):** set `IPINFO_TOKEN` for higher lookup limits.

## How the numbers work

- Tests run against Cloudflare's Dhaka edge with `@cloudflare/speedtest`. That is the domestic path; international speed is not measured (columns are prefixed `local_` to keep that explicit).
- Each device counts once per provider (per-device median, then median across devices), last 90 days only, minimum 5 testers to rank.
- Tests over mobile data or a non-Bangladeshi IP are stored but excluded. Reviews require a completed test.
- Full explanation at `/methodology`.

## Moderation (SQL for now)

```sql
update isps set approved = true where slug = '...';    -- approve a user-added ISP
update reviews set hidden = true where device_id = '...' and isp_id = ...;
```

## Layout

| Path | What |
|---|---|
| `src/pages/` | Pages, JSON API (`api/`), `sitemap.xml`, `robots.txt`, `llms.txt`, OG images (`og/`) |
| `src/components/` | `SpeedTest` (test flow), `DhakaMap` (explorer), `LocationPicker`, `Gauge`, `Combobox` |
| `src/lib/stats.ts` | All aggregation SQL |
| `data/` | Seed ISPs and area coordinates |
