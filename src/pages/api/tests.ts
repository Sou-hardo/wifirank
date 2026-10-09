import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';
import { hashIp, lookup } from '../../lib/network';
import { AREAS, CONNECTIONS, PLANS, slugify } from '../../lib/options';
import { summary } from '../../lib/stats';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? v : null);
// Snap to a 0.005° (~500 m) grid; anything outside Bangladesh's bounding box is dropped.
const grid = (v: unknown, lo: number, hi: number) =>
  typeof v === 'number' && v >= lo && v <= hi ? Math.round(v * 200) / 200 : null;
const bad = (msg: string, status = 400) => Response.json({ error: msg }, { status });

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const b = await request.json().catch(() => null);
  if (!b || !UUID.test(b.deviceId)) return bad('Invalid request');
  if (!(b.area in AREAS)) return bad('Pick an area');
  if (!(b.connection in CONNECTIONS)) return bad('Pick a connection type');
  const plan = b.plan in PLANS ? b.plan : null;
  const l = b.local ?? {};
  const local = [num(l.down, 1e4), num(l.up, 1e4), num(l.ping, 1e4), num(l.jitter, 1e4), num(l.loss, 1)];
  if (local[0] == null) return bad('No speed results');

  const ipHash = hashIp(clientAddress);
  const [recent] = await sql`
    select count(*) filter (where device_id = ${b.deviceId} and created_at > now() - interval '1 minute')::int as dev,
           count(*) filter (where ip_hash = ${ipHash})::int as ip
    from tests where created_at > now() - interval '1 hour' and (device_id = ${b.deviceId} or ip_hash = ${ipHash})`;
  if (recent.dev > 0 || recent.ip >= 30) return bad('Too many tests, try again later', 429);

  let ispId: number | null = null;
  if (Number.isInteger(b.ispId)) {
    [{ id: ispId } = { id: null }] = await sql`select id from isps where id = ${b.ispId}`;
  } else if (typeof b.ispName === 'string') {
    const name = b.ispName.trim().replace(/\s+/g, ' ').slice(0, 60);
    const slug = slugify(name);
    if (slug.length < 2) return bad('Enter your ISP name');
    // Matches an existing name/alias case-insensitively, else adds it unapproved (hidden until reviewed).
    [{ id: ispId }] = await sql`
      with hit as (
        select id from isps where slug = ${slug} or lower(${name}) = any(select lower(a) from unnest(aliases) a) limit 1
      ), ins as (
        insert into isps (name, slug, approved) select ${name}, ${slug}, false where not exists (select 1 from hit) returning id
      ) select id from hit union all select id from ins`;
  }
  if (!ispId) return bad('Pick your ISP');

  const net = await lookup(clientAddress);
  const [row] = await sql`
    insert into tests (device_id, isp_id, area, lat, lng, connection, plan,
      local_down, local_up, local_ping, local_jitter, local_loss,
      ip_hash, asn, as_org, country, flag)
    values (${b.deviceId}, ${ispId}, ${b.area}, ${grid(b.lat, 20, 27)}, ${grid(b.lng, 88, 93)}, ${b.connection}, ${plan},
      ${local[0]}, ${local[1]}, ${local[2]}, ${local[3]}, ${local[4]},
      ${ipHash}, ${net.asn}, ${net.as_org}, ${net.country}, ${net.flag})
    returning id`;
  // How this result compares with everyone else on the same ISP in the same area.
  const peer = net.flag ? null : await summary(sql, { ispId, area: b.area });
  return Response.json({
    id: row.id, ispId, flag: net.flag, asOrg: net.as_org,
    peer: peer && { devices: peer.devices, local_down: peer.local_down },
  });
};
