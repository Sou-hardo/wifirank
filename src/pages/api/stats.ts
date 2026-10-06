import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';
import { leaderboard, recent, MIN_DEVICES } from '../../lib/stats';
import { AREAS, PLANS } from '../../lib/options';

// Open data: ISP rankings, optionally per area / package. Documented in /llms.txt.
export const GET: APIRoute = async ({ url, site }) => {
  const p = url.searchParams;
  const pick = (k: string, opts: object) => { const v = p.get(k) ?? ''; return v in opts ? v : null; };
  const area = pick('area', AREAS), plan = pick('plan', PLANS);
  const [rows, latest] = await Promise.all([
    leaderboard(sql, { area, plan, sort: p.get('sort') }),
    recent(sql, { area, plan, limit: 20 }),
  ]);
  const body = {
    about: 'Crowdsourced ISP speed tests in Dhaka, Bangladesh. Medians over the last 90 days; each device counts once.',
    units: { down_up: 'Mbps', ping_jitter: 'ms', loss: 'ratio 0-1' },
    tests: { local: 'Cloudflare edge in Dhaka (domestic path)', intl: 'WifiRank test server in Singapore (international path)' },
    reliable_from_devices: MIN_DEVICES,
    filters: { area: area && { slug: area, name: AREAS[area] }, plan: plan && PLANS[plan as keyof typeof PLANS] },
    license: 'CC BY 4.0, attribute WifiRank',
    isps: rows.map(({ isp_id, ...r }: any) => ({ ...r, url: new URL(`/isp/${r.slug}`, site).href, reliable: r.devices >= MIN_DEVICES })),
    latest: latest.map(({ id, lat, lng, ...r }) => r),
  };
  return Response.json(body, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600', 'Access-Control-Allow-Origin': '*' },
  });
};
