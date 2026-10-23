import type { APIRoute } from 'astro';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import f400 from '@fontsource/space-grotesk/files/space-grotesk-latin-400-normal.woff?inline';
import f500 from '@fontsource/space-grotesk/files/space-grotesk-latin-500-normal.woff?inline';
import fDot from '@fontsource/doto/files/doto-latin-900-normal.woff?inline';
import { sql } from '../../lib/db';
import { leaderboard, summary, MIN_DEVICES } from '../../lib/stats';
import { AREAS } from '../../lib/options';
import { fmt } from '../../lib/format';

// Social share cards: /og/isp/<slug>.png, /og/area/<slug>.png (the default card is the static /og-home.jpg)
const font = (uri: string) => Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64');
const fonts = [
  { name: 'Space Grotesk', data: font(f400), weight: 400 as const, style: 'normal' as const },
  { name: 'Space Grotesk', data: font(f500), weight: 500 as const, style: 'normal' as const },
  { name: 'Doto', data: font(fDot), weight: 900 as const, style: 'normal' as const },
];
type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, ...children: (Node | string | null)[]): Node =>
  ({ type, props: { style: { display: 'flex', ...style }, children: children.filter((c) => c != null) } });

const INK = '#191a23', LIME = '#b9ff66', MUTED = '#6c6e79', TEXT2 = '#4a4c57';
const stat = (label: string, value: string, unit: string, accent = false) =>
  h('div', { flexDirection: 'column', flex: 1, padding: '24px 30px 22px', background: accent ? LIME : '#fff', border: `2px solid ${INK}`, borderRadius: 30, boxShadow: `0 7px 0 ${INK}` },
    h('div', { fontSize: 23, color: accent ? INK : MUTED }, label),
    h('div', { alignItems: 'baseline', marginTop: 6 },
      h('div', { fontFamily: 'Doto', fontSize: 92, fontWeight: 900, color: INK, alignItems: 'flex-end' },
        ...value.split('.').flatMap((part, i) => (i ? [h('div', { width: 13, height: 13, background: INK, margin: '0 7px 17px' }), part] : [part]))),
      h('div', { fontSize: 24, color: accent ? INK : MUTED, marginLeft: 10 }, unit)));

function card(eyebrow: string, title: string, sub: string, stats: Node[]) {
  return h('div', { width: 1200, height: 630, flexDirection: 'column', justifyContent: 'space-between', padding: '56px 64px 64px', background: '#f3f3f1', color: INK, fontFamily: 'Space Grotesk',
      backgroundImage: 'radial-gradient(circle at 100% 0%, rgba(25,26,35,0.10), transparent 45%)' },
    h('div', { alignItems: 'center', justifyContent: 'space-between' },
      h('div', { alignItems: 'center', fontSize: 34, fontWeight: 500, letterSpacing: -1 },
        h('div', { width: 44, height: 44, borderRadius: 14, background: INK, marginRight: 14, alignItems: 'center', justifyContent: 'center' },
          h('div', { width: 14, height: 14, borderRadius: 7, background: LIME })), 'WifiRank'),
      h('div', { fontSize: 20, letterSpacing: 2, padding: '8px 16px', background: '#fff', border: '1px solid rgba(25,26,35,0.2)', borderRadius: 999 }, eyebrow.toUpperCase())),
    h('div', { flexDirection: 'column' },
      h('div', { fontSize: title.length > 28 ? 60 : 76, fontWeight: 500, letterSpacing: -3, lineHeight: 1.05 }, title),
      h('div', { fontSize: 29, color: TEXT2, marginTop: 14 }, sub)),
    h('div', { gap: 20 }, ...stats));
}

export const GET: APIRoute = async ({ params }) => {
  const [kind, slug] = (params.path ?? '').split('/');
  let tree: Node | null = null;

  if (kind === 'isp' && slug) {
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
