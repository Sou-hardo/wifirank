import type { Sql } from 'postgres';
import { CROWD, qualifies } from './detection.ts';

// One vote per IP hash per pair: the latest choice wins, so repeated tests cannot
// manufacture a majority. The (asn, district, created_at) index bounds this scan.
export async function crowdSuggestion(sql: Sql, asn: number, district: string) {
  const [pick] = await sql<{ id: number; name: string; ips: number; total: number }[]>`
    with votes as (
      select distinct on (ip_hash) ip_hash, isp_id
      from tests
      where asn = ${asn} and district = ${district}
        and created_at > now() - make_interval(days => ${CROWD.days})
        and flag is null
      order by ip_hash, created_at desc, id desc
    ), counts as (
      select isp_id, count(*)::int as ips from votes group by isp_id
    ), ranked as (
      select *, sum(ips) over ()::int as total from counts
    )
    select i.id, i.name, r.ips, r.total from ranked r join isps i on i.id = r.isp_id
    where i.approved order by r.ips desc, i.id limit 1`;
  return pick && qualifies(pick.ips, pick.total)
    ? { id: pick.id, name: pick.name, reason: `${pick.ips} independent IPs chose this ISP in your district in the last ${CROWD.days} days` }
    : null;
}

const cache = new Map<string, { until: number; value: Awaited<ReturnType<typeof crowdSuggestion>> }>();
export async function cachedSuggestion(sql: Sql, asn: number, district: string) {
  const key = `${asn}:${district}`, hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const value = await crowdSuggestion(sql, asn, district);
  if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
  cache.set(key, { until: Date.now() + CROWD.cacheMs, value });
  return value;
}
