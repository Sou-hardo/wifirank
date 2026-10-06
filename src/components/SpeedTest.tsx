import { useState } from 'react';
import SpeedTestEngine from '@cloudflare/speedtest';
import { PUBLIC_BDIX_URL } from 'astro:env/client';
import { AREAS, CONNECTIONS, PLANS, PRICES } from '../lib/options';

type Isp = { id: number; name: string; aliases: string[] };
type Metrics = { down: number | null; up: number | null; ping: number | null; jitter: number | null; loss?: number | null };
type Phase = 'form' | 'intl' | 'bdix' | 'saving' | 'done';

const BASE_MEASUREMENTS = [
  { type: 'latency', numPackets: 1 },
  { type: 'download', bytes: 1e5, count: 1, bypassMinDuration: true },
  { type: 'latency', numPackets: 20 },
  { type: 'download', bytes: 1e5, count: 9 },
  { type: 'download', bytes: 1e6, count: 8 },
  { type: 'upload', bytes: 1e5, count: 8 },
  { type: 'upload', bytes: 1e6, count: 6 },
  { type: 'download', bytes: 1e7, count: 6 },
  { type: 'upload', bytes: 1e7, count: 4 },
  { type: 'download', bytes: 2.5e7, count: 4 },
  { type: 'upload', bytes: 2.5e7, count: 4 },
  { type: 'download', bytes: 1e8, count: 3 },
  { type: 'upload', bytes: 5e7, count: 3 },
];

const deviceId = () => {
  let id = localStorage.getItem('wr_device');
  if (!id) localStorage.setItem('wr_device', (id = crypto.randomUUID()));
  return id;
};

const safe = (f: () => number | undefined) => {
  try {
    const v = f();
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
};

function read(r: any): Metrics {
  const mbps = (f: () => number | undefined) => {
    const v = safe(f);
    return v == null ? null : v / 1e6;
  };
  return {
    down: mbps(() => r.getDownloadBandwidth()),
    up: mbps(() => r.getUploadBandwidth()),
    ping: safe(() => r.getUnloadedLatency()),
    jitter: safe(() => r.getUnloadedJitter()),
    loss: safe(() => r.getPacketLoss()),
  };
}

function runEngine(config: object, onProgress: (m: Metrics) => void) {
  return new Promise<Metrics>((resolve) => {
    const t = new SpeedTestEngine(config as any);
    t.onResultsChange = () => onProgress(read(t.results));
    t.onFinish = (r) => resolve(read(r));
    t.onError = (e) => console.warn('speedtest:', e); // individual measurement failures are non-fatal
  });
}

async function measureIntl(onProgress: (m: Metrics) => void) {
  const creds = await fetch('/api/turn-creds').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const measurements = [...BASE_MEASUREMENTS];
  if (creds) measurements.splice(6, 0, { type: 'packetLoss', numPackets: 1e3, responsesWaitTime: 3000 } as any);
  const m = await runEngine(
    { measurements, ...(creds && { turnServerUser: creds.username, turnServerPass: creds.credential }) },
    onProgress,
  );
  return creds ? m : { ...m, loss: null };
}

const measureBdix = (onProgress: (m: Metrics) => void) =>
  runEngine(
    { measurements: BASE_MEASUREMENTS, downloadApiUrl: `${PUBLIC_BDIX_URL}/__down`, uploadApiUrl: `${PUBLIC_BDIX_URL}/__up` },
    onProgress,
  ).then(({ loss, ...m }) => m);

const fmt = (v: number | null | undefined, digits = 1) => (v == null ? '—' : v.toFixed(digits));

function ResultCard({ title, m, note }: { title: string; m: Metrics | null; note?: string }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      {note && <p className="muted">{note}</p>}
      <dl className="metrics">
        <div><dt>Download</dt><dd>{fmt(m?.down)} <small>Mbps</small></dd></div>
        <div><dt>Upload</dt><dd>{fmt(m?.up)} <small>Mbps</small></dd></div>
        <div><dt>Ping</dt><dd>{fmt(m?.ping, 0)} <small>ms</small></dd></div>
        <div><dt>Jitter</dt><dd>{fmt(m?.jitter, 0)} <small>ms</small></dd></div>
        {m && 'loss' in m && <div><dt>Packet loss</dt><dd>{m.loss == null ? '—' : `${(m.loss * 100).toFixed(1)}%`}</dd></div>}
      </dl>
    </div>
  );
}

async function shareImage(isp: string, area: string, intl: Metrics | null, bdix: Metrics | null) {
  const c = document.createElement('canvas');
  c.width = c.height = 1080;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0f172a';
  g.fillRect(0, 0, 1080, 1080);
  g.fillStyle = '#dc2626';
  g.fillRect(0, 0, 1080, 16);
  g.fillStyle = '#fff';
  g.font = '600 64px system-ui, sans-serif';
  g.fillText(isp, 80, 170, 920);
  g.fillStyle = '#94a3b8';
  g.font = '40px system-ui, sans-serif';
  g.fillText(`${area}, Dhaka · ${new Date().toLocaleDateString('en-GB')}`, 80, 235, 920);
  const block = (label: string, m: Metrics | null, y: number) => {
    g.fillStyle = '#94a3b8';
    g.font = '600 36px system-ui, sans-serif';
    g.fillText(label, 80, y);
    g.fillStyle = '#fff';
    g.font = '600 96px system-ui, sans-serif';
    g.fillText(`↓ ${fmt(m?.down, 0)}  ↑ ${fmt(m?.up, 0)}`, 80, y + 110, 920);
    g.fillStyle = '#cbd5e1';
    g.font = '40px system-ui, sans-serif';
    g.fillText(`Mbps · ping ${fmt(m?.ping, 0)} ms · jitter ${fmt(m?.jitter, 0)} ms`, 80, y + 170, 920);
  };
  block('INTERNATIONAL', intl, 360);
  block(bdix ? 'BDIX (LOCAL)' : 'BDIX: not measured', bdix, 660);
  g.fillStyle = '#94a3b8';
  g.font = '36px system-ui, sans-serif';
  g.fillText(`Compare ISPs in your area → ${location.host}`, 80, 1000, 920);

  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
  const file = new File([blob], 'wifirank-result.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], text: `My ${isp} speed in ${area}` }).catch(() => {});
  } else {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: file.name });
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

function Review({ ispId }: { ispId: number }) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const submit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: deviceId(), ispId, stars, comment }),
    });
    setStatus(res.ok ? 'Thanks! You can update your review any time after another test.' : (await res.json()).error);
  };
  return (
    <form className="card" onSubmit={submit}>
      <h3>Rate your ISP <span className="muted">(optional)</span></h3>
      <div className="stars" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} role="radio" aria-checked={stars === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
            className={n <= stars ? 'on' : ''} onClick={() => setStars(n)}>★</button>
        ))}
      </div>
      <textarea maxLength={1000} rows={3} placeholder="Uptime, support, price, anything others should know"
        value={comment} onChange={(e) => setComment(e.target.value)} />
      <button disabled={!stars}>Submit review</button>
      {status && <p role="status">{status}</p>}
    </form>
  );
}

export default function SpeedTest({ isps }: { isps: Isp[] }) {
  const [phase, setPhase] = useState<Phase>('form');
  const [ispText, setIspText] = useState('');
  const [area, setArea] = useState('');
  const [connection, setConnection] = useState('');
  const [plan, setPlan] = useState('');
  const [price, setPrice] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoNote, setGeoNote] = useState('');
  const [intl, setIntl] = useState<Metrics | null>(null);
  const [bdix, setBdix] = useState<Metrics | null>(null);
  const [saved, setSaved] = useState<{ ispId: number; flag: string | null; asOrg: string | null } | null>(null);
  const [error, setError] = useState('');

  const q = ispText.trim().toLowerCase();
  const match = isps.find((i) => i.name.toLowerCase() === q || i.aliases.some((a) => a.toLowerCase() === q));
  const ispName = match?.name ?? ispText.trim();

  const locate = () => {
    setGeoNote('Locating…');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
        setGeoNote('Location added (rounded to ~500 m before saving).');
      },
      () => setGeoNote('Location not shared. That’s fine.'),
      { timeout: 10000 },
    );
  };

  const start = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setError('');
    setIntl(null);
    setBdix(null);
    setPhase('intl');
    const i = await measureIntl(setIntl);
    setIntl(i);
    let b: Metrics | null = null;
    if (PUBLIC_BDIX_URL) {
      setPhase('bdix');
      b = await measureBdix(setBdix);
      setBdix(b);
    }
    setPhase('saving');
    const res = await fetch('/api/tests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: deviceId(), ...(match ? { ispId: match.id } : { ispName }),
        area, connection, plan: plan || null, price: price || null, ...coords, intl: i, bdix: b,
      }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (!res?.ok) {
      setError(body?.error ?? 'Could not save your result. Check your connection and try again.');
      setPhase('form');
      return;
    }
    setSaved(body);
    setPhase('done');
  };

  if (phase !== 'form') {
    const running = phase === 'intl' || phase === 'bdix';
    return (
      <section aria-live="polite">
        <p className="status">
          {phase === 'intl' && 'Testing international speed (Cloudflare, Dhaka)…'}
          {phase === 'bdix' && 'Testing local BDIX speed…'}
          {phase === 'saving' && 'Saving…'}
          {phase === 'done' && `Saved. Thanks for contributing!`}
        </p>
        {running && <p className="muted">Keep this tab open. Avoid downloads or streaming on your network until it finishes (about 30–60 s).</p>}
        <div className="grid2">
          <ResultCard title="International" m={intl} />
          <ResultCard title="BDIX (local)" m={bdix} note={PUBLIC_BDIX_URL ? undefined : 'BDIX test server not set up yet.'} />
        </div>
        {saved?.flag && (
          <p className="warn">
            {saved.flag === 'mobile_data'
              ? `This test ran over mobile data (${saved.asOrg}), so it won’t count toward ${ispName}’s stats. Connect to your home Wi-Fi or cable and test again.`
              : 'Your IP is outside Bangladesh (VPN or proxy?), so this test won’t count toward ISP stats. Turn off the VPN and test again.'}
          </p>
        )}
        {phase === 'done' && (
          <>
            <div className="row">
              <button onClick={() => shareImage(ispName, AREAS[area], intl, bdix)}>Share result image</button>
              <button className="secondary" onClick={() => setPhase('form')}>Test again</button>
              <a href={`/isps?area=${area}`}>Compare ISPs in {AREAS[area]} →</a>
            </div>
            {saved && !saved.flag && <Review ispId={saved.ispId} />}
          </>
        )}
      </section>
    );
  }

  return (
    <form className="card form" onSubmit={start}>
      <label>
        Your ISP
        <input list="isp-list" required value={ispText} onChange={(e) => setIspText(e.target.value)}
          placeholder="Start typing, e.g. Link3" autoComplete="off" />
        <datalist id="isp-list">{isps.map((i) => <option key={i.id} value={i.name} />)}</datalist>
        {q && !match && <small className="muted">Not in our list, so “{ispText.trim()}” will be added for review.</small>}
      </label>
      <label>
        Area
        <select required value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">Select your area</option>
          {Object.entries(AREAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <fieldset>
        <legend>How is this device connected?</legend>
        {Object.entries(CONNECTIONS).map(([k, v]) => (
          <label key={k} className="radio">
            <input type="radio" name="connection" required value={k} checked={connection === k} onChange={() => setConnection(k)} /> {v}
          </label>
        ))}
      </fieldset>
      <div className="grid2">
        <label>
          Package speed <span className="muted">(optional)</span>
          <select value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="">Don’t know</option>
            {Object.entries(PLANS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>
          Monthly price <span className="muted">(optional)</span>
          <select value={price} onChange={(e) => setPrice(e.target.value)}>
            <option value="">Prefer not to say</option>
            {Object.entries(PRICES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
      <div>
        <button type="button" className="secondary" onClick={locate} disabled={!!coords}>Add approximate location (optional)</button>
        {geoNote && <small className="muted"> {geoNote}</small>}
      </div>
      {error && <p className="warn" role="alert">{error}</p>}
      <button className="go">Start speed test</button>
      <small className="muted">
        Anonymous: we store your results, area, a hashed IP and your network’s operator name. No account, no exact address.
      </small>
    </form>
  );
}
