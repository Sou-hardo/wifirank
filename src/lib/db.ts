import postgres from 'postgres';
import { DATABASE_URL } from 'astro:env/server';

// prepare: false keeps it compatible with Neon's pooled (PgBouncer) endpoint.
export const sql = postgres(DATABASE_URL, { prepare: false, max: 5 });
