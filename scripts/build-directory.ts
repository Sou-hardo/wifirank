// Rebuild from committed snapshots: curated > hand-research > extracted > bdix.
import { readFileSync, writeFileSync } from 'node:fs';
const read = (f: string): any => JSON.parse(readFileSync(`data/sources/${f}.json`, 'utf8'));
const write = (f: string, data: unknown) => writeFileSync(`data/${f}.json`, JSON.stringify(data, null, 2) + '\n');
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const display = (s: string) => s.replace(/^m\s*\/\s*s\.?\s*/i, '').replace(/\s*\(?\b(?:limited|ltd|private|pvt)\b\.?\)?/gi, '').replace(/\s+/g, ' ').trim();
const norm = (s: string) => slug(display(s)).replace(/-/g, '');
const geo = read('geo');
const districts = Object.entries(geo.districts).map(([name, d]: [string, any]) => ({ name, slug: slug(name), ...d }));
const synonyms: Record<string, string> = { comilla: 'cumilla', bogra: 'bogura', jessore: 'jashore', chittagong: 'chattogram', chattagram: 'chattogram', barishal: 'barisal', 'cox s bazar': 'coxsbazar', narayangonj: 'narayanganj', narayanganj: 'narayanganj', manikgonj: 'manikganj' };
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const canonical = (s: string) => synonyms[words(s)] ?? words(s);
const districtOf = (s: string) => districts.find(d => canonical(d.name) === canonical(s))?.slug;
const districtNames = districts.map(d => ({ slug: d.slug, names: [...new Set([d.name, canonical(d.name), ...Object.keys(synonyms).filter(k => canonical(k) === canonical(d.name))])].map(words) }));
// The supplied map collapses repeated names and splits some multiword thana names.
// Ambiguous places and generic fragments cannot identify a district alone.
const ambiguousUpazilas = new Set(['sadar', 'kotwali', 'kaliganj', 'kawkhali', 'companiganj', 'harirampur', 'sreepur', 'shibganj', 'pirganj', 'nawabganj', 'daulatpur', 'doulatpur', 'mirpur', 'mohammadpur', 'bandar', 'kachua', 'lohagara', 'durgapur', 'new', 'market', 'shah', 'ali', 'darus', 'salam', 'industrial', 'nagar', 'airport', 'cantonment']);
const upazilas = Object.entries(geo.upazila_to_district).map(([name, district]) => ({ name: words(name), district: districtOf(district as string) })).filter(u => u.district && !ambiguousUpazilas.has(u.name)).map(u => ({ ...u, labelled: new RegExp(`(?:^| )(?:p s|ps|thana|upazila) ${u.name}(?: |$)|(?:^| )${u.name} (?:thana|upazila)(?: |$)`) }));
function locate(parts: string[]) {
  const found = new Set<string>();
  for (const part of parts) {
    const text = ` ${words(part)} `;
    const explicit = districtNames.filter(d => d.names.some(n => text.includes(` ${n} `) && !text.includes(` ${n} division `)));
    for (const d of explicit) found.add(d.slug);
    if (explicit.length) continue;
    // Resolve whole address components or explicitly labelled PS/thana/upazila names,
    // never incidental substrings such as a road or company name.
    const components = part.split(/[,;\n]/).map(words);
    for (const u of upazilas) {
      if (components.some(c => c === u.name || u.labelled.test(c))) found.add(u.district!);
    }
  }
  return [...found].sort();
}
const extracted = Array.from({ length: 10 }, (_, i) => read(`extracted-${i}`)).flat();
const details = read('bdix-detail');
const curated = read('curated-isps');
const packages = read('curated-packages');
const curatedPackageNames = Object.keys(packages);
const hand = read('hand-research');
const [header, ...licences] = csvRows(readFileSync('data/sources/btrc-licensees.csv', 'utf8'));
// The master merged unrelated Sky Net licensees. Reconstruct the two official rows;
// the BDIX Skynet address instead matches Skynet Chowmuhani in Noakhali.
const master = read('master').flatMap((m: any) => {
  if (m.name === 'Sky Net') return licences.filter(row => ['Sky Net', 'Sky Net BD'].includes(row[header.indexOf('name')])).map(row => {
    const get = (key: string) => row[header.indexOf(key)];
    return { ...m, name: get('name'), aliases: [get('name')], categories: [get('cat')], locations: [get('district')],
      addresses: [get('address')], renewal: [get('renewal')], sources: ['btrc-pdf-2024-12'], bdix_slug: '' };
  });
  return m.name === 'Skynet Chowmuhani' ? [{ ...m, bdix_slug: 'skynet' }] : [m];
});
// Brand alias documented in the supplied nationwide research notes.
const velocity = curated.find((i: any) => i.name === 'Velocity Networks');
if (velocity) velocity.aliases = [...new Set([...velocity.aliases, 'Broadband360'])];
const isps: any[] = curated.map((i: any) => ({ ...i, districts: [], licence: 'Unspecified', sources: [] }));
const index = new Map<string, any>();
for (const i of isps) for (const n of [i.name, ...(i.aliases ?? [])]) index.set(norm(n), i);
const used = new Set(isps.map(i => slug(i.name)));
for (const m of master) {
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
  const detail = ['Sky Net', 'Sky Net BD'].includes(m.name) ? undefined : details[m.bdix_slug] ?? Object.values(details).find((d: any) => norm(d.name ?? '') === norm(m.name)) as any;
  i.addresses = [...new Set([...(i.addresses ?? []), ...m.addresses, ...(detail?.address?.streetAddress ? [detail.address.streetAddress] : [])])];
  i.districts = [...new Set([...i.districts, ...locate([...m.locations.filter((s: string) => !/division/i.test(s)), ...i.addresses, ...(scrape?.coverage ?? []), detail?.areaServed ?? ''])])].sort();
  if (scrape?.notes) i.notes = [...new Set([...(i.notes ?? []), scrape.notes])];
  i.renewalDates = [...new Set([...(i.renewalDates ?? []), ...m.renewal])];
  const dates = i.renewalDates.filter((s: string) => /^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(s)).map((s: string) => Date.parse(s));
  // Fixed research reference date makes this build deterministic; this is not live licence verification.
  i.possiblyLapsed = i.sources.every((s: string) => s === 'btrc-pdf-2024-12') && dates.length > 0 && Math.max(...dates) < Date.parse('2026-10-24');
}
// Hand notes may introduce a provider absent from the licence/APNIC master.
for (const h of hand.entries) {
  if (h.publishPackages === false) continue;
  let i = index.get(norm(h.name));
  if (!i) {
    i = { name: h.name, aliases: [], website: /^https?:\/\/(?!github\.com)/.test(h.source) ? h.source : null,
      asn: h.asn ?? null, districts: [], licence: 'Unspecified', sources: [] };
    isps.push(i);
  }
  for (const n of [h.name, ...(h.aliases ?? [])]) index.set(norm(n), i);
  i.aliases = [...new Set([...i.aliases, h.name, ...(h.aliases ?? [])])].filter(n => n !== i.name);
  i.website ||= /^https?:\/\/(?!github\.com)/.test(h.source) ? h.source : null;
  i.asn ??= h.asn ?? null;
  i.source ??= h.source;
  i.sources = [...new Set([...(i.sources ?? []), h.source])];
  i.districts = [...new Set([...i.districts, ...(h.districts ?? [])])].sort();
  i.nationwide ||= h.nationwide === true;
  i.possiblyLapsed = false;
  if (h.note) i.notes = [...new Set([...(i.notes ?? []), h.note])];
  if (h.confidence === 'low') i.notes = [...new Set([...(i.notes ?? []), 'Low-confidence hand research; verify with the provider.'])];
  if (!packages[i.name] && h.packages.length) packages[i.name] = {
    source: h.source, confidence: h.confidence, researchNote: h.researchNote, ...(h.note && { note: h.note }), packages: h.packages,
  };
}
// Fill remaining providers only after curated and hand-researched packages.
for (const kind of ['extracted', 'bdix']) for (const m of master) {
  const i = index.get(norm(m.name));
  if (!i) continue;
  const scrape = extracted.find((e: any) => e.name === m.name);
  const detail = ['Sky Net', 'Sky Net BD'].includes(m.name) ? undefined : details[m.bdix_slug] ?? Object.values(details).find((d: any) => norm(d.name ?? '') === norm(m.name)) as any;
  if (!packages[i.name]) {
    const p = kind === 'extracted' ? (scrape?.status === 'not-isp' ? undefined : scrape) : detail;
    const source = kind === 'extracted' ? scrape?.packages_source || scrape?.site : detail?.url;
    const valid = (p?.packages ?? []).filter((p: any) => Number.isFinite(p.mbps) && p.mbps > 0 && Number.isFinite(p.bdt) && p.bdt > 0);
    if (source && valid.length) packages[i.name] = { source, packages: valid.map((p: any) => ({ name: p.name || `${p.mbps} Mbps`, mbps: p.mbps, bdt: p.bdt, ...(p.vat && { vat: p.vat }), source })) };
  }
}
// The official CSV has resolved district columns missing from some master locations.
function csvRows(text: string) {
  const rows: string[][] = []; let row: string[] = [], value = '', quoted = false;
  for (let n = 0; n < text.length; n++) {
    const c = text[n];
    if (c === '"') { if (quoted && text[n + 1] === '"') { value += '"'; n++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(value); value = ''; }
    else if (c === '\n' && !quoted) { row.push(value.replace(/\r$/, '')); rows.push(row); row = []; value = ''; }
    else value += c;
  }
  if (value || row.length) { row.push(value.replace(/\r$/, '')); rows.push(row); }
  return rows;
}
for (const row of licences) {
  const get = (k: string) => row[header.indexOf(k)] ?? '';
  const i = index.get(norm(get('name')));
  if (!i) continue;
  i.districts = [...new Set([...i.districts, ...locate([get('district'), get('location'), get('address')])])].sort();
}
// Singularize known business nouns only: initials such as SRS, TS and TKS are identities.
const twin = (s: string) => display(s).toLowerCase().replace(/\b(communications|networks|links|services|systems|technologies)\b/g, w => w === 'technologies' ? 'technology' : w.slice(0, -1)).replace(/[^a-z0-9]/g, '');
const curatedNames = new Set(curated.map((c: any) => c.name));
const mergedPairs: string[] = [];
for (const a of [...isps]) {
  if (!isps.includes(a)) continue;
  const b = isps.find((o: any) => o !== a && twin(o.name) === twin(a.name) && (!o.asn || !a.asn || o.asn === a.asn) && (!o.districts.length || !a.districts.length || o.districts.some((d: string) => a.districts.includes(d))));
  if (!b || (curatedNames.has(a.name) && curatedNames.has(b.name))) continue;
  // Preserve the curated identity and tariffs; otherwise prefer packages, then ASN.
  const priority = (i: any) => (curatedNames.has(i.name) ? 8 : 0) + (curatedPackageNames.includes(i.name) ? 4 : 0) + (packages[i.name] ? 2 : 0) + (i.asn ? 1 : 0);
  const [keep, drop] = priority(b) > priority(a) ? [b, a] : [a, b];
  mergedPairs.push(`${drop.name} -> ${keep.name}`);
  keep.aliases = [...new Set([...keep.aliases, drop.name, ...drop.aliases])].filter((n: string) => n !== keep.name);
  for (const k of ['asn', 'website', 'source'] as const) keep[k] ??= drop[k];
  for (const k of ['districts', 'sources', 'addresses', 'renewalDates', 'notes']) if (drop[k]) keep[k] = [...new Set([...(keep[k] ?? []), ...drop[k]])].sort();
  keep.licence = [...new Set([...keep.licence.split(', '), ...drop.licence.split(', ')].filter((l: string) => l !== 'Unspecified'))].join(', ') || 'Unspecified';
  keep.nationwide ||= drop.nationwide; keep.possiblyLapsed &&= drop.possiblyLapsed;
  if (packages[drop.name] && !packages[keep.name]) packages[keep.name] = packages[drop.name];
  delete packages[drop.name];
  isps.splice(isps.indexOf(drop), 1);
}
console.log('Merged twins:', mergedPairs);
const accessTypes = read('access-types');
for (const i of isps) {
  i.slug = slug(i.name);
  const access = accessTypes[i.slug];
  if (access) {
    i.accessType = access.type;
    i.aliases = [...new Set([...i.aliases, ...(access.aliases ?? [])])];
  }
  if (!i.sources.length && i.source) i.sources = [i.source];
}
// Keep package-level provenance even for the preserved hand-curated packages.
for (const p of Object.values(packages) as any[]) for (const row of p.packages) row.source ??= p.source;
const orderedPackages = Object.fromEntries([...new Set([...curatedPackageNames, ...isps.map(i => i.name)])].filter(name => packages[name]).map(name => [name, packages[name]]));
write('isps', isps); write('isp-packages', orderedPackages); write('districts', districts.sort((a, b) => a.name.localeCompare(b.name)));
console.log(JSON.stringify({ isps: isps.length, withPackages: isps.filter(i => packages[i.name]?.packages.length).length, packages: Object.values(packages).reduce((n: number, p: any) => n + p.packages.length, 0), withoutDistrict: isps.filter(i => !i.districts.length).length, withoutDistrictOrNationwide: isps.filter(i => !i.districts.length && !i.nationwide).length, districts: districts.length, districtsCovered: new Set(isps.flatMap(i => i.districts)).size }));

// Licence scope is a conservative warning signal, not proof of a transit relationship.
// Any shared ASN is ambiguous too: it must never select an arbitrary provider.
const upstreams = [...new Set(isps.filter(i => i.asn && /Nationwide|Divisional|IIG|Transit/i.test(i.licence)).map(i => i.asn))].sort((a, b) => a - b);
write('upstream-asns', upstreams);
console.log(`Upstream candidate ASNs: ${upstreams.length}`);
