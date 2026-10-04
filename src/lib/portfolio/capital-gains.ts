/**
 * Capital gains: what a sale would have realised, in the buckets Indian tax uses. Pure arithmetic
 * over plain data, unit-tested — no market model, no estimates, no advice.
 *
 * Nazar never tells anyone what to buy or sell, and this module is why it still cannot: it reports
 * what has already happened, and what the rules say a realised gain falls into. The rates below are
 * the Finance Act 2024 slabs that apply from 23 July 2024, when the surcharge and cess were folded
 * into the rate itself:
 *   - equity (shares, ETFs, equity funds): 12.5% long-term above ₹1.25 lakh, 20% short-term
 *   - everything else: 12.5% flat
 *
 * A "sale" here means units that left the holding. Where the money went is not the user's decision
 * to make here, so nothing in this file suggests one.
 */

/** Equity shares, ETFs and equity mutual funds are taxed differently from everything else. */
export type GainClass = "equity" | "other";

/** Sales/straddle: the budget changed the threshold from ₹1 lakh to ₹1.25 lakh. */
export const LTCG_EXEMPTION = 125_000;
/** Both rates already include surcharge and cess, so nothing is added on top. */
export const LTCG_RATE = 0.125;
export const STCG_RATE = 0.2;
export const OTHER_RATE = 0.125;

export type HoldingPeriod = "long" | "short";
/** Over 12 months is long-term for both equities and everything else. */
export const LONG_TERM_DAYS = 365;

export type Disposal = {
  symbol: string;
  name: string;
  /** Units sold. */
  units: number;
  /** Price each unit was sold at. */
  sellPrice: number;
  /** The day of the sale. */
  date: string;
  /** What those units originally cost, from the lots they came out of. */
  cost: number;
  /** How long the units were held, in days, at the moment of sale. */
  daysHeld: number;
};

const days = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);
export const isLongTerm = (daysHeld: number) => daysHeld > LONG_TERM_DAYS;

/** Days between a purchase and a sale, never negative if the dates arrive out of order. */
export const holdingDays = (bought: string, sold: string) => Math.max(0, days(bought, sold));

export type Bucket = {
  /** Every sale in this bucket. */
  disposals: Disposal[];
  /** Sale proceeds minus what the units cost. */
  gain: number;
  tax: number;
};

export type CapitalGains = {
  equity: { short: Bucket; long: Bucket };
  other: { short: Bucket; long: Bucket };
  /** Short- and long-term equity gains added together (only this pair shares the exemption). */
  equityTotalGain: number;
  /** Long-term equity gain above the exemption is the only part that is taxed. */
  exempt: number;
  taxableEquity: { short: number; long: number };
  totalTax: number;
  /** Gains and losses of every kind, before tax. */
  netGain: number;
  disposals: number;
  /** Assets that are not shares at all (gold, property, a deposit) — no shares, no equity rules. */
  notApplicable: boolean;
};

const emptyBucket = (): Bucket => ({ disposals: [], gain: 0, tax: 0 });

/**
 * Puts each sale in its bucket and works out the tax. `classify` decides whether a symbol uses the
 * equity rules or the flat rate; it is passed in so this module needs no knowledge of instruments.
 */
export function capitalGains(disposals: Disposal[], classify: (symbol: string) => GainClass): CapitalGains {
  const equity = { short: emptyBucket(), long: emptyBucket() };
  const other = { short: emptyBucket(), long: emptyBucket() };

  for (const d of disposals) {
    const gain = d.units * d.sellPrice - d.cost;
    const bucket = classify(d.symbol) === "equity" ? equity : other;
    const target = isLongTerm(d.daysHeld) ? bucket.long : bucket.short;
    target.disposals.push(d);
    target.gain += gain;
  }

  // The exemption sits on long-term equity gains only: short-term equity gains are taxed in full
    // regardless of the threshold, and losses elsewhere cannot be netted off here.
    const equityTotalGain = equity.short.gain + equity.long.gain;
    const exempt = Math.min(Math.max(equity.long.gain, 0), LTCG_EXEMPTION);
  const equityLongTaxable = Math.max(equity.long.gain - exempt, 0);

  const taxableEquity = { short: equity.short.gain, long: equityLongTaxable };
  const totalTax =
    Math.max(taxableEquity.short, 0) * STCG_RATE + equityLongTaxable * LTCG_RATE + Math.max(other.short.gain, 0) * OTHER_RATE + Math.max(other.long.gain, 0) * OTHER_RATE;

  const netGain = disposals.reduce((a, d) => a + (d.units * d.sellPrice - d.cost), 0);

  return {
    equity,
    other,
    equityTotalGain,
    exempt,
    taxableEquity,
    totalTax,
    netGain,
    disposals: disposals.length,
    notApplicable: disposals.length === 0,
  };
}

/**
 * What has not been sold yet: the gain sitting in the portfolio. This is not a tax figure — it is
 * only taxed when the units leave, and which bucket it lands in depends on the date of that sale.
 */
export type Unrealised = { symbol: string; name: string; units: number; cost: number; value: number; gain: number; gainPct: number | null; daysHeld: number; wouldBeLongTerm: boolean };

export function unrealisedGains(
  positions: { symbol: string; name: string; units: number; cost: number; price: number | null; bought: string | null }[],
  classify: (symbol: string) => GainClass,
): Unrealised[] {
  const today = new Date().toISOString().slice(0, 10);
  return positions
    .filter((p) => p.units > 0 && p.cost > 0)
    .map((p) => {
      const value = p.units * (p.price ?? 0);
      const gain = value - p.cost;
      const daysHeld = p.bought ? holdingDays(p.bought, today) : 0;
      return { symbol: p.symbol, name: p.name, units: p.units, cost: p.cost, value, gain, gainPct: p.cost ? gain / p.cost : null, daysHeld, wouldBeLongTerm: isLongTerm(daysHeld), class: classify(p.symbol) };
    })
    .sort((a, b) => b.gain - a.gain);
}

/**
 * How much of the exemption is left after the equity gains already realised this financial year,
 * given gains from earlier years are already accounted for elsewhere. Reported, not calculated
 * further: the rules that apply are a fact, the decision is the user's.
 */
export function remainingExemption(equityGainThisYear: number, usedInEarlierYears = 0) {
  return Math.max(LTCG_EXEMPTION - Math.max(equityGainThisYear, 0) - Math.max(usedInEarlierYears, 0), 0);
}