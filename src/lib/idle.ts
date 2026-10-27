// Runs fn once the page has loaded and the main thread is idle, so heavy work (MapLibre) doesn't hold up first paint.
export function whenIdle(fn: () => void): () => void {
  let id = 0, cancelled = false;
  const idle = () => {
    if (cancelled) return;
    id = 'requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200) as unknown as number;
  };
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
  return () => {
    cancelled = true;
    window.removeEventListener('load', idle);
    if ('cancelIdleCallback' in window) cancelIdleCallback(id); else clearTimeout(id);
  };
}
