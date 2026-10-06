import { useEffect, useMemo, useRef, useState } from 'react';
import type { MapArea, MapPoint } from '../lib/mapData';
import Combobox, { type Option } from './Combobox';

type Data = { isp: { name: string; slug: string } | null; areas: MapArea[]; points: MapPoint[] };
type MetricKey = 'local_down' | 'local_up' | 'local_ping';
type AreaIsp = { name: string; slug: string; devices: number; local_down: number | null; local_up: number | null; local_ping: number | null; rating: number | null };
type Props = { initial: Data; isps: { slug: string; name: string }[]; compact?: boolean };

// Mirrors mapCore.METRICS so the panel can render before MapLibre has loaded.
const METRICS: Record<MetricKey, { label: string; long: string; unit: string; bins: number[]; lowerIsBetter: boolean }> = {
  local_down: { label: 'Download', long: 'Download', unit: 'Mbps', bins: [10, 25, 50, 100], lowerIsBetter: false },
  local_up: { label: 'Upload', long: 'Upload', unit: 'Mbps', bins: [10, 25, 50, 100], lowerIsBetter: false },
  local_ping: { label: 'Ping', long: 'Ping (latency)', unit: 'ms', bins: [5, 10, 20, 40], lowerIsBetter: true },
};
const RAMP = ['#7fb41b', '#5f9413', '#44740f', '#2d540c', '#183608'];
const fmt = (v: number | null | undefined) => (v == null ? '—' : v < 10 ? v.toFixed(1) : Math.round(v).toString());

const geo = (d: Data) => ({
  areas: { type: 'FeatureCollection', features: d.areas.map((a) => ({ type: 'Feature', id: a.slug, geometry: { type: 'Point', coordinates: [a.lng, a.lat] }, properties: a })) },
  points: { type: 'FeatureCollection', features: d.points.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: p })) },
});

export default function DhakaMap({ initial, isps, compact }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const core = useRef<any>(null);
  const [data, setData] = useState(initial);
  const [metric, setMetric] = useState<MetricKey>('local_down');
  const [selected, setSelected] = useState<string | null>(null);
  const [areaIsps, setAreaIsps] = useState<AreaIsp[] | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState(false);

  const m = METRICS[metric];
  const ispOptions = useMemo<Option[]>(() => [{ value: '', label: 'All providers' }, ...isps.map((i) => ({ value: i.slug, label: i.name }))], [isps]);
  const hasMetric = data.areas.some((a) => a[metric] != null);
  const top = useMemo(() => data.areas.filter((a) => a[metric] != null)
    .sort((a, b) => (m.lowerIsBetter ? a[metric]! - b[metric]! : b[metric]! - a[metric]!)).slice(0, compact ? 5 : 8), [data, metric]);
  const sel = data.areas.find((a) => a.slug === selected) ?? null;

  const metricRef = useRef(metric);
  metricRef.current = metric;

  // ── Map setup (once) ──
  useEffect(() => {
    let dead = false;
    import('./mapCore').then((c) => {
      if (dead || !el.current) return;
      core.current = c;
      const map = c.createMap(el.current, compact ? { cooperativeGestures: true } : {});
      mapRef.current = map;
      if (!compact) map.addControl(new c.maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
      const popup = new c.maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14, className: 'map-tip' });

      map.on('load', () => {
        const g = geo(data);
        map.addSource('areas', { type: 'geojson', data: g.areas as any, promoteId: 'slug' });
        map.addSource('points', { type: 'geojson', data: g.points as any });
        // Individual pinned results: only when zoomed in, under the area bubbles.
        map.addLayer({ id: 'points', type: 'circle', source: 'points', minzoom: 12.5,
          paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12.5, 2.5, 16, 6], 'circle-color': c.colorExpr(metric),
            'circle-opacity': 0.9, 'circle-stroke-width': 1, 'circle-stroke-color': '#ffffff' } });
        // Areas with no tests yet: hollow markers that invite the first test.
        map.addLayer({ id: 'areas-empty', type: 'circle', source: 'areas', filter: ['==', ['get', 'devices'], 0],
          paint: { 'circle-radius': 3.5, 'circle-color': 'transparent', 'circle-stroke-width': 1.5, 'circle-stroke-color': '#8b8d98' } });
        map.addLayer({ id: 'areas', type: 'circle', source: 'areas', filter: ['>', ['get', 'devices'], 0],
          paint: {
            // Size grows with testers but is capped, so busy areas don't swallow their neighbours.
            'circle-radius': ['interpolate', ['linear'], ['zoom'],
              10, ['interpolate', ['linear'], ['sqrt', ['get', 'devices']], 1, 4, 5, 8, 15, 13],
              14, ['interpolate', ['linear'], ['sqrt', ['get', 'devices']], 1, 9, 5, 18, 15, 30]],
            'circle-color': c.colorExpr(metric),
            'circle-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0.9],
            'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3.5, 2],
            'circle-stroke-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#191a23', '#ffffff'],
            'circle-radius-transition': { duration: 500 }, 'circle-color-transition': { duration: 400 },
          } });
        map.addLayer({ id: 'area-labels', type: 'symbol', source: 'areas', minzoom: 11.6, filter: ['>', ['get', 'devices'], 0],
          layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 1.6], 'text-anchor': 'top', 'text-optional': true },
          paint: { 'text-color': '#191a23', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 } });

        let hovered: string | null = null;
        const hover = (id: string | null) => {
          if (hovered) map.setFeatureState({ source: 'areas', id: hovered }, { hover: false });
          hovered = id;
          if (id) map.setFeatureState({ source: 'areas', id }, { hover: true });
        };
        for (const layer of ['areas', 'areas-empty']) {
          map.on('mousemove', layer, (e: any) => {
            const p = e.features[0].properties;
            map.getCanvas().style.cursor = 'pointer';
            hover(p.slug);
            const key = metricRef.current, mm = METRICS[key];
            popup.setLngLat(e.features[0].geometry.coordinates).setHTML(
              `<strong>${p.name}</strong>` + (p.devices
                ? `<span class="tip-v">${fmt(p[key] ?? null)} <small>${mm.unit}</small></span><small>${mm.long} · ${p.devices} tester${p.devices > 1 ? 's' : ''}</small>`
                : `<small>No tests yet. Be the first.</small>`)).addTo(map);
          });
          map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; hover(null); popup.remove(); });
          map.on('click', layer, (e: any) => setSelected(e.features[0].properties.slug));
        }
        map.on('mousemove', 'points', (e: any) => {
          const p = e.features[0].properties, key = metricRef.current;
          popup.setLngLat(e.lngLat).setHTML(`<strong>${p.isp}</strong><span class="tip-v">${fmt(p[key] ?? null)} <small>${METRICS[key].unit}</small></span><small>${new Date(p.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · one test</small>`).addTo(map);
        });
        map.on('mouseleave', 'points', () => popup.remove());
        setStatus('ready');
      });
      map.on('error', (e: any) => console.warn('map:', e?.error?.message ?? e));
      // Tile or sprite hiccups also emit 'error'; only a map that never loads is fatal.
      setTimeout(() => setStatus((s) => (s === 'loading' ? 'error' : s)), 20000);
    }).catch(() => setStatus('error'));
    return () => { dead = true; mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  // ── Keep the map in sync with state ──
  useEffect(() => {
    const map = mapRef.current;
    if (status !== 'ready' || !map) return;
    const expr = core.current.colorExpr(metric);
    map.setPaintProperty('areas', 'circle-color', expr);
    map.setPaintProperty('points', 'circle-color', expr);
  }, [metric, status]);

  useEffect(() => {
    const map = mapRef.current;
    if (status !== 'ready' || !map) return;
    const g = geo(data);
    map.getSource('areas').setData(g.areas);
    map.getSource('points').setData(g.points);
  }, [data, status]);

  const prevSel = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (status === 'ready' && map) {
      if (prevSel.current) map.setFeatureState({ source: 'areas', id: prevSel.current }, { selected: false });
      if (sel) {
        map.setFeatureState({ source: 'areas', id: sel.slug }, { selected: true });
        map.flyTo({ center: [sel.lng, sel.lat], zoom: Math.max(map.getZoom(), 13), duration: 900, essential: false });
      }
      prevSel.current = sel?.slug ?? null;
    }
    setAreaIsps(null);
    if (!selected) return;
    let stale = false;
    fetch(`/api/stats?area=${selected}&sort=${metric}`).then((r) => r.json()).then((j) => { if (!stale) setAreaIsps(j.isps.slice(0, 6)); }).catch(() => {});
    return () => { stale = true; };
  }, [selected, status]);

  const filterIsp = async (slug: string) => {
    setBusy(true);
    const d = await fetch(`/api/map${slug ? `?isp=${slug}` : ''}`).then((r) => r.json()).catch(() => null);
    if (d) setData(d);
    setBusy(false);
  };

  // One label per swatch; the ramp always runs worst → best (light → dark).
  const bands = [`<${m.bins[0]}`, ...m.bins.slice(1).map((b, i) => `${m.bins[i]}–${b}`), `${m.bins.at(-1)}+`];
  const ranges = m.lowerIsBetter ? bands.reverse() : bands;

  return (
    <div className={`dmap ${compact ? 'compact' : ''}`}>
      <div className="dmap-canvas" ref={el} role="application" aria-label="Map of Dhaka showing median internet speed by area">
        {status === 'loading' && <div className="map-msg">Loading map…</div>}
        {status === 'error' && <div className="map-msg">The map couldn’t load on this device. <a href="/isps">See the rankings instead</a>.</div>}
      </div>

      <aside className="dmap-panel" aria-busy={busy}>
        <div className="seg" role="radiogroup" aria-label="Metric shown on map">
          {(Object.keys(METRICS) as MetricKey[]).map((k) => (
            <label key={k}><input type="radio" name="metric" checked={metric === k} onChange={() => setMetric(k)} /><span>{METRICS[k].label}</span></label>
          ))}
        </div>

        {!compact && (
          <div className="field">
            <span className="label" id="l-map-isp">Provider</span>
            <Combobox aria-labelledby="l-map-isp" options={ispOptions} value={data.isp?.slug ?? ''} placeholder="All providers"
              onSelect={(o) => { if (o && o.value !== (data.isp?.slug ?? '')) filterIsp(o.value); }} />
          </div>
        )}

        <div className="dmap-legend">
          <div className="label-row"><span>{m.long}</span><span className="muted">{m.unit}{m.lowerIsBetter ? ' · lower is better' : ''}</span></div>
          <div className="legend">{RAMP.map((c) => <i key={c} style={{ background: c, flex: 1 }} />)}</div>
          <div className="legend-labels">{ranges.map((r) => <span key={r}>{r}</span>)}</div>
          <p className="muted small">Darker = faster. Bigger circle = more testers. Hollow dot = no tests yet.</p>
        </div>

        {sel ? (
          <div className="dmap-detail" key={sel.slug}>
            <div className="row-between">
              <h3>{sel.name}</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(null)} aria-label="Close area details">✕</button>
            </div>
            {sel.devices === 0 ? (
              <p className="text-2">No tests here yet. <a href="/">Run the first one</a> and put {sel.name} on the map.</p>
            ) : (
              <>
                <p className="muted small">{sel.devices} tester{sel.devices > 1 ? 's' : ''}{data.isp ? ` on ${data.isp.name}` : ''} · last 90 days</p>
                <ol className="dmap-list">
                  {(areaIsps ?? []).map((i, n) => (
                    <li key={i.slug} style={{ ['--i' as any]: n }} className="rise">
                      <a href={`/isp/${i.slug}`}>{i.name}</a>
                      <span className="num">{fmt(i[metric])}<small> {m.unit}</small></span>
                    </li>
                  ))}
                  {!areaIsps && <li className="muted">Loading providers…</li>}
                </ol>
                <a className="btn btn-sm" href={`/area/${sel.slug}`}>All providers in {sel.name} →</a>
              </>
            )}
          </div>
        ) : (
          <div className="dmap-detail">
            <h3>{m.lowerIsBetter ? 'Lowest' : 'Fastest'} areas{data.isp ? ` on ${data.isp.name}` : ''}</h3>
            {hasMetric ? (
              <ol className="dmap-list">
                {top.map((a) => (
                  <li key={a.slug}>
                    <button type="button" onClick={() => setSelected(a.slug)}>{a.name}</button>
                    <span className="num">{fmt(a[metric])}<small> {m.unit}</small></span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-2">No tests yet. <a href="/">Run a test</a> to add yours.</p>
            )}
          </div>
        )}
        {compact && <a className="btn btn-sm" href="/map">Open full map →</a>}
      </aside>
    </div>
  );
}
