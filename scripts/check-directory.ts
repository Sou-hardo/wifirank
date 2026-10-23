import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p: string) => JSON.parse(readFileSync(`data/${p}.json`, 'utf8'));
const isps = read('isps'), districts = read('districts'), packages = read('isp-packages');
assert.equal(districts.length, 64);
assert.equal(new Set(isps.map((i: any) => i.slug)).size, isps.length);
for (const i of read('sources/curated-isps')) {
  const actual = isps.find((p: any) => p.name === i.name);
  assert.ok(actual, i.name);
  for (const key of Object.keys(i)) if (key !== 'aliases') assert.deepEqual(actual[key], i[key], `${i.name}.${key}`);
  for (const alias of i.aliases ?? []) assert.ok(actual.aliases.includes(alias));
}
for (const [name, data] of Object.entries(read('sources/curated-packages')) as any) {
  assert.equal(packages[name].source, data.source);
  assert.deepEqual(packages[name].packages.map(({ source, ...p }: any) => p), data.packages);
}
for (const i of isps) for (const d of i.districts) assert.ok(districts.some((p: any) => p.slug === d));
for (const data of Object.values(packages) as any[]) for (const p of data.packages) {
  assert.ok(p.mbps > 0 && p.bdt > 0);
  assert.match(p.source, /^https?:\/\//);
}
assert.ok(isps.find((i: any) => i.name === 'Help Line').districts.includes('bogura'));
assert.ok(isps.find((i: any) => i.name === 'Skynet Broadband Service'));
assert.ok(isps.find((i: any) => i.name === 'Skynet Chowmuhani'));
// Regressions for the omitted hand-research layer and the unrelated Sky Net licences.
assert.deepEqual(isps.find((i: any) => i.name === 'Sky Net').districts, ['dhaka']);
assert.deepEqual(isps.find((i: any) => i.name === 'Sky Net BD').districts, ['khulna']);
assert.ok(!packages['Sky Net'] && !packages['Sky Net BD']);
assert.ok(isps.find((i: any) => i.name === 'Skynet Chowmuhani').addresses.every((s: string) => !/Khulna|Mirpur/.test(s)));
assert.ok(packages['Plus Net BD'].packages.some((p: any) => p.name === 'Cumilla Basic' && p.mbps === 80 && p.bdt === 1000));
assert.deepEqual(packages['Velocity Networks'].packages.map((p: any) => [p.mbps, p.bdt]), [[60, 1111], [110, 1999], [150, 3333], [200, 4222]]);
assert.equal(packages['Touch Online'].packages.length, 5);
assert.equal(packages['Habiganj Net Communications'].packages.length, 6);
assert.ok(isps.find((i: any) => i.aliases.includes('ArrowNet')).districts.includes('sylhet'));
assert.ok(isps.find((i: any) => i.name === 'CDC Internet').nationwide);
assert.ok(isps.find((i: any) => i.name === 'Qubee'));
assert.ok(!packages['CDC Internet'] && !packages.Qubee);
assert.equal(packages['Bograinfo.com'].confidence, 'low');
// District aliases, conservative address lookup, and ASN-aware twin regressions.
for (const [name, district] of [['Amazing Online', 'comilla'], ['AT Link', 'narayanganj'], ['Bondhu IT Zone', 'manikganj'], ['Moheshpur Telecom', 'jhenaidah']]) {
  assert.ok(isps.find((i: any) => i.name === name).districts.includes(district), name);
}
assert.deepEqual(isps.find((i: any) => i.name === 'Comilla Cable Tv Online Chattogram Division').districts, ['comilla']);
const mazeda = isps.find((i: any) => i.name === 'Mazeda Networks');
assert.equal(mazeda.asn, 63996);
assert.ok(mazeda.aliases.includes('Mazeda Network'));
assert.ok(!isps.some((i: any) => i.name === 'Mazeda Network') && !packages['Mazeda Network']);
for (const [a, b] of [['Speed Link', 'Speed Links'], ['Ideal Communication', 'Ideal Communications'], ['SR Communication', 'SRS Communication'], ['T Network', 'TS Network'], ['T.K. Network', 'TKS Network']]) {
  assert.ok(isps.some((i: any) => i.name === a) && isps.some((i: any) => i.name === b), `${a} != ${b}`);
}
// The Broadband360 notes name no districts; do not turn "18 district cities" into coverage.
assert.deepEqual(isps.find((i: any) => i.name === 'Velocity Networks').districts, []);
console.log('directory ok');

const upstreams = read('upstream-asns');
assert.ok(!upstreams.includes(59340), 'Help Line (59340) must autofill');
assert.deepEqual(upstreams, [...new Set(isps.filter((i: any) => i.asn && /Nationwide|IIG|Transit/i.test(i.licence)).map((i: any) => i.asn))].sort((a: any, b: any) => a - b));
assert.equal(isps.find((i: any) => i.slug === 'gpfi').accessType, 'fixed_wireless');
assert.equal(isps.find((i: any) => i.slug === 'gpfi').tech, 'fwa');
assert.notEqual(isps.find((i: any) => i.slug === 'starlink')?.tech, 'fwa');
assert.ok(isps.find((i: any) => i.slug === 'gpfi').aliases.includes('Grameenphone gpfi'));
assert.ok(packages.gpfi.packages.length > 0);
