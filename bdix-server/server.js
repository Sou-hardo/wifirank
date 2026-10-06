// BDIX test endpoint: run on a VPS connected to BDIX, set PUBLIC_BDIX_URL to it.
// Speaks the same API as speed.cloudflare.com (/__down?bytes=N, /__up) so one engine drives both tests.
// Usage: PORT=8090 node server.js   (put it behind HTTPS, e.g. Caddy, in production)
import { createServer } from 'node:http';

const MAX = 250e6;
const chunk = Buffer.alloc(1 << 20);
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Timing-Allow-Origin': '*', // the engine reads PerformanceResourceTiming, which needs this cross-origin
  'Cache-Control': 'no-store',
};

createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
  if (url.pathname === '/__down') {
    let left = Math.min(Math.max(Number(url.searchParams.get('bytes')) || 0, 0), MAX);
    res.writeHead(200, { ...cors, 'Content-Type': 'application/octet-stream', 'Content-Length': left });
    const pump = () => {
      while (left > 0) {
        const n = Math.min(left, chunk.length);
        left -= n;
        if (!res.write(n === chunk.length ? chunk : chunk.subarray(0, n))) return res.once('drain', pump);
      }
      res.end();
    };
    return pump();
  }
  if (url.pathname === '/__up' && req.method === 'POST') {
    req.on('data', () => {}).on('end', () => res.writeHead(200, cors).end());
    return;
  }
  res.writeHead(404, cors).end();
}).listen(Number(process.env.PORT) || 8090);
