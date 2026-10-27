// Small page-wide interactions. No dependencies; everything is skipped for reduced motion.
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Dot-confetti burst, used to say thanks when a result or review is saved.
export function burst(x: number, y: number, count = 80) {
  if (calm()) return;
  const c = document.createElement('canvas'), dpr = Math.min(devicePixelRatio || 1, 2);
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:999';
  document.body.append(c);
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  const parts = Array.from({ length: count }, (_, i) => {
    const a = Math.random() * Math.PI * 2, v = 5 + Math.random() * 11;
    return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 5, s: 5 + Math.random() * 7, lime: i % 3 > 0, spin: Math.random() * 6 };
  });
  const t0 = performance.now();
  const tick = (t: number) => {
    const life = (t - t0) / 1500;
    g.clearRect(0, 0, innerWidth, innerHeight);
    if (life >= 1) return c.remove();
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.42; p.vx *= 0.985;
      g.globalAlpha = Math.min(1, (1 - life) * 2.5);
      g.fillStyle = p.lime ? '#b9ff66' : '#191a23';
      // Snap to a grid so the confetti reads as dot-matrix pixels.
      g.fillRect(Math.round(p.x / 4) * 4, Math.round(p.y / 4) * 4, p.s, p.s);
      if (p.lime) { g.strokeStyle = '#191a23'; g.lineWidth = 1; g.strokeRect(Math.round(p.x / 4) * 4 + 0.5, Math.round(p.y / 4) * 4 + 0.5, p.s, p.s); }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

if (typeof document !== 'undefined' && !calm()) {
  // Figures count up to their rendered value the first time they scroll into view.
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const el = e.target as HTMLElement, text = el.textContent ?? '';
      const to = parseFloat(text.replace(/,/g, '')), dp = (text.split('.')[1] ?? '').length, t0 = performance.now();
      if (!Number.isFinite(to)) continue;
      const tick = (t: number) => {
        const p = Math.min((t - t0) / 1100, 1);
        el.textContent = p < 1 ? (to * (1 - (1 - p) ** 3)).toLocaleString('en', { minimumFractionDigits: dp, maximumFractionDigits: dp }) : text;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  });
  document.querySelectorAll('[data-count]').forEach((el) => io.observe(el));

  const PAGE = 10;
  // Stagger index for table rows (drives the row and bar entrance in CSS).
  document.querySelectorAll('tbody').forEach((tb) => [...tb.rows].forEach((tr, i) => tr.style.setProperty('--i', String(i % PAGE))));

  // Long tables show PAGE rows at a time. Every row stays in the HTML for search engines and screen readers.
  document.querySelectorAll<HTMLTableSectionElement>('.table-wrap tbody').forEach((tb) => {
    const rows = [...tb.rows], pages = Math.ceil(rows.length / PAGE);
    if (pages < 2) return;
    const nav = document.createElement('nav');
    nav.className = 'table-pager';
    nav.setAttribute('aria-label', 'Table pages');
    nav.innerHTML = '<button class="btn" type="button">Previous</button><span class="muted small" aria-live="polite"></span><button class="btn" type="button">Next</button>';
    const [prev, next] = nav.querySelectorAll('button'), label = nav.querySelector('span')!;
    let page = 0;
    const show = (p: number) => {
      page = p;
      rows.forEach((tr, i) => { tr.hidden = Math.floor(i / PAGE) !== p; });
      prev.disabled = p === 0; next.disabled = p === pages - 1;
      label.textContent = `Page ${p + 1} of ${pages}`;
    };
    prev.onclick = () => show(page - 1);
    next.onclick = () => show(page + 1);
    tb.closest('.table-wrap')!.after(nav);
    show(0);
  });

  // Delegated so it also covers elements React renders later.
  // .tilt leans toward the pointer; .magnetic drifts toward it.
  if (matchMedia('(hover: hover)').matches) {
    document.addEventListener('pointermove', (e) => {
      const t = e.target as Element;
      const tilt = t.closest?.<HTMLElement>('.tilt');
      if (tilt) {
        const r = tilt.getBoundingClientRect();
        tilt.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 9}deg`);
        tilt.style.setProperty('--rx', `${(0.5 - (e.clientY - r.top) / r.height) * 9}deg`);
      }
      const mag = t.closest?.<HTMLElement>('.magnetic');
      if (mag) {
        const r = mag.getBoundingClientRect();
        mag.style.translate = `${(e.clientX - r.left - r.width / 2) * 0.22}px ${(e.clientY - r.top - r.height / 2) * 0.22}px`;
      }
    }, { passive: true });
    document.addEventListener('pointerout', (e) => {
      const t = e.target as Element, to = e.relatedTarget as Node | null;
      const tilt = t.closest?.<HTMLElement>('.tilt');
      if (tilt && !tilt.contains(to)) { tilt.style.removeProperty('--rx'); tilt.style.removeProperty('--ry'); }
      const mag = t.closest?.<HTMLElement>('.magnetic');
      if (mag && !mag.contains(to)) mag.style.translate = '';
    }, { passive: true });
  }
}
