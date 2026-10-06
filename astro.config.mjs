import { defineConfig, envField } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';

// Canonical origin for SEO tags and the sitemap. Vercel sets VERCEL_PROJECT_PRODUCTION_URL at build time.
const site = process.env.SITE_URL
  ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:4321');

export default defineConfig({
  site,
  output: 'server',
  adapter: vercel(),
  integrations: [react()],
  // Lazily imported, so Vite's dev scanner misses it without a hint.
  vite: { optimizeDeps: { include: ['maplibre-gl'] } },
  env: {
    schema: {
      DATABASE_URL: envField.string({ context: 'server', access: 'secret' }),
      IP_SALT: envField.string({ context: 'server', access: 'secret', default: 'dev-salt' }),
      IPINFO_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
      CF_TURN_KEY_ID: envField.string({ context: 'server', access: 'secret', optional: true }),
      CF_TURN_API_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
});
