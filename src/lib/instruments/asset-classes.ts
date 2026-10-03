/**
 * Asset classes Nazar can hold, and how each one gets its value. Client-safe (no server imports).
 *
 * Market assets have a symbol and a daily price from a free source:
 *   stock, etf, reit → Yahoo ("INFY.NS")      mf → AMFI daily NAV ("MF:122639")
 *   gold → the gold or silver price in rupees per gram ("CMD:GOLD24")
 *   us → a US-listed stock or ETF ("US:AAPL")   crypto → a coin ("CRYPTO:BTC")
 *        both from Yahoo in dollars, converted to rupees at the day's USD/INR rate
 * Manual assets (deposits, provident funds, property, cash…) have no price feed anywhere. Their
 * symbol is "MANUAL:<id>" and their value is what the user entered, growing at the rate they gave.
 */
export const MARKET_CLASSES = ["stock", "etf", "mf", "reit", "gold", "us", "crypto"] as const;
export const MANUAL_CLASSES = ["fd", "ppf", "epf", "nps", "bond", "property", "cash", "other"] as const;
export const ASSET_CLASSES = [...MARKET_CLASSES, ...MANUAL_CLASSES] as const;

export type MarketClass = (typeof MARKET_CLASSES)[number];
export type ManualClass = (typeof MANUAL_CLASSES)[number];
export type AssetClass = (typeof ASSET_CLASSES)[number];

export type AssetGroup = "Stocks" | "ETFs" | "Mutual funds" | "REITs & InvITs" | "US stocks" | "Crypto" | "Gold & silver" | "Fixed income" | "Retirement" | "Property" | "Cash" | "Other";

type Meta = { label: string; plural: string; group: AssetGroup; unit: string; priceLabel: string };

export const ASSET_META: Record<AssetClass, Meta> = {
  stock: { label: "Stock", plural: "Stocks", group: "Stocks", unit: "shares", priceLabel: "Average price" },
  etf: { label: "ETF", plural: "ETFs", group: "ETFs", unit: "units", priceLabel: "Average price" },
  mf: { label: "Mutual fund", plural: "Mutual funds", group: "Mutual funds", unit: "units", priceLabel: "Average NAV" },
  reit: { label: "REIT / InvIT", plural: "REITs & InvITs", group: "REITs & InvITs", unit: "units", priceLabel: "Average price" },
  gold: { label: "Gold & silver", plural: "Gold & silver", group: "Gold & silver", unit: "grams", priceLabel: "Average price per gram" },
  us: { label: "US stock", plural: "US stocks", group: "US stocks", unit: "shares", priceLabel: "Average price" },
  crypto: { label: "Crypto", plural: "Crypto", group: "Crypto", unit: "coins", priceLabel: "Average price per coin" },
  fd: { label: "Fixed deposit", plural: "Fixed deposits", group: "Fixed income", unit: "", priceLabel: "" },
  bond: { label: "Bond", plural: "Bonds", group: "Fixed income", unit: "", priceLabel: "" },
  ppf: { label: "PPF", plural: "PPF", group: "Retirement", unit: "", priceLabel: "" },
  epf: { label: "EPF", plural: "EPF", group: "Retirement", unit: "", priceLabel: "" },
  nps: { label: "NPS", plural: "NPS", group: "Retirement", unit: "", priceLabel: "" },
  property: { label: "Property", plural: "Property", group: "Property", unit: "", priceLabel: "" },
  cash: { label: "Cash & savings", plural: "Cash & savings", group: "Cash", unit: "", priceLabel: "" },
  other: { label: "Other", plural: "Other", group: "Other", unit: "", priceLabel: "" },
};

/** Display order of groups, and the colour token each one uses in allocation bars. */
export const GROUP_ORDER: AssetGroup[] = ["Stocks", "Mutual funds", "ETFs", "REITs & InvITs", "US stocks", "Gold & silver", "Crypto", "Fixed income", "Retirement", "Property", "Cash", "Other"];
export const GROUP_COLOR: Record<AssetGroup, string> = {
  Stocks: "var(--accent)",
  "Mutual funds": "var(--gain)",
  ETFs: "var(--ice)",
  "REITs & InvITs": "#b08cff",
  "US stocks": "#8fb6ff",
  Crypto: "#ff9d5c",
  "Gold & silver": "var(--warn)",
  "Fixed income": "#5ec2e8",
  Retirement: "#e08bc0",
  Property: "var(--loss)",
  Cash: "var(--muted)",
  Other: "var(--subtle)",
};
export const GROUP_LABELS = new Set<string>(GROUP_ORDER);

export const groupOf = (c: AssetClass | null | undefined): AssetGroup => ASSET_META[c ?? "stock"].group;
export const isManualClass = (c: string | null | undefined): c is ManualClass => (MANUAL_CLASSES as readonly string[]).includes(c ?? "");

/* ------------------------------------------------------------------ */
/* Symbols                                                             */
/* ------------------------------------------------------------------ */

export const MF_PREFIX = "MF:";
export const CMD_PREFIX = "CMD:";
export const US_PREFIX = "US:";
export const CRYPTO_PREFIX = "CRYPTO:";
export const MANUAL_PREFIX = "MANUAL:";

export const isMfSymbol = (s: string) => s.startsWith(MF_PREFIX);
export const isCommoditySymbol = (s: string) => s.startsWith(CMD_PREFIX);
export const isManualSymbol = (s: string) => s.startsWith(MANUAL_PREFIX);
export const isUsSymbol = (s: string) => s.startsWith(US_PREFIX);
export const isCryptoSymbol = (s: string) => s.startsWith(CRYPTO_PREFIX);
/** Quoted in dollars abroad and converted to rupees. */
export const isForeignSymbol = (s: string) => isUsSymbol(s) || isCryptoSymbol(s);
/** Priced by Nazar rather than quoted on an Indian exchange: there is one value a day, pinned to the Indian market session. */
export const isSyntheticSymbol = (s: string) => isMfSymbol(s) || isCommoditySymbol(s) || isForeignSymbol(s);
/** The class a symbol's prefix implies, or null for an exchange symbol (looked up in the catalogue). */
export const classOfPrefix = (s: string): MarketClass | null => (isMfSymbol(s) ? "mf" : isCommoditySymbol(s) ? "gold" : isUsSymbol(s) ? "us" : isCryptoSymbol(s) ? "crypto" : null);
export const mfSymbol = (schemeCode: string | number) => `${MF_PREFIX}${schemeCode}`;
export const mfCode = (symbol: string) => symbol.slice(MF_PREFIX.length);

/** "INFY.NS" → "INFY", "MF:122639" → "122639": the short code shown under a name. */
export const shortCode = (symbol: string) => symbol.replace(/\.(NS|BO)$/, "").replace(/^(MF|CMD|US|CRYPTO|MANUAL):/, "");

/**
 * Gold and silver, priced per gram in rupees from the international price and USD/INR.
 * `purity` scales the 24K price; `duty` is India's import duty on bullion, which the domestic price
 * carries. The result is an indicative price: a jeweller's rate also adds GST and making charges.
 */
export const COMMODITIES = [
  { symbol: "CMD:GOLD24", name: "Gold 24K (physical or digital)", short: "Gold 24K", future: "GC=F", purity: 1, keywords: "gold 24k 24 carat karat digital coin bar sona" },
  { symbol: "CMD:GOLD22", name: "Gold 22K (jewellery)", short: "Gold 22K", future: "GC=F", purity: 22 / 24, keywords: "gold 22k 22 carat karat jewellery jewelry ornaments sona" },
  { symbol: "CMD:SGB", name: "Sovereign Gold Bond (1 unit = 1 gram)", short: "Sovereign Gold Bond", future: "GC=F", purity: 1, keywords: "sgb sovereign gold bond rbi" },
  { symbol: "CMD:SILVER", name: "Silver (physical or digital)", short: "Silver", future: "SI=F", purity: 1, keywords: "silver chandi coin bar" },
] as const;
export const BULLION_IMPORT_DUTY = 0.06;
export const GRAMS_PER_TROY_OUNCE = 31.1034768;

/* ------------------------------------------------------------------ */
/* Manual assets                                                       */
/* ------------------------------------------------------------------ */

/** Stored on a manual holding. `value` was true on `valueAsOf`; it grows at `ratePct` a year after that. */
export type ManualDetails = {
  value: number;
  valueAsOf: string;
  ratePct?: number | null;
  maturityDate?: string | null;
};

/** How often interest is added: banks compound deposits quarterly; everything else yearly. */
const periodsPerYear = (c: AssetClass) => (c === "fd" ? 4 : 1);

/** A manual asset's value on `on` (ISO date): the entered value plus interest since it was entered. */
export function manualValue(assetClass: AssetClass, d: ManualDetails | null | undefined, invested: number, on: string): number {
  const base = d?.value ?? invested;
  const rate = d?.ratePct;
  if (!d || !rate || rate <= 0) return base;
  const end = d.maturityDate && d.maturityDate < on ? d.maturityDate : on;
  const years = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${d.valueAsOf}T00:00:00Z`)) / (365.25 * 86400000);
  if (!(years > 0)) return base;
  const n = periodsPerYear(assetClass);
  return base * Math.pow(1 + rate / 100 / n, n * years);
}
