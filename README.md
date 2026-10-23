<img src="assets/icon.svg" width="64" height="64" alt="">

# WifiRank

Crowdsourced internet speed tests and reviews for ISPs in Dhaka. Anonymous users pick their provider and area, run a browser test, and optionally leave a review. Results are aggregated per provider and per neighbourhood.

Astro (server-rendered) + React islands + Postgres (Neon) + MapLibre.

## Screenshots

Figures in these screenshots come from local demo data, except the test result, which is a real run.

The speed test runs on a live map of Dhaka: pick your area and the map flies to it, packets stream between you and Cloudflare's Dhaka edge while it measures, and your result lands as a pin.

![Home page: the speed test over a live map of Dhaka](docs/screenshots/home.png)

| Test in progress | Result |
|---|---|
| ![Test running: packets travel along an arc between the tester and the Cloudflare edge](docs/screenshots/test-running.png) | ![Finished test: the result lands as a pin on the map](docs/screenshots/result.png) |

| Map | Rankings |
|---|---|
| ![Dhaka speed map with an area selected](docs/screenshots/map.png) | ![Provider rankings](docs/screenshots/rankings.png) |

| Provider page | Mobile |
|---|---|
| ![Provider page with peak vs off-peak](docs/screenshots/provider.png) | <img src="docs/screenshots/mobile.png" alt="Test running on a phone" width="300"> |

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
- Speeds are **sustained**: the median of requests that take 250 ms or longer, not the engine's default 90th percentile, which short bursts inflate (`src/lib/sustained.ts`).
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

### National ISP directory

Run `npm run data:build` to rebuild `data/isps.json`, `data/isp-packages.json` and `data/districts.json` from the committed `data/sources/` research snapshots. Update `curated-isps.json` and `curated-packages.json` for manual corrections; curated records and prices take precedence. Run `node scripts/check-directory.ts` to validate preservation, identifiers, districts and package provenance.

Run `npm run db:migrate` against the target database after updating the directory, so all providers become selectable in speed tests. The migration preserves ISP IDs and historical tests. Directory profiles work from the committed data even before reseeding.

District associations combine licence locations, resolved BTRC CSV districts, addresses and published coverage. Unresolved locations stay unknown. Nationwide is licence scope, not a promise of service at any address. Historical renewal dates are marked possibly lapsed only when the sole source is the December 2024 BTRC list; status is evaluated at the fixed research date in the build script. Entries marked `not-isp` by site research are excluded unless already curated. Scraper notes remain on profiles, and bdix.app packages retain their attribution. No live network access is needed to rebuild.

### ISP detection and fixed wireless

Run `npm run db:migrate` before deploying this change. It adds `tests.district`,
`tests.access_type`, `isps.access_type`, and the covering `(asn, district, created_at)`
index, backfills known historical districts, and seeds provider access metadata.
It is safe to rerun. Existing tests already retain detected ASN and hashed IP.

`npm run data:build` also produces `data/upstream-asns.json`: the unique ASNs with
Nationwide or IIG/transit-like licence scope. This is a warning signal,
not proof of a transit relationship. Shared ASNs and locally learned reseller
choices also prevent silent selection. Small ISP ASNs can prefill an empty,
untouched form; remembered or typed choices always win.

Crowd suggestions use the last 180 days, at least 3 distinct IP hashes, and at
least 50% of independent choices for an ASN/district. Each hash gets one latest
vote, so repeated tests cannot increase its weight. Foreign and phone mobile
results are excluded; declared FWA is eligible. The single indexed query is
cached for five minutes, with bounded process-local storage. No raw IPs or new
identifiers are stored. Thresholds live in `src/lib/detection.ts`.

Provider metadata in `data/sources/access-types.json` and the explicit 5G/4G home
router checkbox both declare fixed wireless. The server determines metadata from
the selected provider, clears only the mobile-data exclusion, and preserves
foreign-IP exclusion. Phone data remains excluded. Stats support
`/api/stats?accessType=fixed_wireless` or `fixed_line`; latest results expose
`access_type`. Fixed-line is a broad category, not a claim that a line is fibre.

Grameenphone's [official terms](https://www.grameenphone.com/gpfibkashterms-conditions-url-english)
and [5G FWA page](https://www.grameenphone.com/gpfi-5g-fwa) identify gpfi as FWA.
Research found no documented, reliable subscriber ASN, prefix, PTR, hostname,
company, or privacy-field discriminator from phone data, so detection does not
attempt one. The existing `gpfi` record keeps its ID/slug/packages and gains the
`Grameenphone gpfi` search alias. This mechanism supports future FWA brands by
adding catalogue metadata.

For local browser checks only, `/?devAsn=23688` simulates Link3 (upstream) and
`/?devAsn=134712` simulates Pipex Network (small ISP). `/api/whoami` accepts the
same fixture and an optional district slug. The ASN override is compiled out in
production. Without it, loopback development requests look up the machine's own
public IP through ipinfo.
