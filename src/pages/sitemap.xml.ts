import type { APIRoute } from 'astro';
import { sql } from '../lib/db';

// Only pages with real data are listed; empty ISP/area pages are noindexed until they have tests.
export const GET: APIRoute = async ({ site }) => {
  const [isps, areas] = await Promise.all([
    sql<{ slug: string; last: Date }[]>`
      select i.slug, max(t.created_at) as last from isps i join tests t on t.isp_id = i.id
      where i.approved and t.flag is null and t.created_at > now() - interval '90 days' group by i.slug`,
    sql<{ area: string; last: Date }[]>`
      select area, max(created_at) as last from tests where flag is null and created_at > now() - interval '90 days' group by area`,
  ]);
  const url = (path: string, last?: Date) =>
    `<url><loc>${new URL(path, site)}</loc>${last ? `<lastmod>${last.toISOString().slice(0, 10)}</lastmod>` : ''}</url>`;
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['/', '/isps', '/map', '/methodology'].map((p) => url(p)).join('\n')}
${areas.map((a) => url(`/area/${a.area}`, a.last)).join('\n')}
${isps.map((i) => url(`/isp/${i.slug}`, i.last)).join('\n')}
</urlset>`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, s-maxage=3600' } });
};
