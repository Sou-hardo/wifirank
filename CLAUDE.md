# wifirank

## Secrets (Doppler)

Secrets live in Doppler, workplace **LaunchPad**, project `wifirank`, configs `dev`, `dev_personal`, `stg`, `prd`. Never copy them into a committed file.

- The default Doppler CLI token belongs to another workplace and can't see this project. The LaunchPad token is configured for one directory only, so pass `--scope` with that directory (find it with `doppler configure --all`; currently `~/.t3/worktrees/wifirank/t3-c18c3b2a`):
  `doppler run -p wifirank -c <config> --scope <dir> -- <command>`
- `dev` and `dev_personal` point `DATABASE_URL` at `127.0.0.1:5432`. For local work, start the local DB first:
  ```sh
  npm run db:local                       # pglite on :5432
  doppler run -p wifirank -c dev --scope <dir> -- npm run db:migrate
  doppler run -p wifirank -c dev --scope <dir> -- node scripts/seed-demo.ts
  doppler run -p wifirank -c dev --scope <dir> -- npx astro dev
  ```
- `prd` is the production Neon database. Vercel's build does **not** run migrations: run `doppler run -p wifirank -c prd --scope <dir> -- npm run db:migrate` before merging a schema change. Don't run tests or seeds against `prd`.
