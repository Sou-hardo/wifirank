import { useEffect, useRef, useState } from 'react';
import type { MapArea } from '../lib/mapData';

type LngLat = [number, number];
type Props = { phase: 'setup' | 'running' | 'saving' | 'done'; stage: string | null; mbps: number | null; at: LngLat | null; result: number | null; areas: MapArea[] };

// ponytail: illustrative spot for Cloudflare's Dhaka edge; the real site isn't published.
const EDGE: LngLat = [90.3925, 23.7639];
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const fc = (features: object[]) => ({ type: 'FeatureCollection', features });
const pt = (c: LngLat, properties = {}) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties });
const f1 = (v: number) => (v < 10 ? v.toFixed(1) : Math.round(v).toString());

// Quadratic bend between two points so the link reads as a flight path, not a ruler line.
function arc([x0, y0]: LngLat, [x1, y1]: LngLat, n = 120): LngLat[] {
  const cx = (x0 + x1) / 2 - (y1 - y0) * 0.4, cy = (y0 + y1) / 2 + (x1 - x0) * 0.4;
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, u = 1 - t;
    return [u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1];
  });
}

// Map padding that keeps the subject clear of whatever floats over the map ([data-over] siblings).
function padding(map: HTMLElement) {
  const m = map.getBoundingClientRect(), p = { top: 60, bottom: 60, left: 60, right: 60 };
  map.parentElement?.querySelectorAll('[data-over]').forEach((o) => {
    const r = o.getBoundingClientRect();
    if (!r.width || r.bottom <= m.top || r.top >= m.bottom) return;
    if (r.width > m.width * 0.6) {
      if (r.top > m.top + m.height / 2) p.bottom = Math.max(p.bottom, m.bottom - r.top + 30);
    } else if (r.left + r.width / 2 < m.left + m.width / 2) p.left = Math.max(p.left, r.right - m.left + 40);
    else p.right = Math.max(p.right, m.right - r.left + 40);
  });
  // Never pad the map shut on narrow screens.
  const squeeze = Math.min(1, (m.width - 120) / (p.left + p.right));
  return { ...p, left: p.left * squeeze, right: p.right * squeeze };
}

// The stage the speed test plays on: flies to the tester, streams packets to and from the edge,
// sways while measuring, then lands a pin coloured by the result.
export default function TestMap({ phase, stage, mbps, at, result, areas }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const core = useRef<any>(null);
  const me = useRef<{ marker: any; node: HTMLDivElement } | null>(null);
  const [ready, setReady] = useState(false);
  const live = useRef({ stage, mbps });
  live.current = { stage, mbps };

  // Camera that fits these points into the part of the map nothing floats over.
  // The map's own padding stays at zero: cameraForBounds adds it on top of ours.
  const frame = (pts: LngLat[], maxZoom: number) => {
    const lngs = pts.map((p) => p[0]), lats = pts.map((p) => p[1]);
    return mapRef.current.cameraForBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: padding(el.current!), maxZoom });
  };

  useEffect(() => {
    let dead = false;
    import('./mapCore').then((c) => {
      if (dead || !el.current) return;
      core.current = c;
      const map = c.createMap(el.current, { interactive: false, zoom: 11.3 });
      mapRef.current = map;
      map.on('load', () => {
        map.addSource('areas', { type: 'geojson', data: fc(areas.filter((a) => a.devices > 0).map((a) => pt([a.lng, a.lat], a))) as any });
        map.addLayer({ id: 'areas', type: 'circle', source: 'areas', paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, ['interpolate', ['linear'], ['sqrt', ['get', 'devices']], 1, 4, 15, 12], 14, ['interpolate', ['linear'], ['sqrt', ['get', 'devices']], 1, 9, 15, 28]],
          'circle-color': c.colorExpr('local_down'), 'circle-opacity': 0.55, 'circle-stroke-width': 1.5, 'circle-stroke-color': '#ffffff',
          'circle-opacity-transition': { duration: 600 } } });
        map.addSource('arc', { type: 'geojson', data: fc([]) as any });
        map.addLayer({ id: 'arc', type: 'line', source: 'arc', layout: { 'line-cap': 'round' },
          paint: { 'line-color': '#191a23', 'line-width': 1.6, 'line-dasharray': [1, 2.5], 'line-opacity': 0.7 } });
        map.addSource('packets', { type: 'geojson', data: fc([]) as any });
        map.addLayer({ id: 'packets', type: 'circle', source: 'packets',
          paint: { 'circle-radius': ['get', 'r'], 'circle-color': '#b9ff66', 'circle-stroke-width': 1.5, 'circle-stroke-color': '#191a23' } });

        const edge = Object.assign(document.createElement('div'), { className: 'tm-edge', innerHTML: '<b></b><span>Cloudflare · Dhaka</span>' });
        new c.maplibregl.Marker({ element: edge }).setLngLat(EDGE).addTo(map);
        const node = Object.assign(document.createElement('div'), { className: 'tm-me', innerHTML: '<i></i><i></i><i></i><b></b><span></span>' });
        me.current = { node, marker: new c.maplibregl.Marker({ element: node }).setLngLat(EDGE) };
        setReady(true);
      });
    });
    return () => { dead = true; mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  // Picking an area pans to it, so the map answers the form before the test even starts.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || phase !== 'setup') return;
    me.current!.node.classList.remove('landed');
    if (!at) return void me.current!.marker.remove();
    me.current!.marker.setLngLat(at).addTo(map);
    map.easeTo({ ...frame([at], 12.6), pitch: 0, duration: calm() ? 0 : 1600 });
  }, [ready, phase, at?.[0], at?.[1]]);

  // The run: fly in at an angle, then sway and stream packets until the engine finishes.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !at || phase !== 'running') return;
    const path = arc(EDGE, at), still = calm();
    map.getSource('arc').setData(fc([{ type: 'Feature', geometry: { type: 'LineString', coordinates: path }, properties: {} }]));
    map.setPaintProperty('areas', 'circle-opacity', 0.25);
    me.current!.marker.setLngLat(at).addTo(map);
    let swaying = false, sway = 0;
    // Framed flat, then tilted: the near half grows under pitch, so back off half a zoom to keep both ends clear.
    const cam = frame([EDGE, at], 14.5);
    map.flyTo({ ...cam, zoom: cam.zoom - 0.5, pitch: 55, bearing: -18, duration: still ? 0 : 2600, essential: true });
    map.once('moveend', () => { swaying = !still; });

    let raf = 0, last = performance.now(), clock = 0;
    const N = 9;
    const tick = (t: number) => {
      const dt = Math.min(t - last, 64); last = t;
      const { stage: s, mbps: v } = live.current;
      // Packets move faster as the measured speed rises; ping just bounces a single probe.
      const rate = s === 'latency' || !s ? 0.5 : 0.12 + Math.log10(1 + (v ?? 0)) * 0.22;
      clock += (dt / 1000) * rate;
      const up = s === 'upload';
      const count = s === 'latency' || !s ? 1 : N;
      const feats = Array.from({ length: count }, (_, i) => {
        let k = (clock + i / count) % 1;
        if (count === 1) k = 1 - Math.abs(1 - 2 * k); // ping-pong
        if (up) k = 1 - k;
        return pt(path[Math.round(k * (path.length - 1))], { r: 3 + 2 * Math.sin(Math.PI * k) });
      });
      map.getSource('packets').setData(fc(feats));
      // A slow sway rather than a full orbit, so both ends stay inside the framed area.
      if (swaying) map.setBearing(-18 + 10 * Math.sin((sway += dt) / 2600));
      me.current!.node.style.setProperty('--beat', `${Math.max(0.5, 2.2 - Math.log10(1 + (v ?? 0)) * 0.6)}s`);
      raf = requestAnimationFrame(tick);
    };
    if (!still) raf = requestAnimationFrame(tick);
    me.current!.node.classList.add('busy');
    return () => {
      cancelAnimationFrame(raf);
      me.current!.node.classList.remove('busy');
      map.getSource('packets').setData(fc([]));
    };
  }, [ready, phase === 'running']);

  // Landing: settle top-down over the tester and drop a pin in the result's speed colour.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !at || phase !== 'done') return;
    map.getSource('arc').setData(fc([]));
    map.setPaintProperty('areas', 'circle-opacity', 0.55);
    map.easeTo({ ...frame([at], 13.2), pitch: 0, duration: calm() ? 0 : 1800 });
    const { node } = me.current!;
    node.style.setProperty('--pin', core.current.binColor('local_down', result));
    node.querySelector('span')!.textContent = result == null ? '' : `${f1(result)} Mbps`;
    node.classList.add('landed');
  }, [ready, phase === 'done']);

  return <div className="tmap" ref={el} aria-hidden="true" />;
}
