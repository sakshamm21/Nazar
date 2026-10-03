export type Fmt = "currency" | "large" | "percent" | "ratio" | "number" | "date";

/**
 * Compact large numbers. INR uses the Indian convention (₹ Cr / ₹ L Cr) that Indian
 * investors read market caps and revenues in; everything else uses K / M / B / T.
 */
export function fmtLarge(n: number | null | undefined, prefix = "", currency?: string) {
  if (n == null || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (currency === "INR") {
    if (a >= 1e12) return `${s}${prefix}${(a / 1e12).toFixed(2)} L Cr`;
    if (a >= 1e7) return `${s}${prefix}${(a / 1e7).toLocaleString("en-IN", { maximumFractionDigits: a >= 1e10 ? 0 : 2 })} Cr`;
    if (a >= 1e5) return `${s}${prefix}${(a / 1e5).toFixed(2)} L`;
    return `${s}${prefix}${a.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  }
  if (a >= 1e12) return `${s}${prefix}${(a / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${s}${prefix}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}${prefix}${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}${prefix}${(a / 1e3).toFixed(1)}K`;
  return `${s}${prefix}${a.toFixed(2)}`;
}

/** Money in compact form with the right symbol, e.g. $4.84T or ₹16.01 L Cr. `null` = currency unknown: no symbol. */
export const money = (n: number | null | undefined, currency?: string | null) => (currency === null ? fmtLarge(n) : fmtLarge(n, currencySymbol(currency), currency));

function currencySymbol(c?: string) {
  const map: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", GBp: "p", INR: "₹", JPY: "¥", CNY: "¥", HKD: "HK$", CAD: "C$", AUD: "A$", KRW: "₩", CHF: "CHF " };
  return c ? (map[c] ?? `${c} `) : "$";
}

export function fmt(v: number | null | undefined, f: Fmt, currency = "USD"): string {
  if (v == null || !Number.isFinite(v)) return "—";
  switch (f) {
    case "currency":
      return `${currencySymbol(currency)}${v.toLocaleString(currency === "INR" ? "en-IN" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case "large":
      return fmtLarge(v, "", currency);
    case "percent":
      return `${(v * 100).toFixed(2)}%`;
    case "ratio":
      return v.toFixed(2);
    case "number":
      return v.toLocaleString(currency === "INR" ? "en-IN" : "en-US");
    default:
      return String(v);
  }
}

/** Yahoo returns regularMarketChangePercent already in percent units (e.g. 1.23 = 1.23%). */
export function pct(v: number | null | undefined, alreadyPercent = false) {
  if (v == null || !Number.isFinite(v)) return "—";
  const x = alreadyPercent ? v : v * 100;
  return `${x > 0 ? "+" : ""}${x.toFixed(2)}%`;
}

/** Semantic gain/loss text colour (design tokens; see docs/DESIGN.md). */
export const upDown = (v: number | null | undefined) => (v == null || v === 0 ? "text-muted" : v > 0 ? "text-gain" : "text-loss");

/* ------------------------------------------------------------------ */
/* Nazar: rupee amounts, signed changes, dates (EN + HI)               */
/* ------------------------------------------------------------------ */

/** ₹8,412 (no decimals above ₹100; paise below). */
export function inr(n: number | null | undefined, opts: { sign?: boolean; decimals?: number } = {}) {
  if (n == null || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  const d = opts.decimals ?? (a < 100 ? 2 : 0);
  const s = a.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
  const sign = n < 0 ? "−" : opts.sign && n > 0 ? "+" : "";
  return `${sign}₹${s}`;
}

/** Whole rupees for prose: "₹8,412" (no paise). */
export const inrWhole = (n: number, opts: { sign?: boolean } = {}) => inr(Math.round(n), { ...opts, decimals: 0 });

/** ₹8.4K / ₹3.2 L / ₹1.25 Cr for tight spaces. */
export function inrCompact(n: number | null | undefined, opts: { sign?: boolean } = {}) {
  if (n == null || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : opts.sign && n > 0 ? "+" : "";
  let body: string;
  if (a >= 1e12) body = `${(a / 1e12).toFixed(2)} L Cr`;
  else if (a >= 1e7) body = `${(a / 1e7).toLocaleString("en-IN", { maximumFractionDigits: a >= 1e9 ? 0 : 2 })} Cr`;
  else if (a >= 1e5) body = `${(a / 1e5).toFixed(2)} L`;
  else if (a >= 1e3) body = `${(a / 1e3).toFixed(1)}K`;
  else body = a.toFixed(0);
  return `${sign}₹${body}`;
}

/** Rounds a rupee amount for prose: "~₹8,400". */
export function inrApprox(n: number) {
  const a = Math.abs(n);
  const step = a >= 1e5 ? 1000 : a >= 1e4 ? 100 : a >= 1000 ? 10 : 1;
  return inr(Math.round(a / step) * step, { decimals: 0 });
}

/** −7.2% / +1.4% from a fraction (0.072 = 7.2%). Uses a real minus sign. */
export function signedPct(fraction: number | null | undefined, decimals = 1) {
  if (fraction == null || !Number.isFinite(fraction)) return "—";
  const x = fraction * 100;
  const s = Math.abs(x).toFixed(decimals);
  return `${x < 0 ? "−" : x > 0 ? "+" : ""}${s}%`;
}

/** 7.2% (absolute) from a fraction. */
export const absPct = (fraction: number | null | undefined, decimals = 1) => (fraction == null || !Number.isFinite(fraction) ? "—" : `${Math.abs(fraction * 100).toFixed(decimals)}%`);

/** "Thu, 9 Oct" / "गुरुवार, 9 अक्टूबर" for an ISO date (treated as a calendar date). */
export function dayLabel(iso: string, lang: "en" | "hi" = "en", withWeekday = true) {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { timeZone: "UTC", day: "numeric", month: "short", ...(withWeekday ? { weekday: lang === "hi" ? "long" : "short" } : {}) });
}

/** "4:47 PM" in India time. */
export function istTime(d: Date | string) {
  return new Date(d).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
}
