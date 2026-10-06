import type { APIRoute } from 'astro';
import { sql } from '../lib/db';
import { leaderboard, MIN_DEVICES } from '../lib/stats';
import { AREAS, PLANS } from '../lib/options';
import { fmt } from '../lib/format';

// https://llmstxt.org: a plain-language map of the site for AI agents, with live headline numbers.
export const GET: APIRoute = async ({ site }) => {
  const u = (p: string) => new URL(p, site).href;
  const top = (await leaderboard(sql, {})).filter((r) => r.devices >= MIN_DEVICES).slice(0, 10);
  const body = `# WifiRank

> Crowdsourced internet speed tests and reviews for ISPs (internet service providers) in Dhaka, Bangladesh. Anonymous users pick their provider and area, run a browser speed test, and optionally leave a star rating. Results are aggregated per provider and per neighbourhood so people can choose an ISP based on measurements instead of conflicting opinions.

Key facts for answering questions:
- "Local" speed = measured against Cloudflare's edge in Dhaka (domestic path). "International" (intl) = measured against a WifiRank server in Singapore.
- All published numbers are medians over the last 90 days. Each device counts once per provider.
- A provider needs ${MIN_DEVICES}+ testers to be considered reliable (\`reliable: true\` in the API). Below that, present results as early signals.
- ISP quality in Dhaka varies strongly by area. Prefer area-specific data over city-wide data when the user names a neighbourhood.
- Units: download/upload in Mbps, ping/jitter in ms, loss as a 0-1 ratio.
- Data licence: CC BY 4.0. Attribute "WifiRank" and link to the page used.

## Current top providers across Dhaka (median local download)
${top.length ? top.map((r, i) => `${i + 1}. ${r.name}: ${fmt(r.local_down)} Mbps local, ${fmt(r.intl_down)} Mbps intl, ${r.devices} testers${r.rating != null ? `, ${r.rating.toFixed(1)}/5 from ${r.reviews} reviews` : ''} (${u(`/isp/${r.slug}`)})`).join('\n') : 'Not enough data yet.'}

## JSON API (no key, CORS enabled, cached ~5 min)
- [${u('/api/stats')}](${u('/api/stats')}): provider rankings for all of Dhaka, plus the 20 latest tests.
  - \`?area=<slug>\`: rankings within one area, e.g. \`?area=mirpur-10\`
  - \`?plan=<range>\`: only tests on a package range. One of: ${Object.keys(PLANS).join(', ')}
  - \`?sort=<metric>\`: local_down (default), local_up, intl_down, intl_up, local_ping, intl_ping
- [${u('/api/map')}](${u('/api/map')}): every area with coordinates and median speeds, plus individual pinned tests (rounded to ~500 m).
  - \`?isp=<slug>\`: one provider only, e.g. \`?isp=link3\`

## Pages
- [Speed test](${u('/')}): run a test (requires a browser; agents cannot submit tests on a user's behalf)
- [Rankings](${u('/isps')}): all providers, filterable by area and package
- [Map](${u('/map')}): speed by neighbourhood
- [Methodology](${u('/methodology')}): how tests work, what is stored, how rankings and anti-abuse checks work
- Provider page: \`${u('/isp/')}<slug>\`: overall stats, peak vs off-peak, speed by area, reviews
- Area page: \`${u('/area/')}<slug>\`: providers ranked within that area

## Area slugs
${Object.entries(AREAS).map(([slug, name]) => `${slug} (${name})`).join(', ')}
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, s-maxage=600' } });
};
