# wifirank: index every licensed ISP in Bangladesh, by district

Repo: /Users/sou-hardo/.t3/worktrees/wifirank/t3-06cdeba0 (Astro + React, branch t3/06cdeba0). Read the code before changing it; match its style and comment density.

## Goal
The site started Dhaka-only and has since expanded the map to all of Bangladesh. It currently knows 147 ISPs (data/isps.json) and packages for 95 (data/isp-packages.json), plus 98 Dhaka neighbourhoods (data/areas.json, src/lib/options.ts AREAS). We've researched every BTRC-licensed ISP in the country. Get it all into the site, organised by district.

Decisions already made by the user (don't revisit):
- Granularity is **district** (64 districts), not division. Dhaka neighbourhoods stay and sit inside the Dhaka district.
- Add a `districts` list to each ISP, and a new `data/districts.json` (64 districts: name, slug, division, lat, lon).
- ISPs with no website/packages are still listed (name, licence category, district, address), shown as "no published packages".

## Inputs (all in /tmp/wifirank-research/ — copy what you need into the repo, e.g. data/sources/, so the build is reproducible; /tmp is ephemeral)
- master.json — ~2,964 merged ISP entities: name, aliases, categories (Nationwide/Divisional/District/Upazila-Thana/...), locations, addresses, asn, site, sources, existing (already in isps.json), bdix_slug, renewal dates.
- btrc-licensees.csv — official BTRC licence rows (Dec 2024) with resolved `district` column.
- bdix-isps.csv — bdix.app directory (2,229 licensees incl. Nationwide/District categories). Third-party, built from BTRC.
- bdix-detail.json — keyed by bdix slug: packages (name, mbps, bdt) + areaServed + address for 106 ISPs. Credit source as bdix.app.
- extracted-0..9.json — packages scraped from 462 ISP sites: {name, site, asn, is_home_isp, status ok|no-prices|not-isp|dead, packages_source, packages[{name,mbps,bdt,vat}], coverage[], notes}. Drop not-isp. Keep notes on low-confidence entries.
- geo.json — districts with division + lat/lon, and upazila_to_district map.
- Notes *.md and city-*.md — earlier hand research (Starlink, Grameenphone gpfi FWA, Orbit = alias of Race Online, Broadband360 = Velocity Networks brand, etc.).

## What to build
1. A reproducible data build script (scripts/, TS like the others) that merges the sources into data/isps.json, data/isp-packages.json and data/districts.json, preserving existing entries/fields and existing package data (existing hand-curated packages win over scraped ones). Each ISP gains: `districts` (district slugs: from licence location/address, plus coverage named on the site or bdix areaServed; Nationwide licensees may be marked nationwide rather than listing 64), `licence` category, and keep `source`. Record per-package source URL as the existing format does. Mark entries whose only source is the Dec-2024 BTRC PDF with an expired renewal date as possibly lapsed rather than dropping them. Watch for duplicate entities from name variants (e.g. "M/s Help Line" vs "Help Line"; strip "M/s", "Ltd" etc. for display names) but don't merge genuinely different ISPs (Skynet Broadband Service in Sylhet ≠ Skynet Chowmuhani).
2. Wire it into the UI: the ISP list page (src/pages/isps.astro), ISP detail page, and anywhere ISPs are chosen (SpeedTest provider picker / Combobox) must cope with ~3,000 ISPs (search, not a giant dropdown) and let users filter by district. Add district pages if it fits the existing area page pattern (src/pages/area/[slug].astro). Location picker / nearest-area logic should handle districts outside Dhaka. Check sitemap and llms.txt pages.
3. Make sure `npm run build` passes and `npm run check` if it runs locally. Open the site with `npm run dev` and check the ISP list, an ISP page (e.g. Help Line, Bogura) and a district page actually render.

## Working rules
- Commit and push each finished component as you go (data build, UI pieces), with clear messages. Open a draft PR against main early and keep a checklist in its description current.
- Do not invent data; only use what's in the inputs.
- If something is ambiguous and blocks you, make the conservative choice and note it in the PR description.
- Finish with a summary: what changed, counts (ISPs, ISPs with packages, packages, districts covered), anything skipped, PR URL.
