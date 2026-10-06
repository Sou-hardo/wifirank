import type { APIRoute } from 'astro';
import { CF_TURN_KEY_ID, CF_TURN_API_TOKEN } from 'astro:env/server';

// Short-lived Cloudflare Realtime TURN credentials for the packet-loss test.
export const GET: APIRoute = async () => {
  if (!CF_TURN_KEY_ID || !CF_TURN_API_TOKEN) return new Response(null, { status: 404 });
  const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${CF_TURN_KEY_ID}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CF_TURN_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: 600 }),
  });
  const { iceServers = [] } = await res.json().catch(() => ({}));
  const s = iceServers.find((s: { username?: string }) => s.username);
  if (!s) return new Response(null, { status: 502 });
  return Response.json({ username: s.username, credential: s.credential });
};
