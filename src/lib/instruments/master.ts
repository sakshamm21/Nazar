import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCsv } from "@/lib/importers/csv";

/**
 * NSE master (src/data/nse-equity.csv, refreshed by `npm run nse:refresh`, plus the ETF and trust
 * lists from `npm run catalog:refresh`): every listed security's symbol, name and ISIN. Broker exports carry ISINs, so most rows map exactly without
 * calling Yahoo (whose name search fails on renames like Zomato → Eternal).
 */
export type MasterRow = { symbol: string; name: string; isin: string; /** The Yahoo symbol when it isn't "<symbol>.NS". */ yahoo?: string };

let cache: MasterIndex | null = null;

export type MasterIndex = {
  /** Everything a broker file can contain: equities, plus ETFs, REITs and InvITs. */
  rows: MasterRow[];
  /** Equities only. */
  stocks: MasterRow[];
  bySymbol: Map<string, MasterRow>;
  byIsin: Map<string, MasterRow>;
  byName: Map<string, MasterRow[]>;
};

export function buildIndex(stocks: MasterRow[], others: MasterRow[] = []): MasterIndex {
  const taken = new Set(stocks.map((s) => s.symbol));
  const rows = [...stocks, ...others.filter((o) => !taken.has(o.symbol))];
  const byName = new Map<string, MasterRow[]>();
  for (const r of rows) {
    const k = normalizeName(r.name);
    byName.set(k, [...(byName.get(k) ?? []), r]);
  }
  return { rows, stocks, bySymbol: new Map(rows.map((r) => [r.symbol, r])), byIsin: new Map(rows.filter((r) => r.isin).map((r) => [r.isin, r])), byName };
}

function parseMaster(csv: string): MasterRow[] {
  const [header, ...lines] = parseCsv(csv);
  const col = (n: string) => header.findIndex((h) => h.trim().toUpperCase() === n);
  const s = col("SYMBOL"), n = col("NAME OF COMPANY"), i = col("ISIN NUMBER");
  return lines
    .filter((l) => l[s] && l[i])
    .map((l) => ({ symbol: l[s].trim().toUpperCase(), name: l[n].trim(), isin: l[i].trim().toUpperCase() }));
}

export function getMaster(): MasterIndex {
  if (!cache) {
    const file = (name: string) => readFileSync(path.join(process.cwd(), "src", "data", name), "utf8");
    // ETF and trust lists (`npm run catalog:refresh`): SYMBOL, NAME, ISIN, …
    const listed = (name: string, yahooCol?: number) => parseCsv(file(name)).slice(1).filter((l) => l[0]?.trim()).map((l) => ({ symbol: l[0].trim().toUpperCase(), name: l[1].trim(), isin: (l[2] ?? "").trim().toUpperCase(), ...(yahooCol != null && l[yahooCol]?.trim() ? { yahoo: l[yahooCol].trim().toUpperCase() } : {}) }));
    cache = buildIndex(parseMaster(file("nse-equity.csv")), [...listed("nse-etf.csv"), ...listed("nse-trusts.csv", 4)]);
  }
  return cache;
}

const STOP = new Set(["limited", "ltd", "the", "co", "company", "corporation", "corp", "inc", "plc", "pvt", "private", "and"]);

/** "Larsen & Toubro Ltd." → "larsen toubro"; "ETERNAL LIMITED" → "eternal". */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .join(" ")
    .trim();
}

/** Display name without "Limited": "Infosys Limited" → "Infosys". */
export function shortName(name: string): string {
  const base = name.replace(/\s*\b(limited|ltd\.?)\s*$/i, "").replace(/\s+/g, " ").trim();
  if (base !== base.toUpperCase()) return base;
  // All-caps names in the NSE file ("ETERNAL LIMITED"): title-case, keeping acronyms.
  return base
    .split(" ")
    .map((w) => (ACRONYMS.has(w) || w.length <= 3 ? w : w[0] + w.slice(1).toLowerCase()))
    .join(" ");
}

const ACRONYMS = new Set(["ICICI", "HDFC", "SBI", "ITC", "LIC", "NTPC", "ONGC", "BHEL", "GAIL", "IRCTC", "HCL", "IDFC", "UPL", "DLF", "BPCL", "HPCL", "IOC", "NMDC", "SAIL", "BEML", "RBL", "AU", "TVS", "MRF", "ACC", "JSW", "LTI", "PNB", "IDBI", "CESC", "NHPC", "IRFC", "RVNL", "KPIT", "NBCC"]);

/** Friendly names for well-known stocks where the legal name is long or unfamiliar. */
export const DISPLAY_NAMES: Record<string, string> = {
  "TCS.NS": "TCS",
  "INFY.NS": "Infosys",
  "HDFCBANK.NS": "HDFC Bank",
  "ICICIBANK.NS": "ICICI Bank",
  "KOTAKBANK.NS": "Kotak Bank",
  "AXISBANK.NS": "Axis Bank",
  "SBIN.NS": "SBI",
  "RELIANCE.NS": "Reliance",
  "BHARTIARTL.NS": "Bharti Airtel",
  "HINDUNILVR.NS": "Hindustan Unilever",
  "ITC.NS": "ITC",
  "LT.NS": "L&T",
  "M&M.NS": "Mahindra & Mahindra",
  "MARUTI.NS": "Maruti Suzuki",
  "TMPV.NS": "Tata Motors",
  "TMCV.NS": "Tata Motors CV",
  "SUNPHARMA.NS": "Sun Pharma",
  "BAJFINANCE.NS": "Bajaj Finance",
  "BAJAJFINSV.NS": "Bajaj Finserv",
  "ASIANPAINT.NS": "Asian Paints",
  "COALINDIA.NS": "Coal India",
  "POWERGRID.NS": "Power Grid",
  "NTPC.NS": "NTPC",
  "ONGC.NS": "ONGC",
  "TATASTEEL.NS": "Tata Steel",
  "TITAN.NS": "Titan",
  "WIPRO.NS": "Wipro",
  "HCLTECH.NS": "HCLTech",
  "TECHM.NS": "Tech Mahindra",
  "ETERNAL.NS": "Eternal (Zomato)",
  "NESTLEIND.NS": "Nestlé India",
  "ULTRACEMCO.NS": "UltraTech Cement",
  "^NSEI": "Nifty 50",
};

/** Old tickers and brand names that no longer match the NSE file. */
export const SYMBOL_ALIASES: Record<string, string> = {
  ZOMATO: "ETERNAL",
  // The old TATAMOTORS ticker continued as TMPV after the Oct 2025 demerger; the legal name
  // "Tata Motors Limited" now belongs to the commercial-vehicles company (TMCV).
  TATAMOTORS: "TMPV",
  ZOMATOLTD: "ETERNAL",
  MINDTREE: "LTIM",
  LTI: "LTIM",
  HDFC: "HDFCBANK",
  ADANITRANS: "ADANIENSOL",
};

export const toYahoo = (nseSymbol: string) => `${nseSymbol.toUpperCase()}.NS`;
export const yahooOf = (r: MasterRow) => r.yahoo ?? toYahoo(r.symbol);
