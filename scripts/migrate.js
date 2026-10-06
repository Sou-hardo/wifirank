// Applies db/schema.sql and upserts the seed ISP list. Safe to re-run.
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

await sql.unsafe(readFileSync('db/schema.sql', 'utf8'));
const isps = JSON.parse(readFileSync('data/isps.json', 'utf8'));
for (const i of isps) {
  await sql`
    insert into isps (name, slug, aliases, website, asn) values (${i.name}, ${slugify(i.name)}, ${i.aliases ?? []}, ${i.website ?? null}, ${i.asn ?? null})
    on conflict (slug) do update set name = excluded.name, aliases = excluded.aliases, website = excluded.website, asn = excluded.asn, approved = true`;
}
console.log(`schema applied, ${isps.length} ISPs seeded`);
await sql.end();
