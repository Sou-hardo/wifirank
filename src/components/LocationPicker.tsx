import { useState } from 'react';
import { nearestArea } from '../lib/areas';
import { AREAS, DISTRICT_NAMES } from '../lib/options';

type Pick = { lat: number; lng: number; area: string };
// `optional` is the area the test already counts for; skipping keeps it.
type Props = { pick: Pick | null; optional: string; onPlace: (lng: number, lat: number) => void; onSkip: () => void; onUse: (p: Pick) => void; floating?: boolean };

// Controls for pinning your spot on the big test map behind the page. The map does the picking
// (tap or drag the pin); this card names the nearest listed area and confirms. Rounded to ~500 m on the server.
export default function LocationPicker({ pick, optional, onPlace, onSkip, onUse, floating = false }: Props) {
  const [geo, setGeo] = useState('');

  const locate = () => {
    setGeo('Finding you…');
    navigator.geolocation.getCurrentPosition(
      (p) => { setGeo(''); onPlace(p.coords.longitude, p.coords.latitude); },
      () => setGeo('Couldn’t get your location. Tap the map instead.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const far = pick && nearestArea(pick.lat, pick.lng).km > (pick.area in DISTRICT_NAMES ? 80 : 4);

  return (
    <section className={`picker picker-inline ${floating ? 'picker-float' : ''}`} aria-labelledby="picker-title">
      <div className="picker-inner">
        <header>
          <div>
            <span className="opt-tag"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>Optional</span>
            <h2 id="picker-title">Pin your spot for a sharper map</h2>
            <p className="muted">Tap the map {floating ? 'above' : 'beside this card'}, or drag the pin. We round it to <span className="hl-500">about 500&nbsp;m</span>. Skip it and your test counts for {optional}.</p>
          </div>
        </header>
        <button type="button" className="btn btn-sm locate" onClick={locate}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/></svg>
          Use my location
        </button>
        <footer>
          <div aria-live="polite">
            {pick ? (
              <>
                <span className="muted">Nearest listed location</span>
                <strong>{AREAS[pick.area]}</strong>
                {far && <small className="muted">You’re outside our listed areas. We’ll use the closest one.</small>}
              </>
            ) : (
              <span className="muted">{geo || 'No pin yet: tap the map.'}</span>
            )}
          </div>
          <div className="picker-actions">
            <button type="button" className="link-btn muted" onClick={onSkip}>Skip</button>
            <button type="button" className="btn btn-primary" disabled={!pick} onClick={() => pick && onUse(pick)}>Use this pin</button>
          </div>
        </footer>
      </div>
    </section>
  );
}
