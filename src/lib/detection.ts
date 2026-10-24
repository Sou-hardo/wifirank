// Shared server/client decisions; no network calls or environment dependencies.
export const CROWD = { minIps: 3, minShare: 0.5, days: 180, cacheMs: 300000 } as const;
export type Provider = { id: number; name: string };
export type Detection = {
  isp: Provider | null;
  upstream: boolean;
  flag: string | null;
  suggested: (Provider & { reason: string }) | null;
};
// Prefills the best guess (crowd suggestion, else the ASN's ISP); the start sheet shows it with a "change" link.
// `savedNet` is set when `current` was restored from an earlier test: the network (AS org) that test ran on.
// A restored provider only survives on that same network, or when detection can't be trusted (mobile data, VPN).
export function providerChoice(current: { id?: number; name: string }, net: Detection & { asOrg?: string | null }, touched = false, savedNet?: string | null) {
  const guess = net.suggested ?? net.isp;
  const pick = guess ? { id: guess.id, name: guess.name } : { name: '' };
  if (touched || net.flag) return current;
  if (savedNet !== undefined) return savedNet === (net.asOrg ?? null) ? current : pick;
  return current.name.trim() || !guess ? current : pick;
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
