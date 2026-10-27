import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { nearestArea } from '../lib/areas';
import { AREAS, DISTRICT_NAMES } from '../lib/options';

type Pick = { lat: number; lng: number; area: string };
// `optional` is the area the test already counts for; skipping keeps it.
// `onDrop` places the pin at a screen point if it's over the map, and says whether it was.
type Props = { pick: Pick | null; optional: string; onPlace: (lng: number, lat: number) => void; onDrop: (x: number, y: number) => boolean;
  onSkip: () => void; onUse: (p: Pick) => void; floating?: boolean };

const HAND = '<svg viewBox="0 0 24 24" width="46" height="46" fill="#fff" stroke="#191a23" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v4M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>';

// A hand lifts the pin out of the card and sets it down on the map, so the gesture explains itself.
function playHint(from: HTMLElement, floating: boolean) {
  const map = document.querySelector('.tmap')?.getBoundingClientRect();
  if (!map || matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  const a = from.getBoundingClientRect(), card = from.closest('.picker')!.getBoundingClientRect();
  const x0 = a.left + a.width / 2, y0 = a.bottom;
  // Desktop: just right of the card. Phone: the middle of the map above the docked card.
  const x1 = floating ? map.left + map.width * 0.55 : Math.min(card.right + 140, map.right - 80);
  const y1 = floating ? Math.max(map.top + 80, Math.min(map.bottom, card.top) - 120) : card.top + card.height * 0.3;
  const ghost = Object.assign(document.createElement('div'), { className: 'pin-hint', innerHTML: `<i class="pin-shape"></i><span>${HAND}</span>` });
  document.body.append(ghost);
  const at = (x: number, y: number, s = 1) => `translate(${x}px, ${y}px) scale(${s})`;
  const run = ghost.animate([
    { transform: at(x0, y0), opacity: 0 },
    { transform: at(x0, y0), opacity: 1, offset: 0.12 },
    { transform: at(x0, y0 - 8, 1.08), offset: 0.22 },
    { transform: at(x1, y1 - 8, 1.08), offset: 0.68, easing: 'ease-in' },
    { transform: at(x1, y1), opacity: 1, offset: 0.76 },
    { transform: at(x1, y1), opacity: 0 },
  ], { duration: 2600, delay: 500, iterations: 2, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'both' });
  ghost.querySelector('span')!.animate([
    { translate: '0 0', opacity: 1, offset: 0.76 },
    { translate: '14px -18px', opacity: 0 },
  ], { duration: 2600, delay: 500, iterations: 2, fill: 'both' });
  run.finished.then(() => ghost.remove(), () => ghost.remove());
  return () => run.cancel();
}

// Controls for pinning your spot on the big test map: drag the pin out of the card, or tap the map.
// Rounded to ~500 m on the server.
export default function LocationPicker({ pick, optional, onPlace, onDrop, onSkip, onUse, floating = false }: Props) {
  const [geo, setGeo] = useState('');
  const token = useRef<HTMLButtonElement>(null);
  const stopHint = useRef(() => {});

  useEffect(() => {
    const t = setTimeout(() => { if (token.current) stopHint.current = playHint(token.current, floating); }, 400);
    const stop = () => stopHint.current();
    addEventListener('pointerdown', stop, { once: true });
    return () => { clearTimeout(t); stop(); removeEventListener('pointerdown', stop); };
  }, []);

  // Drag the pin out of the card; it follows the pointer by its tip and lands where it's let go.
  const drag = (e: ReactPointerEvent) => {
    e.preventDefault();
    const ghost = Object.assign(document.createElement('div'), { className: 'pin-hint dragging', innerHTML: '<i class="pin-shape"></i>' });
    document.body.append(ghost);
    const move = (ev: PointerEvent) => { ghost.style.transform = `translate(${ev.clientX}px, ${ev.clientY - 12}px) scale(1.1)`; };
    move(e.nativeEvent);
    const end = (ev: PointerEvent) => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', end); removeEventListener('pointercancel', end);
      ghost.remove();
      if (ev.type === 'pointerup') onDrop(ev.clientX, ev.clientY - 12);
    };
    addEventListener('pointermove', move); addEventListener('pointerup', end); addEventListener('pointercancel', end);
  };

  const locate = () => {
    setGeo('Finding you…');
    navigator.geolocation.getCurrentPosition(
      (p) => { setGeo(''); onPlace(p.coords.longitude, p.coords.latitude); },
      () => setGeo('Location is off. Tap the map.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const far = pick && nearestArea(pick.lat, pick.lng).km > (pick.area in DISTRICT_NAMES ? 80 : 4);

  return (
    <section className={`picker picker-inline ${floating ? 'picker-float' : ''}`} aria-labelledby="picker-title">
      <div className="picker-inner">
        <header>
          <button type="button" ref={token} className={`pin-token ${pick ? 'placed' : ''}`} onPointerDown={drag}
            aria-label="Drag this pin onto the map"><i className="pin-shape" /></button>
          <div>
            <h2 id="picker-title">Pin your spot <span className="opt-tag">Optional</span></h2>
            <p className="muted">Drag the pin onto the map, or tap where you are. Rounded to <span className="hl-500">~500&nbsp;m</span>.</p>
            <button type="button" className="link-btn locate" onClick={locate}>Use my location</button>
          </div>
        </header>
        <footer>
          <div aria-live="polite">
            {pick ? (
              <>
                <strong>{AREAS[pick.area]}</strong>
                <small className="muted">{far ? 'Outside our areas: we’ll use the closest.' : 'Tap the pin to remove it.'}</small>
              </>
            ) : (
              <span className="muted">{geo || `No pin: counts for ${optional}.`}</span>
            )}
          </div>
          <div className="picker-actions">
            <button type="button" className="link-btn muted" onClick={onSkip}>Skip</button>
            <button type="button" className="btn btn-primary" disabled={!pick} onClick={() => pick && onUse(pick)}>Use pin</button>
          </div>
        </footer>
      </div>
    </section>
  );
}
