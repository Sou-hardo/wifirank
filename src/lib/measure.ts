// A time-boxed speed test against Cloudflare's Dhaka edge, built the way Fast.com does it:
// several connections at once for a fixed few seconds, so the line fills up and the whole test
// takes about ten seconds whatever the speed. The first second of each direction is TCP ramp-up
// and is left out of the reported number.
const BASE = 'https://speed.cloudflare.com';
const PINGS = 10;
const DOWN = { streams: 6, ms: 5000, rampMs: 1000, bytes: 25e6 };
const UP = { streams: 4, ms: 4000, rampMs: 1000, bytes: 4e6 };
const TICK_MS = 200;

export type Phase = 'latency' | 'download' | 'upload';
export type Measured = { down: number | null; up: number | null; ping: number | null };

// One round trip on an empty response, minus the time Cloudflare reports spending on it.
async function pingOnce(): Promise<number | null> {
  const url = `${BASE}/__down?bytes=0&r=${Math.random()}`;
  const t0 = performance.now();
  const res = await fetch(url, { cache: 'no-store' }).catch(() => null);
  if (!res?.ok) return null;
  await res.arrayBuffer();
  const wall = performance.now() - t0;
  const entry = performance.getEntriesByName(url).pop() as PerformanceResourceTiming | undefined;
  const rtt = entry && entry.responseStart > 0 ? entry.responseStart - entry.requestStart : wall;
  // Cloudflare reports its edge and worker time as separate entries; both are server time.
  const server = [...(res.headers.get('server-timing') ?? '').matchAll(/dur=([\d.]+)/g)].reduce((a, x) => a + Number(x[1]), 0);
  return Math.max(rtt - server, 0);
}

async function latency() {
  await pingOnce(); // warms DNS, TLS and the connection pool
  const s: number[] = [];
  for (let i = 0; i < PINGS; i++) { const v = await pingOnce(); if (v != null) s.push(v); }
  if (!s.length) return { ping: null };
  const sorted = [...s].sort((a, b) => a - b), mid = sorted.length >> 1;
  const ping = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { ping };
}

// Runs `stream` on n connections for `ms`, reporting live Mbps; the result skips the ramp-up.
async function saturate(n: number, ms: number, rampMs: number, stream: (add: (b: number) => void, stop: AbortSignal) => Promise<void>,
  onLive: (mbps: number) => void): Promise<number | null> {
  let bytes = 0, rampBytes = 0, rampAt = 0, last = 0, lastAt = 0;
  const ctl = new AbortController(), t0 = performance.now();
  const add = (b: number) => { bytes += b; };
  const loops = Array.from({ length: n }, async () => {
    while (!ctl.signal.aborted) await stream(add, ctl.signal).catch(() => {});
  });
  const tick = setInterval(() => {
    const now = performance.now();
    if (!rampAt && now - t0 >= rampMs) { rampAt = now; rampBytes = bytes; }
    if (lastAt) onLive(((bytes - last) * 8) / ((now - lastAt) * 1e3));
    last = bytes; lastAt = now;
  }, TICK_MS);
  await new Promise((r) => setTimeout(r, ms));
  const end = performance.now(), total = bytes;
  clearInterval(tick); ctl.abort(); await Promise.all(loops);
  const from = rampAt ? rampBytes : 0, since = rampAt || t0;
  return total > from ? ((total - from) * 8) / ((end - since) * 1e3) : null;
}

async function download(add: (b: number) => void, stop: AbortSignal) {
  const res = await fetch(`${BASE}/__down?bytes=${DOWN.bytes}&r=${Math.random()}`, { cache: 'no-store', signal: stop });
  const reader = res.body!.getReader();
  for (;;) { const { done, value } = await reader.read(); if (done) return; add(value.byteLength); }
}

// fetch can't report upload progress, so uploads go through XHR.
const payload = new Blob([new Uint8Array(UP.bytes)]);
function upload(add: (b: number) => void, stop: AbortSignal) {
  return new Promise<void>((resolve) => {
    const x = new XMLHttpRequest();
    let sent = 0;
    x.upload.onprogress = (e) => { add(e.loaded - sent); sent = e.loaded; };
    x.onloadend = () => { stop.removeEventListener('abort', abort); resolve(); };
    const abort = () => x.abort();
    stop.addEventListener('abort', abort);
    x.open('POST', `${BASE}/__up?r=${Math.random()}`);
    x.send(payload);
  });
}

export async function measure(onProgress: (m: Measured, phase: Phase) => void): Promise<Measured> {
  const m: Measured = { down: null, up: null, ping: null };
  onProgress({ ...m }, 'latency');
  Object.assign(m, await latency());
  onProgress({ ...m }, 'download');
  m.down = await saturate(DOWN.streams, DOWN.ms, DOWN.rampMs, download, (v) => onProgress({ ...m, down: v }, 'download'));
  onProgress({ ...m }, 'upload');
  m.up = await saturate(UP.streams, UP.ms, UP.rampMs, upload, (v) => onProgress({ ...m, up: v }, 'upload'));
  onProgress({ ...m }, 'upload');
  return m;
}
