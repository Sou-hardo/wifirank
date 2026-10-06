import { useEffect, useMemo, useRef, useState } from 'react';
import SpeedTestEngine from '@cloudflare/speedtest';
import { AREAS, PLANS, PRICES } from '../lib/options';
import Combobox, { type Option } from './Combobox';
import Gauge from './Gauge';
import LocationPicker from './LocationPicker';
import { burst } from '../scripts/fx';

type Isp = { id: number; name: string; aliases: string[] };
type Metrics = { down: number | null; up: number | null; ping: number | null; jitter: number | null; loss?: number | null };
type Stage = 'latency' | 'download' | 'upload' | 'packetLoss';
type Saved = { ispId: number; flag: string | null; asOrg: string | null;
  peer: { devices: number; local_down: number | null } | null };

const MEASUREMENTS = [
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

const CONN = [
  { value: 'cable', label: 'Cable', icon: 'M7 3v5M17 3v5M5 8h14v3a7 7 0 0 1-14 0V8zM12 18v3' },
  { value: 'wifi5', label: '5 GHz', icon: 'M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0M12 20h.01' },
  { value: 'wifi24', label: '2.4 GHz', icon: 'M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0M12 20h.01' },
  { value: 'wifi', label: 'Not sure', icon: 'M9 9a3 3 0 1 1 4 2.8c-.6.3-1 .9-1 1.6V14M12 18h.01' },
];

// ── Engine plumbing ─────────────────────────────────────
const deviceId = () => {
  let id = localStorage.getItem('wr_device');
  if (!id) localStorage.setItem('wr_device', (id = crypto.randomUUID()));
  return id;
};
const num = (f: () => number | undefined) => {
  try { const v = f(); return typeof v === 'number' && Number.isFinite(v) ? v : null; } catch { return null; }
};
const read = (r: any): Metrics => ({
  down: num(() => r.getDownloadBandwidth() / 1e6),
  up: num(() => r.getUploadBandwidth() / 1e6),
  ping: num(() => r.getUnloadedLatency()),
  jitter: num(() => r.getUnloadedJitter()),
  loss: num(() => r.getPacketLoss()),
});
function runEngine(config: object, onProgress: (m: Metrics, stage: Stage) => void) {
  return new Promise<Metrics>((resolve) => {
    const t = new SpeedTestEngine(config as any);
    t.onResultsChange = ({ type }) => onProgress(read(t.results), type as Stage);
    t.onFinish = (r) => resolve(read(r));
    t.onError = (e) => console.warn('speedtest:', e); // single failed measurements are non-fatal
  });
}

// ── Small presentational pieces ─────────────────────────
const tier = (mbps: number) => (mbps >= 100 ? 'Blazing' : mbps >= 50 ? 'Fast' : mbps >= 25 ? 'Solid' : mbps >= 10 ? 'Okay' : 'Slow');
const f1 = (v: number | null | undefined) => (v == null ? '—' : v < 10 ? v.toFixed(1) : Math.round(v).toString());
const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);

function Steps({ stage, done }: { stage: Stage | null; done: boolean }) {
  const order = ['latency', 'download', 'upload'] as const;
  const names = { latency: 'Ping', download: 'Download', upload: 'Upload' };
  const cur = order.indexOf((stage === 'packetLoss' ? 'upload' : stage ?? 'latency') as (typeof order)[number]);
  return (
    <div className="steps" aria-hidden="true">
      {order.map((s, i) => <span key={s} className={`step ${done || i < cur ? 'done' : i === cur ? 'active' : ''}`}>{names[s]}</span>)}
    </div>
  );
}

function ResultPanel({ title, sub, m, peer }: { title: string; sub: string; m: Metrics | null; peer?: number | null }) {
  return (
    <section className="result rise">
      <header><h3>{title}</h3><span className="muted">{sub}</span></header>
      {m ? (
        <dl className="stat-row">
          <div className="stat"><dt>Download</dt><dd>{f1(m.down)}<small>Mbps</small></dd></div>
          <div className="stat"><dt>Upload</dt><dd>{f1(m.up)}<small>Mbps</small></dd></div>
          <div className="stat"><dt>Ping</dt><dd>{f1(m.ping)}<small>ms</small></dd></div>
          <div className="stat"><dt>Jitter</dt><dd>{f1(m.jitter)}<small>ms</small></dd></div>
          {'loss' in m && m.loss != null && <div className="stat"><dt>Loss</dt><dd>{(m.loss * 100).toFixed(1)}<small>%</small></dd></div>}
        </dl>
      ) : <p className="muted">Not measured.</p>}
      {peer != null && m?.down != null && (
        <p className="peer">
          Others on this ISP in your area get <strong className="num">{f1(peer)} Mbps</strong> (median).{' '}
          {m.down >= peer * 1.1 ? 'You’re above typical.' : m.down <= peer * 0.9 ? 'You’re below typical: check your router or plan.' : 'You’re right on typical.'}
        </p>
      )}
    </section>
  );
}

async function shareImage(isp: string, area: string, m: Metrics | null) {
  await Promise.all(['900 150px "Doto Variable"', '900 150px "DotPunct"', '500 64px "Space Grotesk Variable"'].map((f) => document.fonts.load(f))).catch(() => {});
  const W = 1080, H = 1080, INK = '#191a23', LIME = '#b9ff66', c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const sans = (w: number, px: number) => `${w} ${px}px "Space Grotesk Variable", system-ui, sans-serif`;
  const dot = (px: number) => `900 ${px}px "DotPunct", "Doto Variable", monospace`;
  g.fillStyle = '#f3f3f1'; g.fillRect(0, 0, W, H);
  // halftone corner
  g.fillStyle = 'rgba(25,26,35,0.14)';
  for (let y = 14; y < 420; y += 18) for (let x = W - 14; x > 560; x -= 18) {
    const r = 3.2 * Math.max(0, 1 - Math.hypot(W - x, y) / 520);
    if (r > 0.4) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  }
  // logo
  g.fillStyle = INK; g.beginPath(); g.roundRect(70, 70, 84, 84, 24); g.fill();
  g.strokeStyle = LIME; g.lineWidth = 7; g.lineCap = 'round';
  g.beginPath(); g.arc(112, 122, 33, Math.PI * 1.22, Math.PI * 1.78); g.stroke();
  g.beginPath(); g.arc(112, 122, 19, Math.PI * 1.22, Math.PI * 1.78); g.stroke();
  g.fillStyle = LIME; g.beginPath(); g.arc(112, 124, 6, 0, Math.PI * 2); g.fill();
  g.fillStyle = INK; g.font = sans(600, 44); g.fillText('WifiRank', 176, 128);

  g.font = sans(500, 82); g.fillText(isp, 70, 300, 940);
  g.fillStyle = '#4a4c57'; g.font = sans(400, 38); g.fillText(`${area}, Dhaka`, 70, 362, 940);

  // result card: ink outline with a hard shadow
  const y = 430, h = 440;
  g.fillStyle = INK; g.beginPath(); g.roundRect(70, y + 12, W - 140, h, 56); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.roundRect(70, y, W - 140, h, 56); g.fill();
  g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
  const label = (t: string, x: number, ly: number, hl = false) => {
    g.font = sans(500, 30);
    if (hl) { g.fillStyle = LIME; g.beginPath(); g.roundRect(x - 10, ly - 34, g.measureText(t).width + 20, 46, 9); g.fill(); }
    g.fillStyle = hl ? INK : '#6c6e79'; g.fillText(t, x, ly);
  };
  label('Download', 124, y + 88, true);
  g.fillStyle = INK; g.font = dot(210); g.fillText(f1(m?.down), 116, y + 290);
  g.fillStyle = '#6c6e79'; g.font = sans(500, 34); g.fillText('Mbps', 124, y + 350);
  label('Upload', 640, y + 88); g.fillStyle = INK; g.font = dot(92); g.fillText(f1(m?.up), 636, y + 180);
  g.fillStyle = '#6c6e79'; g.font = sans(500, 26); g.fillText('Mbps', 640, y + 216);
  label('Ping', 640, y + 290); g.fillStyle = INK; g.font = dot(92); g.fillText(f1(m?.ping), 636, y + 382);
  g.fillStyle = '#6c6e79'; g.font = sans(500, 26); g.fillText('ms', 640, y + 418);

  g.fillStyle = '#4a4c57'; g.font = sans(400, 32);
  g.fillText(`Compare ISPs in your area → ${location.host}`, 70, 990, 940);

  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
  const file = new File([blob], 'wifirank-result.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], text: `My ${isp} speed in ${area} on WifiRank` }).catch(() => {});
  } else {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: file.name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}

function Review({ ispId, ispName }: { ispId: number; ispName: string }) {
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | string>('idle');
  const words = ['', 'Terrible', 'Poor', 'Okay', 'Good', 'Excellent'];
  const submit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setState('sending');
    const res = await fetch('/api/reviews', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: deviceId(), ispId, stars, comment }),
    }).catch(() => null);
    if (res?.ok) {
      const r = (e as any).target?.getBoundingClientRect?.();
      if (r) burst(r.left + r.width / 2, r.top + 40, 40);
    }
    setState(res?.ok ? 'done' : (await res?.json().catch(() => null))?.error ?? 'Couldn’t send. Try again.');
  };
  if (state === 'done') return <div className="card review-done rise"><strong>Thanks for the review.</strong> <span className="muted">Run another test any time to update it.</span></div>;
  return (
    <form className="card review rise" onSubmit={submit} style={{ ['--i' as any]: 2 }}>
      <h3>How is {ispName} overall? <span className="muted">Optional</span></h3>
      <p className="muted">Speed is half the story. Uptime, support and value matter too.</p>
      <div className="star-input" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} role="radio" aria-checked={stars === n} aria-label={`${n} star${n > 1 ? 's' : ''}: ${words[n]}`}
            className={n <= (hover || stars) ? 'on' : ''} onMouseEnter={() => setHover(n)} onClick={() => setStars(n)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" /></svg>
          </button>
        ))}
        <span className="star-word" aria-hidden="true">{words[hover || stars]}</span>
      </div>
      <textarea className="input" maxLength={1000} rows={3} value={comment} onChange={(e) => setComment(e.target.value)}
        placeholder="Outages? Support response? Worth the price? (optional)" aria-label="Comment" />
      <div className="row-between">
        <small className="muted">Anonymous. Be fair, and don’t include personal details.</small>
        <button className="btn btn-primary" disabled={!stars || state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Post review'}</button>
      </div>
      {state !== 'idle' && state !== 'sending' && <p className="error" role="alert">{state}</p>}
    </form>
  );
}

// ── Main flow ───────────────────────────────────────────
export default function SpeedTest({ isps }: { isps: Isp[] }) {
  const [phase, setPhase] = useState<'setup' | 'running' | 'saving' | 'done'>('setup');
  const [isp, setIsp] = useState<{ id?: number; name: string }>({ name: '' });
  const [area, setArea] = useState('');
  const [pin, setPin] = useState<{ lat: number; lng: number; area: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [connection, setConnection] = useState('');
  const [plan, setPlan] = useState('');
  const [price, setPrice] = useState('');
  const [stage, setStage] = useState<Stage | null>(null);
  const [live, setLive] = useState<Metrics | null>(null);
  const [local, setLocal] = useState<Metrics | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [error, setError] = useState('');
  const [tried, setTried] = useState(false);

  // Restore last choices so repeat testers start in one tap.
  useEffect(() => {
    try {
      const last = JSON.parse(localStorage.getItem('wr_last') ?? 'null');
      if (last) { setIsp(last.isp ?? { name: '' }); setArea(last.area ?? ''); setConnection(last.connection ?? ''); setPlan(last.plan ?? ''); setPrice(last.price ?? ''); }
    } catch {}
  }, []);

  const ispOptions = useMemo<Option[]>(() => isps.map((i) => ({ value: String(i.id), label: i.name, terms: i.aliases })), [isps]);
  const areaOptions = useMemo<Option[]>(() => Object.entries(AREAS).map(([value, label]) => ({ value, label })), []);
  const missing = !isp.name.trim() ? 'isp' : !area ? 'area' : !connection ? 'connection' : null;

  // Refs so the async run reads optional answers given while the test was running.
  const planRef = useRef(plan), priceRef = useRef(price);
  planRef.current = plan;
  priceRef.current = price;

  const start = async () => {
    setTried(true);
    if (missing) {
      document.getElementById(`f-${missing}`)?.focus();
      return;
    }
    localStorage.setItem('wr_last', JSON.stringify({ isp, area, connection, plan, price }));
    setError(''); setLocal(null); setSaved(null); setLive(null); setStage(null);
    setPhase('running');

    const creds = await fetch('/api/turn-creds').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const m = [...MEASUREMENTS];
    if (creds) m.splice(6, 0, { type: 'packetLoss', numPackets: 1e3, responsesWaitTime: 3000 } as any);
    const progress = (x: Metrics, s: Stage) => { setLive(x); setStage(s); };
    let i = await runEngine({ measurements: m, ...(creds && { turnServerUser: creds.username, turnServerPass: creds.credential }) }, progress);
    if (!creds) i = { ...i, loss: null };
    setLocal(i);

    setPhase('saving');
    // Plan/price may have been filled in while the test ran, so read them now.
    const res = await fetch('/api/tests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: deviceId(), ...(isp.id ? { ispId: isp.id } : { ispName: isp.name }), area, connection,
        plan: planRef.current || null, price: priceRef.current || null, ...(pin && { lat: pin.lat, lng: pin.lng }), local: i,
      }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (!res?.ok) {
      setError(body?.error ?? 'Couldn’t save your result. Check your connection and try again.');
      setPhase('done');
      return;
    }
    setSaved(body);
    if (!body.flag) {
      const r = document.querySelector('.gauge')?.getBoundingClientRect();
      if (r) burst(r.left + r.width / 2, r.top + r.height / 2);
      navigator.vibrate?.(30);
    }
    setPhase('done');
  };

  useEffect(() => { localStorage.setItem('wr_last', JSON.stringify({ isp, area, connection, plan, price })); }, [plan, price]);

  const gaugeValue = phase === 'running'
    ? stage === 'upload' ? live?.up ?? null : stage === 'download' || stage === 'packetLoss' ? live?.down ?? null : null
    : null;
  const gaugeLabel = phase === 'running'
    ? stage === 'upload' ? 'Upload' : stage === 'latency' || !stage ? 'Ping' : 'Download'
    : '';
  const areaName = AREAS[area] ?? '';
  // A comparison with "others" only means something once there are a few of them.
  const peer = saved?.peer && saved.peer.devices >= 3 ? saved.peer : null;

  return (
    <div className="tester">
      <div className="tester-grid">
        {/* Left: setup, then optional details while the test runs */}
        <div className="tester-side">
          {phase === 'setup' ? (
            <form className="setup" onSubmit={(e) => { e.preventDefault(); start(); }} noValidate>
              <div className="field">
                <span className="label" id="l-isp">Internet provider</span>
                <Combobox id="f-isp" aria-labelledby="l-isp" options={ispOptions} value={isp.id ? String(isp.id) : ''} text={isp.name}
                  placeholder="Search, e.g. Link3, Carnival, DOT"
                  allowCustom={(t) => `Add “${t}”`}
                  onSelect={(o, t) => setIsp(o ? { id: Number(o.value), name: o.label } : { name: t })} />
                {tried && missing === 'isp' && <small className="error">Choose or type your provider.</small>}
                {!isp.id && isp.name.trim().length > 1 && <small className="muted">New provider: it’ll appear on the site after a quick check.</small>}
              </div>

              <div className="field">
                <span className="label" id="l-area">Area
                  {pin && <span className="badge"><Icon d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" /> Pinned</span>}
                </span>
                <div className="area-row">
                  <Combobox id="f-area" aria-labelledby="l-area" options={areaOptions} value={area} placeholder="Search, e.g. Mirpur 10"
                    onSelect={(o) => { setArea(o?.value ?? ''); if (o && pin && o.value !== pin.area) setPin(null); }} />
                  <button type="button" className="btn map-btn" onClick={() => setPickerOpen(true)} aria-label="Pick your location on a map">
                    <Icon d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" /><span>Map</span>
                  </button>
                </div>
                {tried && missing === 'area' && <small className="error">Pick your area, or tap it on the map.</small>}
                {!tried && <small className="muted">Area not listed? Tap “Map” and drop a pin where you are.</small>}
              </div>

              <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="label">This device is on</legend>
                <div className="seg" id="f-connection" tabIndex={-1}>
                  {CONN.map((c) => (
                    <label key={c.value}>
                      <input type="radio" name="conn" value={c.value} checked={connection === c.value} onChange={() => setConnection(c.value)} />
                      <span><Icon d={c.icon} />{c.label}</span>
                    </label>
                  ))}
                </div>
                {tried && missing === 'connection' ? <small className="error">How is this device connected?</small>
                  : <small className="muted hint-wide">Cable gives the truest ISP speed. 2.4 GHz Wi-Fi often caps below your plan.</small>}
              </fieldset>

              {error && <p className="error" role="alert">{error}</p>}
              <button className="btn btn-primary go-mobile">Start test</button>
            </form>
          ) : (
            <div className="extras">
              <div className="extras-head">
                <h2>{isp.name}</h2>
                <p className="muted">{areaName} · {CONN.find((c) => c.value === connection)?.label}</p>
              </div>
              {phase === 'running' || phase === 'saving' ? (
                <>
                  <p className="eyebrow">While you wait</p>
                  <p className="text-2" style={{ marginTop: -6 }}>Help others compare fairly. Both optional.</p>
                  <div className="field">
                    <span className="label">Your package speed</span>
                    <div className="chips">
                      {Object.entries(PLANS).map(([k, v]) => (
                        <label key={k}><input type="radio" name="plan" checked={plan === k} onChange={() => setPlan(k)} onClick={() => plan === k && setPlan('')} /><span>{v}</span></label>
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <span className="label">Monthly bill</span>
                    <div className="chips">
                      {Object.entries(PRICES).map(([k, v]) => (
                        <label key={k}><input type="radio" name="price" checked={price === k} onChange={() => setPrice(k)} onClick={() => price === k && setPrice('')} /><span>{v}</span></label>
                      ))}
                    </div>
                  </div>
                  <p className="muted small">Keep this tab open, and pause downloads and streaming on your network for the most accurate result.</p>
                </>
              ) : (
                <div className="done-actions rise">
                  {saved && !saved.flag && <p className="saved"><Icon d="M20 6 9 17l-5-5" /> Saved to the {areaName} map</p>}
                  {saved && !saved.flag && saved.peer && (
                    <p className="thanks">
                      Thank you. {saved.peer.devices <= 1
                        ? <>You’re the <strong>first person</strong> to test {isp.name} in {areaName}.</>
                        : <>You’re tester <strong className="num">#{saved.peer.devices}</strong> for {isp.name} in {areaName}.</>}
                    </p>
                  )}
                  <button type="button" className="btn btn-primary" onClick={() => shareImage(isp.name, areaName, local)}>
                    <Icon d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13" /> Share result
                  </button>
                  <a className="btn" href={`/area/${area}`}>Compare ISPs in {areaName}</a>
                  <button type="button" className="btn btn-ghost" onClick={() => { setPhase('setup'); setStage(null); }}>Test again</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: the gauge doubles as the start button */}
        <div className={`tester-stage ${phase === 'done' ? 'done' : ''}`}>
          {phase === 'running' && <dither-art class="stream" mode="stream" cell="8" dir={stage === 'upload' ? 'up' : stage === 'download' || stage === 'packetLoss' ? 'down' : 'idle'} aria-hidden="true" />}
          {phase === 'setup' ? (
            <Gauge value={null}>
              <button type="button" className={`go ${missing ? '' : 'ready magnetic'}`} onClick={start} aria-describedby={missing ? 'go-hint' : undefined}>
                <span>GO</span>
              </button>
              <span id="go-hint" className="go-hint">{missing ? 'Fill in the left first' : 'Takes about 40 seconds'}</span>
            </Gauge>
          ) : (
            <>
              <Gauge value={phase === 'running' ? gaugeValue : local?.down ?? null} active={phase === 'running'}
                label={phase === 'running' ? gaugeLabel : 'Download'}
                unit={phase === 'running' && (stage === 'latency' || !stage) ? 'ms' : 'Mbps'}>
                {phase === 'running' && (stage === 'latency' || !stage) ? (
                  <><div className="g-label">{gaugeLabel}</div><div className="g-value num">{f1(live?.ping)}</div><div className="g-unit">ms</div></>
                ) : undefined}
              </Gauge>
              <Steps stage={stage} done={phase !== 'running'} />
              {phase === 'done' && local?.down != null && <span className="tier">{tier(local.down)} connection</span>}
              <p className="sr-only" aria-live="polite">{phase === 'saving' ? 'Test finished, saving' : phase === 'done' ? 'Test complete' : ''}</p>
            </>
          )}
        </div>
      </div>

      {(phase === 'done' || phase === 'saving') && (
        <div className="results">
          {saved?.flag && (
            <div className="notice rise" role="status">
              <Icon d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
              <span>{saved.flag === 'mobile_data'
                ? <>This ran over <strong>mobile data ({saved.asOrg})</strong>, so it won’t count toward {isp.name}. Switch to your home Wi-Fi or cable and test again.</>
                : <>Your connection appears to be <strong>outside Bangladesh</strong> (a VPN?), so it won’t count. Turn the VPN off and test again.</>}</span>
            </div>
          )}
          <ResultPanel title="Your result" sub="Measured against Cloudflare’s server in Dhaka" m={local} peer={peer?.local_down} />
          {saved && !saved.flag && <Review ispId={saved.ispId} ispName={isp.name} />}
        </div>
      )}

      <LocationPicker open={pickerOpen} initial={pin} area={area} onClose={() => setPickerOpen(false)}
        onPick={(p) => { setPin(p); setArea(p.area); setPickerOpen(false); }} />
    </div>
  );
}
