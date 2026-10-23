// Shared server/client decisions; no network calls or environment dependencies.
export const CROWD = { minIps: 3, minShare: 0.5, days: 180, cacheMs: 300000 } as const;
export type Provider = { id: number; name: string };
export type Detection = {
  isp: Provider | null;
  upstream: boolean;
  flag: string | null;
  suggested: (Provider & { reason: string }) | null;
};
export function providerChoice(current: { id?: number; name: string }, net: Detection, touched = false) {
  return touched || current.name.trim() || net.upstream || net.flag || net.suggested || !net.isp ? current : net.isp;
}
export const qualifies = (ips: number, total: number) => ips >= CROWD.minIps && total > 0 && ips / total >= CROWD.minShare;

// gpfi is officially FWA: https://www.grameenphone.com/gpfibkashterms-conditions-url-english
// No documented subscriber prefix/hostname discriminator was found. The provider
// catalogue or explicit home-router declaration determines access type, never ASN.
export function classifyAccess(flag: string | null, providerType: string | null, declared: boolean) {
  const accessType = providerType === 'fixed_wireless' || declared ? 'fixed_wireless' : 'fixed_line';
  return { accessType, flag: flag === 'mobile_data' && accessType === 'fixed_wireless' ? null : flag };
}
