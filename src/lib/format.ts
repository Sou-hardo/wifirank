export const fmt = (v: number | null | undefined, digits?: number) =>
  v == null ? '—' : v.toFixed(digits ?? (v < 10 ? 1 : 0));
export const stars = (n: number) => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
