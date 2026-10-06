// Self-check for the stats aggregation, against a throwaway in-memory Postgres (PGlite).
// Run: npm run check
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { leaderboard, byArea, summary, recent } from '../src/lib/stats.ts';

const server = new PGLiteSocketServer({ db: await PGlite.create(), port: 54329 });
await server.start();
const sql = postgres('postgres://postgres@127.0.0.1:54329/postgres', { prepare: false, max: 1 });
try {
  await sql.unsafe(readFileSync('db/schema.sql', 'utf8'));
  await sql`insert into isps (name, slug) values ('Alpha', 'alpha'), ('Beta', 'beta')`;
  const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b', C = '00000000-0000-0000-0000-00000000000c';
  const t = (dev: string, isp: number, down: number, opts: { flag?: string; hour?: number; area?: string } = {}) => sql`
    insert into tests (device_id, isp_id, area, connection, intl_down, ip_hash, flag, created_at)
    values (${dev}, ${isp}, ${opts.area ?? 'mirpur-10'}, 'cable', ${down}, 'x', ${opts.flag ?? null},
      date_trunc('day', now() at time zone 'Asia/Dhaka') at time zone 'Asia/Dhaka' - interval '1 day' + make_interval(hours => ${opts.hour ?? 10}))`;

  // Device A spams 10 slow runs; B and C one fast run each. Per-device collapse → median of [10, 50, 60] = 50.
  for (let i = 0; i < 10; i++) await t(A, 1, 10);
  await t(B, 1, 50, { hour: 21 });
  await t(C, 1, 60, { area: 'banani' });
  await t(C, 1, 1000, { flag: 'mobile_data' }); // flagged: ignored
  await t(A, 2, 100);

  const rows = await leaderboard(sql, {});
  const alpha = rows.find((r) => r.slug === 'alpha')!;
  assert.equal(alpha.devices, 3);
  assert.equal(alpha.tests, 12);
  assert.equal(alpha.intl_down, 50);
  assert.equal(rows[0].slug, 'beta'); // faster, both under MIN_DEVICES

  assert.equal((await leaderboard(sql, { area: 'banani' })).length, 1);
  assert.equal((await summary(sql, { ispId: 1, peak: true }))?.intl_down, 50);
  assert.equal((await summary(sql, { ispId: 1, peak: false }))?.devices, 2);
  assert.deepEqual((await byArea(sql, { ispId: 1 })).map((r) => [r.area, r.devices]), [['mirpur-10', 2], ['banani', 1]]);

  assert.equal((await recent(sql, { limit: 5 })).length, 5);
  assert.equal((await recent(sql, { limit: 50, area: 'banani' })).length, 1); // flagged one excluded

  // Bayesian rating pulls a lone 5★ toward the site mean.
  await sql`insert into reviews (device_id, isp_id, stars) values (${A}, 1, 1), (${B}, 1, 1), (${C}, 2, 5)`;
  const beta = (await leaderboard(sql, {})).find((r) => r.slug === 'beta')!;
  assert.ok(beta.rating! < 5 && beta.rating! > 2.33);
  console.log('ok');
} finally {
  await sql.end();
  await server.stop();
}
