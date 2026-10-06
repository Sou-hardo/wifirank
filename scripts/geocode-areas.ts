// One-off: geocode areas via OpenStreetMap Nominatim (1 req/s policy) → data/areas.json.
// Entries already in the file are kept (they were hand-checked); only missing areas are looked up.
// Re-run after adding areas to src/lib/options.ts: node scripts/geocode-areas.ts
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { AREAS } from '../src/lib/options.ts';

// Names that geocode to a same-named shop or a different town need a more specific query.
const QUERY: Record<string, string> = {
  kazipara: 'কাজীপাড়া মেট্রো স্টেশন', nikunja: 'নিকুঞ্জ, খিলক্ষেত, ঢাকা', 'puran-dhaka': 'কোতোয়ালী, ঢাকা',
  turag: 'কামারপাড়া, ঢাকা', wari: 'ওয়ারী, ঢাকা',
};
const bn = (n: number) => String(n).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[+d]);
const out: Record<string, [number, number] | null> = existsSync('data/areas.json') ? JSON.parse(readFileSync('data/areas.json', 'utf8')) : {};
const search = async (q: string) => {
  await new Promise((r) => setTimeout(r, 1100));
  const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=10&viewbox=90.2,24.0,90.6,23.6&bounded=1`, {
    headers: { 'User-Agent': 'wifirank-geocoder/1.0 (one-off area centroid lookup)' },
  });
  return (await res.json()) as { lat: string; lon: string; display_name: string }[];
};

for (const [slug, name] of Object.entries(AREAS)) {
  if (out[slug]) continue;
  const sector = /^Uttara Sector (\d+)$/.exec(name);
  const hits = sector
    ? [...(await search(`সেক্টর ${bn(+sector[1])}, উত্তরা, ঢাকা`)), ...(await search(`Sector ${sector[1]}, Uttara, Dhaka`))]
    : await search(QUERY[slug] ?? `${name.replace(' R/A', '')}, Dhaka, Bangladesh`);
  // For sectors, only accept a hit whose address really is that sector.
  const hit = sector ? hits.find((h) => h.display_name.includes(`সেক্টর ${bn(+sector[1])},`) || h.display_name.includes(`Sector ${sector[1]},`)) : hits[0];
  out[slug] = hit ? [+(+hit.lat).toFixed(4), +(+hit.lon).toFixed(4)] : null;
  console.log(slug.padEnd(20), JSON.stringify(out[slug]), hit?.display_name.slice(0, 80) ?? 'NOT FOUND');
}
writeFileSync('data/areas.json', JSON.stringify(out, null, 1) + '\n');
