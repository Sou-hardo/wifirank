import type { APIRoute } from 'astro';

// Everything public is crawlable, including by AI agents; only write endpoints are off-limits.
export const GET: APIRoute = ({ site }) =>
  new Response(`User-agent: *
Allow: /
Disallow: /api/tests
Disallow: /api/reviews
Disallow: /api/turn-creds

Sitemap: ${new URL('/sitemap.xml', site)}
`);
