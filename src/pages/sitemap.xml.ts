import { PROVIDERS, DISTRICTS } from '../lib/directory';
import type { APIRoute } from 'astro';
import { sql } from '../lib/db';

// Directory profiles and districts are useful before speed tests exist.
export const GET: APIRoute = async ({ site }) => {
  const areas = await sql<{ area: string; last: Date }[]>`
    select area, max(created_at) as last from tests where flag is null and created_at > now() - interval '90 days' group by area`;
  const url = (path: string, last?: Date) =>
    `<url><loc>${new URL(path, site)}</loc>${last ? `<lastmod>${last.toISOString().slice(0, 10)}</lastmod>` : ''}</url>`;
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${['/', '/isps', '/map', '/methodology'].map((p) => url(p)).join('\n')}
${areas.map((a) => url(`/area/${a.area}`, a.last)).join('\n')}
${PROVIDERS.map((i) => url(`/isp/${i.slug}`)).join('\n')}
${DISTRICTS.map((d) => url(`/district/${d.slug}`)).join('\n')}
</urlset>`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, s-maxage=3600' } });
};
