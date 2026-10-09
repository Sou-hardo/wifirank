import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';
import { lookup } from '../../lib/network';

// The network this visitor's IP belongs to, matched to a known ISP by ASN. Used to prefill the form.
export const GET: APIRoute = async ({ clientAddress }) => {
  const net = await lookup(clientAddress);
  const [isp = null] = net.asn ? await sql`select id, name from isps where asn = ${net.asn} and approved limit 1` : [];
  return Response.json({ asOrg: net.as_org, flag: net.flag, isp }, { headers: { 'Cache-Control': 'private, no-store' } });
};
