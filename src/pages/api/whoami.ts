import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';
import { lookup } from '../../lib/network';
import { cachedSuggestion } from '../../lib/crowd';
import { DISTRICT_NAMES } from '../../lib/options';
import upstreams from '../../../data/upstream-asns.json';

// The network this visitor's IP belongs to, matched to a known ISP by ASN. Used to prefill the form.
export const GET: APIRoute = async ({ clientAddress, url }) => {
  const net = await lookup(clientAddress);
  // Explicit dev fixtures only; production never accepts client-supplied detection.
  const fixture = import.meta.env.DEV ? Number(url.searchParams.get('devAsn')) : 0;
  if (fixture > 0) { net.asn = fixture; net.flag = null; net.as_org = `Development AS${fixture}`; }
  const flag = import.meta.env.DEV ? url.searchParams.get('devFlag') : null;
  if (flag === 'mobile_data' || flag === 'foreign_ip') { net.flag = flag; net.as_org = 'Development network'; }
  const matches = net.asn ? await sql`select id, name from isps where asn = ${net.asn} and approved order by id limit 2` : [];
  const isp = matches[0] ?? null;
  const upstream = matches.length > 1 || (net.asn != null && upstreams.includes(net.asn));
  const requested = url.searchParams.get('district');
  const district = requested && requested in DISTRICT_NAMES ? requested : net.country === 'BD' && net.city && net.city in DISTRICT_NAMES ? net.city : null;
  const suggested = net.asn && district && net.flag !== 'foreign_ip' ? await cachedSuggestion(sql, net.asn, district) : null;
  return Response.json({ asOrg: net.as_org, flag: net.flag, isp, upstream: upstream || !!(suggested && isp && suggested.id !== isp.id), suggested, district }, { headers: { 'Cache-Control': 'private, no-store' } });
};
