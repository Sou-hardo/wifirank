import coords from '../../data/areas.json';
import { AREAS } from './options';

export const AREA_COORDS = coords as unknown as Record<string, [number, number]>;

// Nearest listed area to a tapped/GPS point. Plain lat/lng distance is fine at city scale.
export function nearestArea(lat: number, lng: number) {
  let best = '', bestD = Infinity;
  for (const [slug, [a, b]] of Object.entries(AREA_COORDS)) {
    const d = (a - lat) ** 2 + ((b - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (d < bestD && slug in AREAS) [best, bestD] = [slug, d];
  }
  return { slug: best, km: Math.sqrt(bestD) * 111 };
}

// Rough Dhaka metro bounds for the map: [west, south, east, north].
export const DHAKA_BOUNDS: [number, number, number, number] = [90.2, 23.62, 90.58, 23.98];
// Bangladesh bounds: how far the map lets you pan.
export const BD_BOUNDS: [number, number, number, number] = [88.0, 20.6, 92.7, 26.65];
export const DHAKA_CENTER: [number, number] = [90.4, 23.79];
