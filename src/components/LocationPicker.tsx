import { useEffect, useRef, useState } from 'react';
import { AREA_COORDS, nearestArea } from '../lib/areas';
import { AREAS } from '../lib/options';

type Pick = { lat: number; lng: number; area: string };
type Props = { open: boolean; initial: Pick | null; area: string; onClose: () => void; onPick: (p: Pick) => void };

// Native <dialog> with a tap-to-pin map. The nearest listed area is filled in for the user;
// the pin itself is what we store (rounded to ~500 m on the server).
export default function LocationPicker({ open, initial, area, onClose, onPick }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [pick, setPick] = useState<Pick | null>(initial);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [geo, setGeo] = useState('');

  useEffect(() => {
    const d = dialog.current!;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const place = (lng: number, lat: number, fly = false) => {
    const { slug } = nearestArea(lat, lng);
    setPick({ lat, lng, area: slug });
    markerRef.current?.setLngLat([lng, lat]).addTo(mapRef.current);
    if (fly) mapRef.current?.flyTo({ center: [lng, lat], zoom: 15, duration: 1200 });
  };

  useEffect(() => {
    if (!open || mapRef.current) return;
    let cancelled = false;
    import('./mapCore').then(({ createMap, maplibregl }) => {
      if (cancelled || !el.current) return;
      const start = initial ? [initial.lng, initial.lat] : AREA_COORDS[area] ? [AREA_COORDS[area][1], AREA_COORDS[area][0]] : null;
      const map = createMap(el.current, start ? { center: start as [number, number], zoom: 14 } : {});
      mapRef.current = map;
      const dot = document.createElement('div');
      dot.className = 'pin';
      markerRef.current = new maplibregl.Marker({ element: dot, draggable: true, anchor: 'bottom' });
      markerRef.current.on('dragend', () => {
        const { lng, lat } = markerRef.current.getLngLat();
        place(lng, lat);
      });
      if (initial) markerRef.current.setLngLat([initial.lng, initial.lat]).addTo(map);
      map.on('click', (e: any) => place(e.lngLat.lng, e.lngLat.lat));
      map.on('load', () => setStatus('ready'));
      map.on('error', (e: any) => console.warn('map:', e?.error?.message ?? e));
      // Tile or sprite hiccups also emit 'error'; only a map that never loads is fatal.
      setTimeout(() => setStatus((s) => (s === 'loading' ? 'error' : s)), 20000);
    }).catch(() => setStatus('error'));
    return () => { cancelled = true; };
  }, [open]);

  // The dialog animates in; MapLibre needs a resize once it has real dimensions.
  useEffect(() => { if (open) setTimeout(() => mapRef.current?.resize(), 250); }, [open]);

  const locate = () => {
    setGeo('Finding you…');
    navigator.geolocation.getCurrentPosition(
      (p) => { setGeo(''); place(p.coords.longitude, p.coords.latitude, true); },
      () => setGeo('Couldn’t get your location. Tap the map instead.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const far = pick && nearestArea(pick.lat, pick.lng).km > 4;

  return (
    <dialog ref={dialog} className="picker" onClose={onClose} onClick={(e) => e.target === dialog.current && onClose()} aria-labelledby="picker-title">
      <div className="picker-inner">
        <header>
          <div>
            <h2 id="picker-title">Where are you testing from?</h2>
            <p className="muted">Tap your neighbourhood. Drag the pin to adjust. We round it to about 500&nbsp;m.</p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="picker-map" ref={el}>
          {status === 'loading' && <div className="map-msg">Loading map…</div>}
          {status === 'error' && <div className="map-msg">The map couldn’t load. Allow location access and try again.</div>}
          <button type="button" className="btn btn-sm locate" onClick={locate}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/></svg>
            Use my location
          </button>
        </div>
        <footer>
          <div aria-live="polite">
            {pick ? (
              <>
                <span className="muted">Nearest area</span>
                <strong>{AREAS[pick.area]}</strong>
                {far && <small className="muted">You’re outside our listed areas. We’ll use the closest one.</small>}
              </>
            ) : (
              <span className="muted">{geo || 'No pin yet: tap the map.'}</span>
            )}
          </div>
          <button type="button" className="btn btn-primary" disabled={!pick} onClick={() => pick && onPick(pick)}>Use this location</button>
        </footer>
      </div>
    </dialog>
  );
}
