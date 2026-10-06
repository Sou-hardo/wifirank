import { useEffect, useRef, useState, type ReactNode } from 'react';

const TICKS = [0, 5, 10, 25, 50, 100, 250, 500, 1000];
const MAX = 1000;
const START = 135, SWEEP = 270; // degrees, clockwise from +x
const R = 128, C = 160;

// Log scale: Dhaka plans span 5–1000 Mbps, so linear would crush the common 10–100 range.
const frac = (v: number) => Math.min(Math.log10(1 + Math.max(v, 0)) / Math.log10(1 + MAX), 1);
const point = (f: number, r = R) => {
  const a = ((START + SWEEP * f) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};
const arc = (r: number) => {
  const [x0, y0] = point(0, r), [x1, y1] = point(1, r);
  return `M${x0} ${y0} A${r} ${r} 0 1 1 ${x1} ${y1}`;
};

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Eased follower so the needle glides between engine samples instead of jumping.
function useSmoothed(target: number) {
  const [v, setV] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    if (reduced()) return setV((cur.current = target));
    let raf = 0;
    const step = () => {
      cur.current += (target - cur.current) * 0.09;
      if (Math.abs(target - cur.current) < 0.05) cur.current = target;
      setV(cur.current);
      if (cur.current !== target) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

type Props = { value: number | null; unit?: string; label?: string; active?: boolean; children?: ReactNode };

export default function Gauge({ value, unit = 'Mbps', label, active, children }: Props) {
  const v = useSmoothed(value ?? 0);
  const f = frac(unit === 'Mbps' ? v : 0);
  const [kx, ky] = point(f);
  return (
    <div className={`gauge ${active ? 'is-active' : ''}`}>
      <svg viewBox="0 0 320 300" aria-hidden="true">
        <defs>
          <linearGradient id="g-arc" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#5f7f12" />
            <stop offset="1" stopColor="#c6f432" />
          </linearGradient>
        </defs>
        <path d={arc(R)} className="g-track" pathLength={1} />
        <path d={arc(R)} className="g-fill" pathLength={1} stroke="url(#g-arc)" strokeDasharray={`${f} 1`} />
        {TICKS.map((t) => {
          const [x1, y1] = point(frac(t), R - 18), [x2, y2] = point(frac(t), R - 24);
          const [lx, ly] = point(frac(t), R - 42);
          return (
            <g key={t} className={f >= frac(t) && f > 0 ? 'tick on' : 'tick'}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} />
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle">{t}</text>
            </g>
          );
        })}
        {f > 0 && <circle cx={kx} cy={ky} r="9" className="g-knob" />}
      </svg>
      <div className="gauge-center">
        {children ?? (
          <>
            <div className="g-label">{label}</div>
            <div className="g-value num">{value == null ? '—' : v < 10 ? v.toFixed(1) : Math.round(v)}</div>
            <div className="g-unit">{unit}</div>
          </>
        )}
      </div>
    </div>
  );
}
