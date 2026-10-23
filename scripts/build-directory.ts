// Rebuild from committed research snapshots. Curated names, fields and packages win.
import { readFileSync, writeFileSync } from 'node:fs';
const read = (f: string): any => JSON.parse(readFileSync(`data/sources/${f}.json`, 'utf8'));
const write = (f: string, data: unknown) => writeFileSync(`data/${f}.json`, JSON.stringify(data, null, 2) + '\n');
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const display = (s: string) => s.replace(/^m\s*\/\s*s\.?\s*/i, '').replace(/\s*\(?\b(?:limited|ltd|private|pvt)\b\.?\)?/gi, '').replace(/\s+/g, ' ').trim();
const norm = (s: string) => slug(display(s)).replace(/-/g, '');
const geo = read('geo');
const districts = Object.entries(geo.districts).map(([name, d]: [string, any]) => ({ name, slug: slug(name), ...d }));
const synonyms: Record<string, string> = { comilla: 'cumilla', bogra: 'bogura', jessore: 'jashore', chittagong: 'chattogram', barishal: 'barisal', 'cox s bazar': 'coxsbazar', "cox's bazar": 'coxsbazar' };
const canonical = (s: string) => synonyms[s.toLowerCase()] ?? s.toLowerCase();
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const districtOf = (s: string) => districts.find(d => canonical(d.name) === canonical(s))?.slug;
function locate(parts: string[]) {
  const found = new Set<string>();
  for (const part of parts) {
    const text = ` ${words(part)} `;
    for (const d of districts) {
      const names = [d.name, ...Object.keys(synonyms).filter(k => canonical(k) === canonical(d.name))];
      if (names.some(n => text.includes(` ${words(n)} `))) found.add(d.slug);
    }
    // Upazila names are only resolved as whole locations; substring matching ambiguous names is unsafe.
    const district = geo.upazila_to_district[part.toLowerCase()];
    if (district && districtOf(district)) found.add(districtOf(district)!);
  }
  return [...found].sort();
}
const extracted = Array.from({ length: 10 }, (_, i) => read(`extracted-${i}`)).flat();
const details = read('bdix-detail');
const curated = read('curated-isps');
const packages = read('curated-packages');
const isps: any[] = curated.map((i: any) => ({ ...i, districts: [], licence: 'Unspecified', sources: [] }));
const index = new Map<string, any>();
for (const i of isps) for (const n of [i.name, ...(i.aliases ?? [])]) index.set(norm(n), i);
const used = new Set(isps.map(i => slug(i.name)));
for (const m of read('master')) {
  const scrape = extracted.find((e: any) => e.name === m.name);
  if (scrape?.status === 'not-isp' && !m.existing) continue;
  let i = [m.name, ...m.aliases].map(n => index.get(norm(n))).find(Boolean);
  if (!i) {
    let name = display(m.name) || m.name;
    if (used.has(slug(name))) name = `${name} (${m.locations[0] || isps.length})`;
    i = { name, aliases: [], website: m.site || null, asn: m.asn, districts: [], licence: 'Unspecified' };
    isps.push(i); used.add(slug(name));
  }
  for (const n of [m.name, ...m.aliases]) index.set(norm(n), i);
  i.aliases = [...new Set([...i.aliases, m.name, ...m.aliases])].filter(n => n !== i.name);
  i.sources = [...new Set([...(i.sources ?? []), ...m.sources])];
  i.source ??= m.sources.includes('bdix.app') ? `https://bdix.app${m.bdix_slug ? `/isp/${m.bdix_slug}` : ''}` : 'https://btrc.gov.bd';
  i.licence = [...new Set([...(i.licence === 'Unspecified' ? [] : i.licence.split(', ')), ...m.categories])].join(', ') || 'Unspecified';
  i.nationwide ||= m.categories.includes('Nationwide');
  const detail = details[m.bdix_slug] ?? Object.values(details).find((d: any) => norm(d.name ?? '') === norm(m.name)) as any;
  i.addresses = [...new Set([...(i.addresses ?? []), ...m.addresses, ...(detail?.address?.streetAddress ? [detail.address.streetAddress] : [])])];
  i.districts = [...new Set([...i.districts, ...locate([...m.locations.filter((s: string) => !/division/i.test(s)), ...i.addresses, ...(scrape?.coverage ?? []), detail?.areaServed ?? ''])])].sort();
  if (scrape?.notes) i.notes = [...new Set([...(i.notes ?? []), scrape.notes])];
  i.renewalDates = [...new Set([...(i.renewalDates ?? []), ...m.renewal])];
  const dates = i.renewalDates.filter((s: string) => /^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(s)).map((s: string) => Date.parse(s));
  // Fixed research reference date makes this build deterministic; this is not live licence verification.
  i.possiblyLapsed = i.sources.every((s: string) => s === 'btrc-pdf-2024-12') && dates.length > 0 && Math.max(...dates) < Date.parse('2026-10-24');
  if (!packages[i.name]) {
    const p = scrape?.packages?.length ? scrape : detail;
    const source = scrape && p === scrape ? scrape.packages_source || scrape.site : detail?.url;
    const valid = (p?.packages ?? []).filter((p: any) => Number.isFinite(p.mbps) && p.mbps > 0 && Number.isFinite(p.bdt) && p.bdt > 0);
    if (source && valid.length) packages[i.name] = { source, packages: valid.map((p: any) => ({ name: p.name, mbps: p.mbps, bdt: p.bdt, ...(p.vat && { vat: p.vat }), source })) };
  }
}
for (const i of isps) { i.slug = slug(i.name); if (!i.sources.length && i.source) i.sources = [i.source]; }
// Keep package-level provenance even for the preserved hand-curated packages.
for (const p of Object.values(packages) as any[]) for (const row of p.packages) row.source ??= p.source;
write('isps', isps); write('isp-packages', packages); write('districts', districts.sort((a, b) => a.name.localeCompare(b.name)));
console.log(JSON.stringify({ isps: isps.length, withPackages: isps.filter(i => packages[i.name]?.packages.length).length, packages: Object.values(packages).reduce((n: number, p: any) => n + p.packages.length, 0), districts: districts.length, districtsCovered: new Set(isps.flatMap(i => i.districts)).size }));
