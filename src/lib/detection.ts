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

// Provider FWA metadata is separate from IP detection: mobile data is included only
// when the user confirms the FWA home-router connection.
export function classifyAccess(flag: string | null, providerTech: string | null, declared: boolean) {
  const isFwaProvider = providerTech === 'fwa';
  const declaredFwa = isFwaProvider && declared;
  const accessType = flag === 'mobile_data'
    ? declaredFwa ? 'fixed_wireless' : 'fixed_line'
    : isFwaProvider ? 'fixed_wireless' : 'fixed_line';
  return { accessType, flag: flag === 'mobile_data' && declaredFwa ? null : flag };
}
