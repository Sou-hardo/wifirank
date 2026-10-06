import type { Sql } from 'postgres';
import { AREA_COORDS } from './areas';
import { AREAS } from './options';
import { byArea, recent } from './stats';

export type MapArea = { slug: string; name: string; lat: number; lng: number; devices: number;
  local_down: number | null; local_up: number | null; local_ping: number | null };
export type MapPoint = { lat: number; lng: number; isp: string; area: string; local_down: number | null; local_up: number | null; local_ping: number | null; at: string };

// Every listed area (so empty ones still show as "no tests yet") plus individual pinned results.
export async function mapData(sql: Sql, ispSlug?: string | null) {
  const [isp] = ispSlug ? await sql<{ id: number; name: string; slug: string }[]>`select id, name, slug from isps where slug = ${ispSlug} and approved` : [];
  const [stats, pts] = await Promise.all([
    byArea(sql, { ispId: isp?.id }),
    recent(sql, { ispId: isp?.id, limit: 2000, located: true }),
  ]);
  const by = new Map(stats.map((r) => [r.area, r]));
  const areas: MapArea[] = Object.entries(AREA_COORDS).map(([slug, [lat, lng]]) => {
    const r = by.get(slug);
    return { slug, name: AREAS[slug], lat, lng, devices: r?.devices ?? 0, local_down: r?.local_down ?? null, local_up: r?.local_up ?? null, local_ping: r?.local_ping ?? null };
  });
  const points: MapPoint[] = pts.map((p) => ({ lat: p.lat!, lng: p.lng!, isp: p.isp, area: p.area, local_down: p.local_down, local_up: p.local_up, local_ping: p.local_ping, at: p.created_at.toISOString() }));
  return { isp: isp ? { name: isp.name, slug: isp.slug } : null, areas, points };
}
