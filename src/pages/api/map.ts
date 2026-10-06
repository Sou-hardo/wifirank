import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';
import { mapData } from '../../lib/mapData';

export const GET: APIRoute = async ({ url }) =>
  Response.json(await mapData(sql, url.searchParams.get('isp')), {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600', 'Access-Control-Allow-Origin': '*' },
  });
