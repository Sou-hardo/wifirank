// Loaded lazily (dynamic import) so pages only pay for MapLibre when a map is actually shown.
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre 6 resolves its worker relative to its own file, which bundling breaks; hand it Vite's bundled worker.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { BD_BOUNDS, DHAKA_CENTER } from '../lib/areas';

maplibregl.setWorkerUrl(workerUrl);

export { maplibregl };

// Speed ramp (slow → fast), same tokens as CSS --s1..--s5; on a light map darker means faster.
// Bins chosen for typical Dhaka home plans.
export const RAMP = ['#7fb41b', '#5f9413', '#44740f', '#2d540c', '#183608'];
export const METRICS = {
  local_down: { label: 'Download', long: 'Download', unit: 'Mbps', bins: [10, 25, 50, 100], lowerIsBetter: false },
  local_up: { label: 'Upload', long: 'Upload', unit: 'Mbps', bins: [10, 25, 50, 100], lowerIsBetter: false },
  local_ping: { label: 'Ping', long: 'Ping (latency)', unit: 'ms', bins: [5, 10, 20, 40], lowerIsBetter: true },
} as const;
export type MetricKey = keyof typeof METRICS;

// MapLibre expression: bin the metric into the ramp; darker is always better.
export function colorExpr(metric: MetricKey): any {
  const m = METRICS[metric];
  const colors = m.lowerIsBetter ? [...RAMP].reverse() : RAMP;
  const steps = m.bins.flatMap((b, i) => [b, colors[i + 1]]);
  return ['case', ['==', ['get', metric], null], '#b4b6bd', ['step', ['get', metric], colors[0], ...steps]];
}

export function binColor(metric: MetricKey, v: number | null) {
  if (v == null) return '#b4b6bd';
  const m = METRICS[metric];
  const i = m.bins.filter((b) => v >= b).length;
  return (m.lowerIsBetter ? [...RAMP].reverse() : RAMP)[i];
}

export function createMap(container: HTMLElement, opts: Partial<maplibregl.MapOptions> = {}) {
  const [w, s, e, n] = BD_BOUNDS;
  const map = new maplibregl.Map({
    container,
    style: 'https://tiles.openfreemap.org/styles/positron',
    center: DHAKA_CENTER,
    zoom: 11.2,
    minZoom: 6,
    maxZoom: 17,
    maxBounds: [[w - 0.5, s - 0.5], [e + 0.5, n + 0.5]],
    attributionControl: { compact: true },
    dragRotate: false,
    pitchWithRotate: false,
    ...opts,
  });
  map.touchZoomRotate.disableRotation();
  // Compact attribution starts expanded on wide maps; fold it to the ⓘ button (OSM credit stays one tap away).
  map.once('load', () => container.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show'));
  return map;
}
