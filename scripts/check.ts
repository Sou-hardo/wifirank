// Self-check for the stats aggregation, against a throwaway in-memory Postgres (PGlite).
// Run: npm run check
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { leaderboard, byArea, summary, recent } from '../src/lib/stats.ts';
import { providerChoice, qualifies, classifyAccess } from '../src/lib/detection.ts';
import { crowdSuggestion } from '../src/lib/crowd.ts';
import { districtForArea } from '../src/lib/options.ts';
import { sustainedMbps } from '../src/lib/sustained.ts';

const detected = { isp: { id: 1, name: 'Alpha' }, upstream: false, flag: null, suggested: null };
assert.deepEqual(providerChoice({ name: '' }, detected), detected.isp);
assert.deepEqual(providerChoice({ name: '' }, { ...detected, upstream: true }), { name: '' });
assert.deepEqual(providerChoice({ name: 'My reseller' }, detected), { name: 'My reseller' });
assert.deepEqual(providerChoice({ name: '' }, detected, true), { name: '' }); // user cleared text
assert.deepEqual(providerChoice({ name: '' }, { ...detected, suggested: { id: 2, name: 'Beta', reason: 'crowd' } }), { name: '' });
assert.equal(qualifies(2, 2), false);
assert.equal(qualifies(3, 6), true);
assert.equal(qualifies(3, 7), false);
assert.deepEqual(classifyAccess('mobile_data', 'fwa', true), { flag: null, accessType: 'fixed_wireless' });
assert.deepEqual(classifyAccess('mobile_data', null, true), { flag: 'mobile_data', accessType: 'fixed_line' }); // declaration cannot turn a non-FWA ISP into FWA
assert.deepEqual(classifyAccess('mobile_data', 'fwa', false), { flag: 'mobile_data', accessType: 'fixed_line' }); // unchecked declaration remains excluded
assert.deepEqual(classifyAccess('mobile_data', 'fixed_wireless', true), { flag: 'mobile_data', accessType: 'fixed_line' }); // access type alone is not FWA metadata
assert.deepEqual(classifyAccess('foreign_ip', 'fwa', true), { flag: 'foreign_ip', accessType: 'fixed_wireless' }); // non-mobile flags remain excluded
assert.equal(districtForArea('mirpur-10'), 'dhaka');
assert.equal(districtForArea('bogura'), 'bogura');
assert.equal(districtForArea('unknown'), null);

// Sustained speed: short bursts are ignored, the median of loaded requests is reported.
const pt = (bytes: number, mbps: number, duration: number) => ({ bytes, bps: mbps * 1e6, duration });
assert.equal(sustainedMbps([pt(1e5, 20, 30), pt(1e6, 173, 80), pt(1e6, 160, 85), pt(1e7, 100, 800), pt(1e7, 90, 900), pt(2.5e7, 98, 2000)]), 98);
assert.equal(sustainedMbps([pt(1e5, 20, 30), pt(1e6, 150, 60), pt(1e6, 170, 55)]), 160); // nothing loaded yet: largest size so far
assert.equal(sustainedMbps([]), null);

const server = new PGLiteSocketServer({ db: await PGlite.create(), port: 54329 });
await server.start();
const sql = postgres('postgres://postgres@127.0.0.1:54329/postgres', { prepare: false, max: 1 });
try {
  await sql.unsafe(readFileSync('db/schema.sql', 'utf8'));
  await sql`insert into isps (name, slug) values ('Alpha', 'alpha'), ('Beta', 'beta')`;
  const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b', C = '00000000-0000-0000-0000-00000000000c';
  const t = (dev: string, isp: number, down: number, opts: { flag?: string; fwa?: boolean; hour?: number; area?: string } = {}) => sql`
    insert into tests (device_id, isp_id, area, connection, local_down, ip_hash, flag, access_type, created_at)
    values (${dev}, ${isp}, ${opts.area ?? 'mirpur-10'}, 'cable', ${down}, 'x', ${opts.flag ?? null}, ${opts.fwa ? 'fixed_wireless' : 'fixed_line'},
      date_trunc('day', now() at time zone 'Asia/Dhaka') at time zone 'Asia/Dhaka' - interval '1 day' + make_interval(hours => ${opts.hour ?? 10}))`;

  // Device A spams 10 slow runs; B and C one fast run each. Per-device collapse → median of [10, 50, 60] = 50.
  for (let i = 0; i < 10; i++) await t(A, 1, 10);
  await t(B, 1, 50, { hour: 21 });
  await t(C, 1, 60, { area: 'banani' });
  await t(C, 1, 1000, { flag: 'mobile_data', fwa: true }); // even flagged FWA rows are ignored unless declaration reclassifies them
  await t(A, 2, 100);

  const rows = await leaderboard(sql, {});
  const alpha = rows.find((r) => r.slug === 'alpha')!;
  assert.equal(alpha.devices, 3);
  assert.equal(alpha.tests, 12);
  assert.equal(alpha.local_down, 50);
  assert.equal(rows[0].slug, 'beta'); // faster, both under MIN_DEVICES

  assert.equal((await leaderboard(sql, { area: 'banani' })).length, 1);
  assert.equal((await summary(sql, { ispId: 1, peak: true }))?.local_down, 50);
  assert.equal((await summary(sql, { ispId: 1, peak: false }))?.devices, 2);
  assert.deepEqual((await byArea(sql, { ispId: 1 })).map((r) => [r.area, r.devices]), [['mirpur-10', 2], ['banani', 1]]);

  assert.equal((await recent(sql, { limit: 5 })).length, 5);
  assert.equal((await recent(sql, { limit: 50, area: 'banani' })).length, 1); // flagged one excluded

  // District aggregation includes legacy Dhaka neighbourhoods without mixing other districts.
  await t(A, 2, 70, { area: 'bogura' });
  await t(B, 2, 80, { area: 'dhaka' });
  assert.equal((await leaderboard(sql, { district: 'bogura' }))[0].devices, 1);
  assert.equal((await leaderboard(sql, { district: 'dhaka' })).find(r => r.slug === 'beta')?.devices, 2);

  // Bayesian rating pulls a lone 5★ toward the site mean.
  await sql`insert into reviews (device_id, isp_id, stars) values (${A}, 1, 1), (${B}, 1, 1), (${C}, 2, 5)`;
  const beta = (await leaderboard(sql, {})).find((r) => r.slug === 'beta')!;
  assert.ok(beta.rating! < 5 && beta.rating! > 2.33);
  // Actual indexed crowd query: one latest vote per hash, 180-day window,
  // district isolation, and exclusion of all flagged rows.
  const vote = async (hash: string, isp = 1, opts: { flag?: string; fwa?: boolean; days?: number; district?: string } = {}) => sql`
    insert into tests (device_id, isp_id, area, district, connection, local_down, ip_hash, asn, flag, access_type, created_at)
    values (${A}, ${isp}, 'bogura', ${opts.district ?? 'bogura'}, 'wifi5', 40, ${hash}, 12345,
      ${opts.flag ?? null}, ${opts.fwa ? 'fixed_wireless' : 'fixed_line'}, now() - make_interval(days => ${opts.days ?? 0}))`;
  await vote('one'); await vote('two');
  for (let i = 0; i < 5; i++) await vote('two');
  assert.equal(await crowdSuggestion(sql, 12345, 'bogura'), null);
  await vote('mobile-fwa', 1, { flag: 'mobile_data', fwa: true });
  assert.equal(await crowdSuggestion(sql, 12345, 'bogura'), null);
  await vote('three', 1, { fwa: true });
  assert.equal((await crowdSuggestion(sql, 12345, 'bogura'))?.id, 1);
  for (let i = 0; i < 8; i++) {
    await vote(`foreign${i}`, 2, { flag: 'foreign_ip', fwa: true });
    await vote(`phone${i}`, 2, { flag: 'mobile_data' });
    await vote(`old${i}`, 2, { days: 181 });
    await vote(`district${i}`, 2, { district: 'dhaka' });
  }
  assert.equal((await crowdSuggestion(sql, 12345, 'bogura'))?.id, 1);
  for (let i = 0; i < 3; i++) await vote(`beta${i}`, 2);
  assert.ok(await crowdSuggestion(sql, 12345, 'bogura')); // 3/6 qualifies
  await vote('beta3', 2);
  assert.equal((await crowdSuggestion(sql, 12345, 'bogura'))?.id, 2);
  // Reusing a hash changes its vote rather than adding another one.
  await vote('one', 2);
  assert.equal((await crowdSuggestion(sql, 12345, 'bogura'))?.id, 2);
  assert.equal((await recent(sql, { limit: 100, accessType: 'fixed_wireless' })).length, 1);
  // Reapplying schema upgrades is safe and retains results.
  await sql.unsafe(readFileSync('db/schema.sql', 'utf8'));
  console.log('ok');
} finally {
  await sql.end();
  await server.stop();
}
