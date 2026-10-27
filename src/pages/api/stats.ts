import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';
import { leaderboard, recent, MIN_DEVICES } from '../../lib/stats';
import { AREAS, PLANS } from '../../lib/options';

// Open data: ISP rankings, optionally per area / package. Documented in /llms.txt.
export const GET: APIRoute = async ({ url, site }) => {
  const p = url.searchParams;
  const pick = (k: string, opts: object) => { const v = p.get(k) ?? ''; return v in opts ? v : null; };
  const area = pick('area', AREAS), plan = pick('plan', PLANS);
  const accessType = pick('accessType', { fixed_line: true, fixed_wireless: true }) as 'fixed_line' | 'fixed_wireless' | null;
  const [rows, latest] = await Promise.all([
    leaderboard(sql, { area, plan, accessType, sort: p.get('sort') }),
    recent(sql, { area, plan, accessType, limit: 20 }),
  ]);
  const body = {
    about: 'Crowdsourced ISP speed tests in Dhaka, Bangladesh. Medians over the last 90 days; each device counts once.',
    units: { down_up: 'Mbps', ping: 'ms', loss: 'ratio 0-1' },
    measured_against: 'Cloudflare edge in Dhaka (domestic path). International speed is not measured.',
    reliable_from_devices: MIN_DEVICES,
    filters: { accessType, area: area && { slug: area, name: AREAS[area] }, plan: plan && PLANS[plan as keyof typeof PLANS] },
    license: 'CC BY 4.0, attribute WifiRank',
    isps: rows.map(({ isp_id, ...r }: any) => ({ ...r, url: new URL(`/isp/${r.slug}`, site).href, reliable: r.devices >= MIN_DEVICES })),
    latest: latest.map(({ id, lat, lng, ...r }) => r),
  };
  return Response.json(body, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600', 'Access-Control-Allow-Origin': '*' },
  });
};
