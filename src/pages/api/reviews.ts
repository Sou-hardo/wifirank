import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';
import { PRICES } from '../../lib/options';

// Post-test feedback: stars (+ optional comment) and/or the monthly bill. Each part is optional.
export const POST: APIRoute = async ({ request }) => {
  const b = await request.json().catch(() => null);
  const stars = b?.stars ?? null;
  const price = b?.price in PRICES ? b.price : null;
  if (stars != null && (!Number.isInteger(stars) || stars < 1 || stars > 5)) return Response.json({ error: 'Pick 1–5 stars' }, { status: 400 });
  if (!stars && !price) return Response.json({ error: 'Add a rating or your monthly bill' }, { status: 400 });

  if (price) {
    // Only the device that ran the test may fill in its bill.
    const rows = await sql`update tests set price = ${price} where id = ${b.testId} and device_id = ${b.deviceId}::uuid returning 1`.catch(() => []);
    if (!rows.length) return Response.json({ error: 'Run a speed test first' }, { status: 403 });
  }
  if (stars) {
    const comment = typeof b.comment === 'string' ? b.comment.trim().slice(0, 1000) || null : null;
    // Only devices that ran a test on this ISP may review it; one editable review per device per ISP.
    const rows = await sql`
      insert into reviews (device_id, isp_id, stars, comment)
      select device_id, isp_id, ${stars}, ${comment} from tests
      where device_id = ${b.deviceId}::uuid and isp_id = ${b.ispId} limit 1
      on conflict (device_id, isp_id) do update set stars = excluded.stars, comment = excluded.comment, updated_at = now()
      returning 1`.catch(() => []);
    if (!rows.length) return Response.json({ error: 'Run a speed test for this ISP first' }, { status: 403 });
  }
  return Response.json({ ok: true });
};
