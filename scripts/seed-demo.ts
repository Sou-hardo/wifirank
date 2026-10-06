// Fake tests + reviews for designing the UI locally. Refuses to run against a non-local database.
// Run: node --env-file=.env scripts/seed-demo.ts
import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const url = process.env.DATABASE_URL ?? '';
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error('seed-demo only runs against a local database');
const sql = postgres(url, { prepare: false });
const areas: Record<string, [number, number]> = JSON.parse(readFileSync('data/areas.json', 'utf8'));
const isps = await sql<{ id: number }[]>`select id from isps where approved order by id limit 30`;

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const comments = ['Stable most of the day, slows down after 9 pm.', 'Support picks up fast, fixed my line in a day.', 'YouTube is smooth even at night.',
  'Frequent outages during rain.', 'Fair price for the speed.', 'Low ping, good for gaming.', null, null, null];

// Peak tests land 20:00–23:59 Dhaka (UTC+6), the rest during the day.
const at = (peak: boolean) => {
  const d = new Date(Date.now() - Math.ceil(rnd() * 60) * 864e5);
  d.setUTCHours(peak ? 14 + Math.floor(rnd() * 4) : 2 + Math.floor(rnd() * 11), Math.floor(rnd() * 60));
  return d;
};
const slugs = Object.keys(areas).filter(() => rnd() < 0.55);
const rows: any[] = [];
for (const area of slugs) {
  const local = isps.slice(0, 30).filter(() => rnd() < 0.3);
  for (const { id } of local) {
    const quality = 0.4 + rnd() * 1.2;
    const devices = 1 + Math.floor(rnd() ** 2 * 14);
    for (let d = 0; d < devices; d++) {
      const dev = crypto.randomUUID();
      const plan = pick([20, 30, 40, 50, 60, 80, 100]);
      const [lat, lng] = areas[area];
      const peak = rnd() < 0.35;
      const down = plan * quality * (peak ? 0.6 : 1) * (0.7 + rnd() * 0.4);
      rows.push({
        device_id: dev, isp_id: id, area, connection: pick(['cable', 'wifi5', 'wifi24', 'wifi']),
        plan: plan <= 20 ? '10-20' : plan <= 40 ? '20-40' : plan <= 60 ? '40-60' : '60-100', price: pick(['500-800', '800-1200', '1200-2000']),
        ...(rnd() < 0.5
          ? { lat: Math.round((lat + (rnd() - 0.5) * 0.012) * 200) / 200, lng: Math.round((lng + (rnd() - 0.5) * 0.012) * 200) / 200 }
          : { lat: null, lng: null }),
        local_down: down, local_up: down * (0.8 + rnd() * 0.2), local_ping: 3 + rnd() * 9, local_jitter: 1 + rnd() * 6, local_loss: rnd() * 0.01,
        ip_hash: 'demo', created_at: at(peak),
      });
    }
  }
}
for (let i = 0; i < rows.length; i += 500) await sql`insert into tests ${sql(rows.slice(i, i + 500))}`;
const reviewers = rows.filter(() => rnd() < 0.35);
for (const r of reviewers) {
  await sql`insert into reviews (device_id, isp_id, stars, comment) values (${r.device_id}, ${r.isp_id}, ${1 + Math.floor(rnd() * 5)}, ${pick(comments)}) on conflict do nothing`;
}
console.log(`seeded ${rows.length} tests across ${slugs.length} areas, ${reviewers.length} reviews`);
await sql.end();
