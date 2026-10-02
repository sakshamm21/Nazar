/** Small numeric helpers shared by every model. Pure, no I/O. */

export const round = (x: number | null | undefined, d = 4) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
export const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
export const stdev = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
};
export const median = (xs: number[]) => {
  const a = xs.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
export const corr = (a: number[], b: number[]) => {
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : null;
};
export const sample = <T,>(xs: T[], n: number) => (xs.length <= n ? xs : Array.from({ length: n }, (_, i) => xs[Math.round((i * (xs.length - 1)) / (n - 1))]));
export const pctReturns = (p: number[]) => p.slice(1).map((v, i) => v / p[i] - 1);
export const periodsPerYear = (iv: string) => (iv === "1d" ? 252 : iv === "1wk" ? 52 : 12);

/**
 * Money-weighted return (XIRR). flows: negative = invested, positive = value.
 * Newton's method first (fast); if it diverges, bisection on [-0.99, 10] (always converges when a
 * sign change exists).
 */
export function xirr(flows: { date: Date; amount: number }[]): number | null {
  if (flows.length < 2 || !flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0)) return null;
  const sorted = [...flows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const t0 = sorted[0].date.getTime();
  const yrs = sorted.map((f) => (f.date.getTime() - t0) / (365.25 * 86400000));
  const npv = (r: number) => sorted.reduce((s, f, k) => s + f.amount / (1 + r) ** yrs[k], 0);
  let r = 0.1;
  for (let i = 0; i < 100; i++) {
    let f = 0, df = 0;
    sorted.forEach((fl, k) => {
      f += fl.amount / (1 + r) ** yrs[k];
      df += (-yrs[k] * fl.amount) / (1 + r) ** (yrs[k] + 1);
    });
    if (!df) break;
    const next = r - f / df;
    if (!Number.isFinite(next)) break;
    if (Math.abs(next - r) < 1e-9) return next > -0.99 ? next : null;
    r = Math.max(-0.99, next);
  }
  let lo = -0.99, hi = 10;
  let flo = npv(lo), fhi = npv(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-7 || hi - lo < 1e-10) return mid;
    if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

export const sma = (xs: number[], n: number) => xs.map((_, i) => (i + 1 < n ? null : mean(xs.slice(i + 1 - n, i + 1))));
export const ema = (xs: number[], n: number) => {
  const k = 2 / (n + 1);
  const out: number[] = [];
  xs.forEach((x, i) => out.push(i === 0 ? x : x * k + out[i - 1] * (1 - k)));
  return out;
};
export function rsi(xs: number[], n = 14) {
  const out: (number | null)[] = xs.map(() => null);
  let gain = 0, loss = 0;
  for (let i = 1; i < xs.length; i++) {
    const d = xs[i] - xs[i - 1];
    if (i <= n) {
      gain += Math.max(d, 0);
      loss += Math.max(-d, 0);
      if (i === n) out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    } else {
      gain = (gain * (n - 1) + Math.max(d, 0)) / n;
      loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
      out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    }
  }
  return out;
}

/** Aligns several date→close maps on their common dates (sorted). */
export function alignSeries(maps: Map<string, number>[]): { dates: string[]; prices: number[][] } {
  if (!maps.length) return { dates: [], prices: [] };
  const dates = [...maps[0].keys()].filter((d) => maps.every((m) => m.has(d))).sort();
  return { dates, prices: maps.map((m) => dates.map((d) => m.get(d)!)) };
}
