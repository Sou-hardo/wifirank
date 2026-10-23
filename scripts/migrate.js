// Applies db/schema.sql and upserts the seed ISP list. Safe to re-run.
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

await sql.unsafe(readFileSync('db/schema.sql', 'utf8'));
const isps = JSON.parse(readFileSync('data/isps.json', 'utf8'));
for (const i of isps) {
  await sql`
    insert into isps (name, slug, aliases, website, asn, access_type) values (${i.name}, ${i.slug ?? slugify(i.name)}, ${i.aliases ?? []}, ${i.website ?? null}, ${i.asn ?? null}, ${i.accessType ?? null})
    on conflict (slug) do update set name = excluded.name, aliases = excluded.aliases, website = excluded.website, asn = excluded.asn, access_type = excluded.access_type, approved = true`;
}
// Backfill only known legacy area options, leaving unknown historical areas unassigned.
const districts = JSON.parse(readFileSync('data/districts.json', 'utf8')).map(d => d.slug);
await sql`update tests set district = area where district is null and area = any(${districts})`;
// Prior to nationwide locations, every remaining valid area was a Dhaka neighbourhood.
const { AREAS, districtForArea } = await import('../src/lib/options.ts');
for (const area of Object.keys(AREAS).filter(a => !districts.includes(a))) {
  await sql`update tests set district = ${districtForArea(area)} where district is null and area = ${area}`;
}
console.log(`schema applied, ${isps.length} ISPs seeded`);
await sql.end();
