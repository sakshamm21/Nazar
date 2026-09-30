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

export function currencySymbol(c?: string) {
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

export const upDown = (v: number | null | undefined) => (v == null ? "text-zinc-400" : v >= 0 ? "text-emerald-400" : "text-rose-400");
