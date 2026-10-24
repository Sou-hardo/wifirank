import type { Sql } from 'postgres';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Post-test feedback: stars (+ optional comment) and/or the monthly bill in ৳. Each part is optional.
export async function postReview(sql: Sql, request: Request) {
  const b = await request.json().catch(() => null);
  if (!b || !UUID.test(b.deviceId) || !/^[1-9][0-9]*$/.test(String(b.testId)) || !Number.isInteger(b.ispId)) return Response.json({ error: 'Invalid request' }, { status: 400 });
  const stars = b?.stars ?? null;
  const price = Number.isInteger(b?.price) && b.price >= 100 && b.price <= 100000 ? String(b.price) : null; // ৳ per month
  if (b?.price != null && !price) return Response.json({ error: 'Enter a monthly bill between ৳100 and ৳1,00,000' }, { status: 400 });
  if (stars != null && (!Number.isInteger(stars) || stars < 1 || stars > 5)) return Response.json({ error: 'Pick 1–5 stars' }, { status: 400 });
  if (!stars && !price) return Response.json({ error: 'Add a rating or your monthly bill' }, { status: 400 });

  const [previous] = stars ? await sql`select stars, comment, name from reviews where device_id = ${b.deviceId}::uuid and isp_id = ${b.ispId}` : [];
  if (price) {
    // Only the device that ran the test may fill in its bill.
    const rows = await sql`update tests set price = ${price} where id = ${b.testId} and device_id = ${b.deviceId}::uuid returning 1`.catch(() => []);
    if (!rows.length) return Response.json({ error: 'Run a speed test first' }, { status: 403 });
  }
  let name: string | null = null; // the pseudonym the review is published under
  if (stars) {
    const comment = typeof b.comment === 'string' ? b.comment.trim().slice(0, 1000) || null : null;
    // Only devices that ran a test on this ISP may review it; one editable review per device per ISP.
    const rows = await sql`
      insert into reviews (device_id, isp_id, stars, comment)
      select device_id, isp_id, ${stars}, ${comment} from tests
      where device_id = ${b.deviceId}::uuid and isp_id = ${b.ispId} limit 1
      on conflict (device_id, isp_id) do update set stars = excluded.stars, comment = excluded.comment, updated_at = now()
      returning name`.catch(() => []);
    if (!rows.length) return Response.json({ error: 'Run a speed test for this ISP first' }, { status: 403 });
    name = rows[0].name;
  }
  return Response.json({ ok: true, name, previous: previous ?? null });
}

// Undo a new rating; an existing rating is restored through POST's normal update path.
export async function deleteReview(sql: Sql, request: Request) {
  const b = await request.json().catch(() => null);
  if (!b || !UUID.test(b.deviceId) || !Number.isInteger(b.ispId)) return Response.json({ error: 'Invalid request' }, { status: 400 });
  await sql`delete from reviews where device_id = ${b.deviceId}::uuid and isp_id = ${b.ispId}`;
  return Response.json({ ok: true });
}
