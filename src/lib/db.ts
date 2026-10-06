import postgres from 'postgres';
import { DATABASE_URL } from 'astro:env/server';

// prepare: false keeps it compatible with Neon's pooled (PgBouncer) endpoint.
// Local dev uses PGlite, a single-session Postgres: more than one connection interleaves queries.
const local = /@(127\.0\.0\.1|localhost)[:/]/.test(DATABASE_URL);
export const sql = postgres(DATABASE_URL, { prepare: false, max: local ? 1 : 5 });
