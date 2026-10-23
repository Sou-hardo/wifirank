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
console.log('directory ok');
