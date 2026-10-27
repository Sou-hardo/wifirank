// <dither-art mode="signal|flow|stream|noise">: animated ordered-dither (4×4 Bayer) art on a canvas.
// Draws in the element's CSS `color`. Pauses off-screen and in hidden tabs; one still frame for reduced motion.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const hash = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };

class DitherArt extends HTMLElement {
  private raf = 0;
  private stop: (() => void) | null = null;

  connectedCallback() {
    if (this.stop) return;
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%';
    this.append(canvas);
    const g = canvas.getContext('2d')!;
    const still = matchMedia('(prefers-reduced-motion: reduce), (hover: none)').matches;
    const cell = Number(this.getAttribute('cell')) || 7;
    let w = 0, h = 0, cols = 0, rows = 0, color = '#000', visible = false, last = 0;
    let px = -1e4, py = -1e4; // pointer, in cells
    const ripples: { x: number; y: number; t: number }[] = [];

    const resize = () => {
      const r = this.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / cell); rows = Math.ceil(h / cell);
      color = getComputedStyle(this).color;
      if (still) draw(8);
    };

    // Each mode returns a 0..1 "brightness" for a cell; the Bayer matrix turns that into dots.
    const value = (x: number, y: number, t: number, mode: string): number => {
      if (mode === 'noise') return Math.random() * (0.35 + 0.65 * Math.abs(Math.sin(y * 0.35 + t * 5)));
      if (mode === 'stream') {
        const dir = this.getAttribute('dir');
        const sign = dir === 'up' ? -1 : 1, speed = dir === 'up' || dir === 'down' ? 9 : 1.2;
        const lit = hash(x * 3.1) > 0.5 ? 1 : 0.12;
        return (0.5 + 0.5 * Math.sin(y * 0.5 - sign * t * speed + hash(x) * 40)) ** 3 * lit;
      }
      if (mode === 'flow') {
        const n = Math.sin(x * 0.11 + t * 0.7 + Math.sin(y * 0.28 + t * 0.5) * 1.4) * 0.5 + Math.sin((x + y) * 0.05 - t * 0.35) * 0.5;
        return (0.5 + 0.5 * n) * (1 - y / rows) ** 0.8;
      }
      // signal: rings radiating from a corner, like a router
      const ox = cols * 0.86, oy = -2, d = Math.hypot(x - ox, (y - oy) * 1.05), R = Math.max(cols * 0.62, rows);
      let v = (0.5 + 0.5 * Math.sin(d * 0.42 - t * 1.8)) * Math.max(0, 1 - d / R) ** 1.25;
      const dp = Math.hypot(x - px, y - py);
      v += 0.5 * Math.exp(-(dp * dp) / 40); // the cursor carries a little signal of its own
      for (const r of ripples) {
        const age = t - r.t, dr = Math.hypot(x - r.x, y - r.y) - age * 34;
        v += 0.9 * Math.exp(-(dr * dr) / 5) * Math.max(0, 1 - age / 1.5);
      }
      return v;
    };

    const draw = (t: number) => {
      const mode = this.getAttribute('mode') ?? 'signal', s = cell * 0.56, o = (cell - s) / 2;
      while (ripples.length && t - ripples[0].t > 1.5) ripples.shift();
      g.clearRect(0, 0, w, h);
      g.fillStyle = color;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        if (value(x, y, t, mode) > BAYER[(x & 3) + ((y & 3) << 2)]) g.fillRect(x * cell + o, y * cell + o, s, s);
      }
    };

    const frame = (ms: number) => {
      this.raf = requestAnimationFrame(frame);
      const fps = this.getAttribute('mode') === 'noise' ? 12 : 30;
      if (!visible || document.hidden || ms - last < 1000 / fps) return;
      last = ms;
      draw(ms / 1000);
    };

    const local = (e: PointerEvent) => { const r = this.getBoundingClientRect(); return [(e.clientX - r.left) / cell, (e.clientY - r.top) / cell]; };
    const move = (e: PointerEvent) => { [px, py] = local(e); };
    const down = (e: PointerEvent) => {
      const [x, y] = local(e);
      if (x >= 0 && y >= 0 && x <= cols && y <= rows && ripples.length < 4) ripples.push({ x, y, t: performance.now() / 1000 });
    };
    const interactive = (this.getAttribute('mode') ?? 'signal') === 'signal' && !still;
    if (interactive) { addEventListener('pointermove', move, { passive: true }); addEventListener('pointerdown', down, { passive: true }); }

    const ro = new ResizeObserver(resize);
    ro.observe(this);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(this);
    resize();
    if (!still) this.raf = requestAnimationFrame(frame);

    this.stop = () => {
      cancelAnimationFrame(this.raf); ro.disconnect(); io.disconnect();
      removeEventListener('pointermove', move); removeEventListener('pointerdown', down);
      canvas.remove();
    };
  }

  disconnectedCallback() { this.stop?.(); this.stop = null; }
}

if (!customElements.get('dither-art')) customElements.define('dither-art', DitherArt);
