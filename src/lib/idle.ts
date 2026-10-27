// Starts loading `load` at once (network runs in parallel with first paint), then hands the result to `fn`
// right after the first frame paints, so heavy work (MapLibre) never holds up the hero but doesn't wait for
// the window 'load' event or an idle slot either.
export function whenIdle<T>(load: () => Promise<T>, fn: (v: T) => void, onError?: () => void): () => void {
  let cancelled = false, raf = 0, timer = 0;
  const painted = new Promise<void>((res) => { raf = requestAnimationFrame(() => { timer = setTimeout(res, 0) as unknown as number; }); });
  Promise.all([load(), painted]).then(([v]) => { if (!cancelled) fn(v); }).catch(() => { if (!cancelled) onError?.(); });
  return () => { cancelled = true; cancelAnimationFrame(raf); clearTimeout(timer); };
}
