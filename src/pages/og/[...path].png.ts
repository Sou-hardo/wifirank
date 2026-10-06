import type { APIRoute } from 'astro';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import f400 from '@fontsource/geist/files/geist-latin-400-normal.woff?inline';
import f600 from '@fontsource/geist/files/geist-latin-600-normal.woff?inline';
import { sql } from '../../lib/db';
import { leaderboard, summary, MIN_DEVICES } from '../../lib/stats';
import { AREAS } from '../../lib/options';
import { fmt } from '../../lib/format';

// Social share cards: /og/home.png, /og/isp/<slug>.png, /og/area/<slug>.png
const font = (uri: string) => Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64');
const fonts = [
  { name: 'Geist', data: font(f400), weight: 400 as const, style: 'normal' as const },
  { name: 'Geist', data: font(f600), weight: 600 as const, style: 'normal' as const },
];
type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, ...children: (Node | string | null)[]): Node =>
  ({ type, props: { style: { display: 'flex', ...style }, children: children.filter((c) => c != null) } });

const LIME = '#c6f432', MUTED = '#7c8792', TEXT2 = '#a7b0ba';
const stat = (label: string, value: string, unit: string, accent = false) =>
  h('div', { flexDirection: 'column', flex: 1, padding: '28px 32px', background: '#12161b', border: '1px solid #262c34', borderRadius: 24 },
    h('div', { fontSize: 24, color: MUTED }, label),
    h('div', { alignItems: 'baseline', marginTop: 10 },
      h('div', { fontSize: 84, fontWeight: 600, letterSpacing: -4, color: accent ? LIME : '#f3f5f7' }, value),
      h('div', { fontSize: 26, color: MUTED, marginLeft: 10 }, unit)));

function card(eyebrow: string, title: string, sub: string, stats: Node[]) {
  return h('div', { width: 1200, height: 630, flexDirection: 'column', justifyContent: 'space-between', padding: 64, background: '#0b0d10', color: '#f3f5f7', fontFamily: 'Geist',
      backgroundImage: 'radial-gradient(900px 500px at 85% -10%, rgba(198,244,50,0.16), transparent)' },
    h('div', { alignItems: 'center', justifyContent: 'space-between' },
      h('div', { alignItems: 'center', fontSize: 34, fontWeight: 600 },
        h('div', { width: 18, height: 18, borderRadius: 9, background: LIME, marginRight: 16 }), 'WifiRank'),
      h('div', { fontSize: 24, color: LIME, letterSpacing: 3 }, eyebrow.toUpperCase())),
    h('div', { flexDirection: 'column' },
      h('div', { fontSize: title.length > 28 ? 62 : 78, fontWeight: 600, letterSpacing: -3, lineHeight: 1.05 }, title),
      h('div', { fontSize: 30, color: TEXT2, marginTop: 16 }, sub)),
    h('div', { gap: 20 }, ...stats));
}

export const GET: APIRoute = async ({ params }) => {
  const [kind, slug] = (params.path ?? '').split('/');
  let tree: Node | null = null;

  if (kind === 'home') {
    const [t] = await sql<{ tests: number; isps: number; areas: number }[]>`
      select count(*)::int as tests, count(distinct isp_id)::int as isps, count(distinct area)::int as areas from tests where flag is null`;
    tree = card('Dhaka · crowdsourced', 'How fast is your internet, really?', 'Compare ISPs in your area by real speed tests.', [
      stat('Speed tests', t.tests.toLocaleString('en'), ''), stat('Providers', String(t.isps), ''), stat('Areas', String(t.areas), '')]);
  } else if (kind === 'isp' && slug) {
    const [isp] = await sql<{ id: number; name: string }[]>`select id, name from isps where slug = ${slug} and approved`;
    const s = isp && (await summary(sql, { ispId: isp.id }));
    if (isp) tree = card('Speed test results', isp.name, s ? `Measured by ${s.devices} users in Dhaka · last 90 days` : 'No tests yet. Be the first.', [
      stat('Download', fmt(s?.local_down), 'Mbps', true), stat('Upload', fmt(s?.local_up), 'Mbps'),
      stat('Rating', s?.rating != null ? s.rating.toFixed(1) : '—', s?.rating != null ? '/ 5' : '')]);
  } else if (kind === 'area' && slug && AREAS[slug]) {
    const rows = await leaderboard(sql, { area: slug });
    const top = rows.filter((r) => r.devices >= MIN_DEVICES).slice(0, 3);
    tree = card('Best ISP by area', `Internet in ${AREAS[slug]}`, top.length ? `Fastest providers, from ${rows.reduce((n, r) => n + r.devices, 0)} residents’ tests` : 'Not enough tests yet. Add yours.',
      (top.length ? top : rows.slice(0, 3)).map((r, i) => stat(`${i + 1}. ${r.name}`, fmt(r.local_down), 'Mbps', i === 0)));
  }
  if (!tree) return new Response(null, { status: 404 });

  const svg = await satori(tree as any, { width: 1200, height: 630, fonts });
  const png = new Resvg(svg).render().asPng();
  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  });
};
