// Type-only imports, so scripts/check.ts can run this under plain node.
// Each device counts once: per-device median first, then median across devices.
import type { Sql } from 'postgres';

export const METRICS = ['local_down', 'local_up', 'local_ping', 'local_jitter', 'local_loss'] as const;
export type Metric = (typeof METRICS)[number];
export type Row = Record<Metric, number | null> & { devices: number; tests: number };

const median = (col: string) => `percentile_cont(0.5) within group (order by ${col})`;
const perDevice = METRICS.map((m) => `${median(m)} as ${m}`).join(', ');
const acrossDevices = METRICS.map((m) => `${median(m)}::real as ${m}`).join(', ');

// Below this many distinct devices, stats are greyed out and not ranked.
export const MIN_DEVICES = 5;

type Filter = { area?: string | null; plan?: string | null; ispId?: number | null; peak?: boolean | null };

// Peak = 20:00–23:59 Dhaka time, when congestion shows.
function where(sql: Sql, f: Filter) {
  return sql`
    t.flag is null and t.created_at > now() - interval '90 days'
    ${f.area ? sql`and t.area = ${f.area}` : sql``}
    ${f.plan ? sql`and t.plan = ${f.plan}` : sql``}
    ${f.ispId ? sql`and t.isp_id = ${f.ispId}` : sql``}
    ${f.peak == null ? sql`` : sql`and (extract(hour from t.created_at at time zone 'Asia/Dhaka') >= 20) = ${f.peak}`}`;
}

export async function leaderboard(sql: Sql, f: Filter & { sort?: string | null } = {}) {
  const sort = (METRICS as readonly string[]).includes(f.sort ?? '') ? f.sort! : 'local_down';
  const dir = /ping|jitter|loss/.test(sort) ? 'asc' : 'desc';
  return sql<(Row & { name: string; slug: string; rating: number | null; reviews: number })[]>`
    with dev as (
      select t.isp_id, t.device_id, count(*) as n, ${sql.unsafe(perDevice)}
      from tests t where ${where(sql, f)}
      group by t.isp_id, t.device_id
    ), agg as (
      select isp_id, count(*)::int as devices, sum(n)::int as tests, ${sql.unsafe(acrossDevices)}
      from dev group by isp_id
    ), r as (
      select isp_id, count(*)::int as reviews, sum(stars)::real as total from reviews where not hidden group by isp_id
    ), prior as (select coalesce(avg(stars), 3)::real as m from reviews where not hidden)
    select i.name, i.slug, agg.*, coalesce(r.reviews, 0) as reviews,
      -- Bayesian average: 5 phantom reviews at the site-wide mean
      case when r.reviews > 0 then ((5 * prior.m + r.total) / (5 + r.reviews))::real end as rating
    from agg join isps i on i.id = agg.isp_id left join r on r.isp_id = agg.isp_id cross join prior
    order by agg.devices >= ${MIN_DEVICES} desc, ${sql.unsafe(`agg.${sort} ${dir}`)} nulls last, agg.devices desc`;
}

export async function byArea(sql: Sql, f: Filter) {
  return sql<(Row & { area: string })[]>`
    with dev as (
      select t.area, t.device_id, count(*) as n, ${sql.unsafe(perDevice)}
      from tests t where ${where(sql, f)}
      group by t.area, t.device_id
    )
    select area, count(*)::int as devices, sum(n)::int as tests, ${sql.unsafe(acrossDevices)}
    from dev group by area order by devices desc`;
}

// Individual results for the map and "latest results" feed. Coordinates are already ~500 m rounded.
export async function recent(sql: Sql, f: Filter & { limit: number; located?: boolean }) {
  return sql<{ id: number; isp: string; slug: string; area: string; lat: number | null; lng: number | null; connection: string;
    local_down: number | null; local_up: number | null; local_ping: number | null; created_at: Date }[]>`
    select t.id, i.name as isp, i.slug, t.area, t.lat, t.lng, t.connection, t.local_down, t.local_up, t.local_ping, t.created_at
    from tests t join isps i on i.id = t.isp_id
    where ${where(sql, f)} and i.approved ${f.located ? sql`and t.lat is not null` : sql``}
    order by t.created_at desc limit ${f.limit}`;
}

export async function summary(sql: Sql, f: Filter) {
  const [row] = await leaderboard(sql, f);
  return row ?? null;
}
