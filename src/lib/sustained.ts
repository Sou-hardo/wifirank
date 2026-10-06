// Sustained speed from the engine's per-request samples, in Mbps.
// The engine's own headline is the 90th percentile of every request, which short bursts on small
// files inflate. Here only requests long enough to load the line count, and the median is reported.
export type Sample = { bytes: number; bps: number; duration: number };

const LOADED_MS = 250;

export function sustainedMbps(points: Sample[]): number | null {
  const ok = points.filter((p) => p.bps > 0);
  if (!ok.length) return null;
  let use = ok.filter((p) => p.duration >= LOADED_MS);
  // Mid-test, or on a line so fast that nothing takes 250 ms yet: fall back to the largest size run so far.
  if (!use.length) {
    const max = Math.max(...ok.map((p) => p.bytes));
    use = ok.filter((p) => p.bytes === max);
  }
  const s = use.map((p) => p.bps).sort((a, b) => a - b), mid = s.length >> 1;
  return (s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2) / 1e6;
}
