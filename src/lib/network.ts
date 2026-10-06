import { createHash } from 'node:crypto';
import { IP_SALT, IPINFO_TOKEN } from 'astro:env/server';

export const hashIp = (ip: string) => createHash('sha256').update(IP_SALT + ip).digest('hex').slice(0, 32);

// Results from these are stored but excluded from ISP stats.
// ponytail: name-based match; add ASN list if operators rebrand
const MOBILE = /grameenphone|robi|axiata|airtel|banglalink|teletalk/i;

export async function lookup(ip: string) {
  try {
    const res = await fetch(`https://ipinfo.io/${ip}/json${IPINFO_TOKEN ? `?token=${IPINFO_TOKEN}` : ''}`, {
      signal: AbortSignal.timeout(3000),
    });
    const j = await res.json();
    const [, asn, ...org] = /^AS(\d+) (.*)$/.exec(j.org ?? '') ?? [];
    const as_org = org.join(' ') || null;
    const country = j.country ?? null;
    const flag = country && country !== 'BD' ? 'foreign_ip' : as_org && MOBILE.test(as_org) ? 'mobile_data' : null;
    return { asn: asn ? Number(asn) : null, as_org, country, flag };
  } catch {
    return { asn: null, as_org: null, country: null, flag: null }; // lookup down: keep the result unflagged
  }
}
