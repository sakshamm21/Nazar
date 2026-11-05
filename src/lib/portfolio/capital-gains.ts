/**
 * Capital gains: what a sale realises, and the buckets Indian tax puts it in. Pure arithmetic over
 * plain data, unit-tested — no market model, no estimates, no advice.
 *
 * Nazar never tells anyone what to buy or sell, and this module is why it still cannot: it reports
 * what has happened, and what the rules say a gain falls into. Which units leave, and when, is the
 * user's decision; nothing here suggests one.
 *
 * The rules, for transfers on or after 23 July 2024 (Finance (No. 2) Act 2024, sections 111A, 112,
 * 112A and 115BBH of the Income-tax Act, and the "specified mutual fund" rule of section 50AA as
 * amended from 1 April 2025). Checked on 5 November 2026. Rates are before surcharge; a 4% health
 * and education cess is added on top of the tax.
 *
 *   equity   listed shares, equity-oriented funds and ETFs, REIT and InvIT units
 *            long-term after 12 months; 20% short, 12.5% long above ₹1.25 lakh a year
 *   listed   other listed securities: gold, silver and international ETFs, Sovereign Gold Bonds
 *            long-term after 12 months; slab rate short, 12.5% long
 *   other    unlisted or foreign assets: US shares, physical gold and silver, gold and overseas
 *            funds of funds, hybrid funds that are neither equity- nor debt-oriented
 *            long-term after 24 months; slab rate short, 12.5% long
 *   debt     debt funds and debt ETFs bought on or after 1 April 2023: slab rate, never long-term
 *            (bought earlier, they follow "other")
 *   crypto   virtual digital assets: 30% flat, no long term, and a loss cannot be set off
 */

export type TaxKind = "equity" | "listed" | "other" | "debt" | "crypto";
/** A rate, or "slab": the income-tax rate that applies to the person's income. */
export type Rate = number | "slab";

export type TaxRule = {
  label: string;
  /** Held for more than this many days is long-term; null means there is no long term. */
  longAfterDays: number | null;
  short: Rate;
  long: Rate;
  /** The ₹1.25 lakh yearly exemption on long-term gains applies. */
  exemption: boolean;
  /** A loss can be set off against other gains. */
  canOffset: boolean;
};

export const TAX_RULES: Record<TaxKind, TaxRule> = {
  equity: { label: "Shares and equity funds", longAfterDays: 365, short: 0.2, long: 0.125, exemption: true, canOffset: true },
  listed: { label: "Gold ETFs and other listed", longAfterDays: 365, short: "slab", long: 0.125, exemption: false, canOffset: true },
  other: { label: "US stocks, gold and the rest", longAfterDays: 730, short: "slab", long: 0.125, exemption: false, canOffset: true },
  debt: { label: "Debt funds", longAfterDays: null, short: "slab", long: "slab", exemption: false, canOffset: true },
  crypto: { label: "Crypto", longAfterDays: null, short: 0.3, long: 0.3, exemption: false, canOffset: false },
};

export const LTCG_EXEMPTION = 125_000;
export const CESS = 0.04;
/** Debt funds bought from this day lost long-term treatment. */
export const DEBT_CUTOFF = "2023-04-01";
/** The income-tax slabs a person can choose from, in percent. */
export const SLABS = [0, 5, 10, 15, 20, 25, 30] as const;

const days = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);
/** Days between a purchase and a sale, never negative if the dates arrive out of order. */
export const holdingDays = (bought: string, sold: string) => Math.max(0, days(bought, sold));
export const isLongTerm = (kind: TaxKind, daysHeld: number) => {
  const after = TAX_RULES[kind].longAfterDays;
  return after != null && daysHeld > after;
};

const DEBT_FUND_RE = /debt|income|liquid|overnight|money market|gilt|bond|credit risk|duration|floater|floating|banking and psu|conservative hybrid|fixed maturity|interval/i;
const EQUITY_FUND_RE = /equity|elss|aggressive hybrid|arbitrage|balanced advantage|dynamic asset allocation/i;
const DEBT_NAME_RE = /gilt|g-sec|gsec|sdl|bond|psu|crisil|debt|treasury|t-bill|money market|liquid|target maturity|corporate/i;

/**
 * Which set of rules a holding follows, from what the app knows about it. `category` is the full
 * AMFI category for a fund ("Equity Scheme - Flexi Cap Fund"), or the ETF's kind ("Gold or silver
 * ETF"). `bought` decides the debt-fund cutoff.
 */
export function taxKindOf(o: { assetClass?: string | null; symbol?: string; category?: string | null; name?: string | null; bought?: string | null }): TaxKind {
  const cat = o.category ?? "";
  const name = o.name ?? "";
  const debt = (): TaxKind => (o.bought && o.bought < DEBT_CUTOFF ? "other" : "debt");
  switch (o.assetClass) {
    case "stock":
    case "reit":
      return "equity";
    case "etf":
      if (/gold|silver|commodit/i.test(cat) || /gold|silver/i.test(name)) return "listed";
      if (/debt/i.test(cat) || DEBT_NAME_RE.test(name)) return debt();
      if (/international|global|overseas/i.test(cat)) return "listed";
      return "equity";
    case "mf":
      if (/fund of funds|fof/i.test(cat) || /gold|silver|overseas|international|global|nasdaq|us /i.test(name)) return /debt/i.test(name) ? debt() : "other";
      if (/index fund/i.test(cat)) return DEBT_NAME_RE.test(name) ? debt() : "equity";
      if (EQUITY_FUND_RE.test(cat)) return "equity";
      if (DEBT_FUND_RE.test(cat)) return debt();
      return "other";
    case "gold":
      return o.symbol === "CMD:SGB" ? "listed" : "other";
    case "crypto":
      return "crypto";
    default:
      return "other";
  }
}

/** The rate as a number for this person, or null when it depends on a slab they have not given. */
export const rateFor = (r: Rate, slabPct: number | null): number | null => (r === "slab" ? (slabPct == null ? null : slabPct / 100) : r);

/** One block of units: its gain, how long it was held, and the rules it follows. */
export type GainPart = { symbol: string; name: string; kind: TaxKind; units: number; cost: number; value: number; gain: number; daysHeld: number; longTerm: boolean };

export type Bucket = {
  kind: TaxKind;
  term: "short" | "long";
  gain: number;
  /** The rate that applies, or "slab". */
  rate: Rate;
  /** Tax with cess, or null when it depends on a slab not given. */
  tax: number | null;
  /** Long-term equity gain that falls inside the yearly exemption. */
  exempt: number;
};

export type GainsSummary = {
  buckets: Bucket[];
  totalGain: number;
  /** Tax with cess on everything that has a known rate. */
  tax: number;
  /** Gains taxed at the slab rate that are not in `tax`, because no slab was given. */
  untaxedSlabGain: number;
  /** Crypto losses: they cannot be set off against anything. */
  cryptoLoss: number;
};

/**
 * Puts parts in their buckets and works out the tax a sale of all of them would bring. Within a
 * bucket gains and losses net; short-term losses are then set off against other gains (short first,
 * then long), and long-term losses against long-term gains, as the rules allow. Crypto stands apart.
 */
export function summariseGains(parts: GainPart[], slabPct: number | null, exemptionLeft = LTCG_EXEMPTION): GainsSummary {
  const key = (k: TaxKind, t: "short" | "long") => `${k}:${t}`;
  const sums = new Map<string, number>();
  let cryptoGain = 0, cryptoLoss = 0;
  for (const p of parts) {
    if (p.kind === "crypto") {
      if (p.gain > 0) cryptoGain += p.gain;
      else cryptoLoss += -p.gain;
      continue;
    }
    const k = key(p.kind, p.longTerm ? "long" : "short");
    sums.set(k, (sums.get(k) ?? 0) + p.gain);
  }
  const kinds: TaxKind[] = ["equity", "listed", "other", "debt"];
  const net = new Map(sums);
  // Set-off: a short-term loss can absorb any gain; a long-term loss only a long-term gain.
  const absorb = (lossKey: string, targets: string[]) => {
    let loss = -(net.get(lossKey) ?? 0);
    if (loss <= 0) return;
    for (const t of targets) {
      const g = net.get(t) ?? 0;
      if (g <= 0 || loss <= 0) continue;
      const used = Math.min(g, loss);
      net.set(t, g - used);
      loss -= used;
    }
    net.set(lossKey, -loss);
  };
  const shortKeys = kinds.map((k) => key(k, "short"));
  const longKeys = kinds.map((k) => key(k, "long"));
  // Losses go first against gains taxed at the highest known rates: short-term equity, then the rest.
  for (const lk of shortKeys) absorb(lk, [...shortKeys, ...longKeys].filter((x) => x !== lk));
  for (const lk of longKeys) absorb(lk, longKeys.filter((x) => x !== lk));

  const buckets: Bucket[] = [];
  let tax = 0, untaxedSlabGain = 0;
  for (const k of kinds) {
    for (const term of ["short", "long"] as const) {
      const id = key(k, term);
      if (!sums.has(id)) continue;
      const rule = TAX_RULES[k];
      const rate = term === "long" ? rule.long : rule.short;
      const taxable0 = Math.max(net.get(id) ?? 0, 0);
      const exempt = rule.exemption && term === "long" ? Math.min(taxable0, Math.max(exemptionLeft, 0)) : 0;
      const taxable = taxable0 - exempt;
      const r = rateFor(rate, slabPct);
      const t = r == null ? null : taxable * r * (1 + CESS);
      if (t == null) untaxedSlabGain += taxable;
      else tax += t;
      buckets.push({ kind: k, term, gain: sums.get(id)!, rate, tax: t, exempt });
    }
  }
  if (cryptoGain || cryptoLoss) {
    const t = cryptoGain * (TAX_RULES.crypto.short as number) * (1 + CESS);
    tax += t;
    buckets.push({ kind: "crypto", term: "short", gain: cryptoGain - cryptoLoss, rate: TAX_RULES.crypto.short, tax: t, exempt: 0 });
  }
  return { buckets, totalGain: parts.reduce((a, p) => a + p.gain, 0), tax, untaxedSlabGain, cryptoLoss };
}

/**
 * The gains still in the portfolio: one part per purchase lot still held, so a holding bought two
 * years ago and topped up last month is part long-term and part short-term. Not a tax figure — it is
 * only taxed when units leave, and the bucket depends on the date of that sale.
 */
export type HeldLot = { units: number; price: number; date: string | null };
export type Position = { symbol: string; name: string; kind?: TaxKind; assetClass: string; category: string | null; price: number | null; lots: HeldLot[] };

export function unrealisedParts(positions: Position[], today: string): GainPart[] {
  const out: GainPart[] = [];
  for (const p of positions) {
    if (p.price == null) continue;
    for (const l of p.lots) {
      if (!(l.units > 0) || !(l.price > 0)) continue;
      const kind = p.kind ?? taxKindOf({ assetClass: p.assetClass, symbol: p.symbol, category: p.category, name: p.name, bought: l.date });
      const daysHeld = l.date ? holdingDays(l.date, today) : 0;
      const cost = l.units * l.price;
      const value = l.units * p.price;
      out.push({ symbol: p.symbol, name: p.name, kind, units: l.units, cost, value, gain: value - cost, daysHeld, longTerm: isLongTerm(kind, daysHeld) });
    }
  }
  return out;
}

/** The parts of one sale, each from the purchase it came out of. */
export function realisedParts(sale: { symbol: string; name: string; assetClass: string; category: string | null; price: number; date: string; parts: { date: string; units: number; price: number }[] }): GainPart[] {
  return sale.parts.map((p) => {
    const kind = taxKindOf({ assetClass: sale.assetClass, symbol: sale.symbol, category: sale.category, name: sale.name, bought: p.date });
    const daysHeld = holdingDays(p.date, sale.date);
    const cost = p.units * p.price;
    const value = p.units * sale.price;
    return { symbol: sale.symbol, name: sale.name, kind, units: p.units, cost, value, gain: value - cost, daysHeld, longTerm: isLongTerm(kind, daysHeld) };
  });
}

/** Parts grouped back by holding, for a list: each holding's long- and short-term gain. */
export type HoldingGains = { symbol: string; name: string; kind: TaxKind; gain: number; cost: number; gainPct: number | null; long: number; short: number; oldestDays: number };
export function byHolding(parts: GainPart[]): HoldingGains[] {
  const m = new Map<string, HoldingGains>();
  for (const p of parts) {
    const h = m.get(p.symbol) ?? { symbol: p.symbol, name: p.name, kind: p.kind, gain: 0, cost: 0, gainPct: null, long: 0, short: 0, oldestDays: 0 };
    h.gain += p.gain;
    h.cost += p.cost;
    if (p.longTerm) h.long += p.gain;
    else h.short += p.gain;
    h.oldestDays = Math.max(h.oldestDays, p.daysHeld);
    m.set(p.symbol, h);
  }
  return [...m.values()].map((h) => ({ ...h, gainPct: h.cost ? h.gain / h.cost : null })).sort((a, b) => b.gain - a.gain);
}

/** The Indian financial year a date falls in, as "2025-26", with its first and last day. */
export function financialYear(date: string) {
  const [y, m] = date.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return { label: `${start}-${String((start + 1) % 100).padStart(2, "0")}`, from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

/** What is left of the yearly exemption after the long-term equity gains already realised this year. */
export function remainingExemption(equityLongGainThisYear: number) {
  return Math.max(LTCG_EXEMPTION - Math.max(equityLongGainThisYear, 0), 0);
}
