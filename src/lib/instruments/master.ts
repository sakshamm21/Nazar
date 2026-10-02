import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCsv } from "@/lib/importers/csv";

/**
 * NSE equity master (src/data/nse-equity.csv, refreshed by `npm run nse:refresh`): every listed
 * equity's symbol, name and ISIN. Broker exports carry ISINs, so most rows map exactly without
 * calling Yahoo (whose name search fails on renames like Zomato → Eternal; AUDIT §3.2).
 */
export type MasterRow = { symbol: string; name: string; isin: string };

let cache: MasterIndex | null = null;

export type MasterIndex = {
  rows: MasterRow[];
  bySymbol: Map<string, MasterRow>;
  byIsin: Map<string, MasterRow>;
  byName: Map<string, MasterRow[]>;
};

export function buildIndex(rows: MasterRow[]): MasterIndex {
  const byName = new Map<string, MasterRow[]>();
  for (const r of rows) {
    const k = normalizeName(r.name);
    byName.set(k, [...(byName.get(k) ?? []), r]);
  }
  return { rows, bySymbol: new Map(rows.map((r) => [r.symbol, r])), byIsin: new Map(rows.map((r) => [r.isin, r])), byName };
}

export function parseMaster(csv: string): MasterRow[] {
  const [header, ...lines] = parseCsv(csv);
  const col = (n: string) => header.findIndex((h) => h.trim().toUpperCase() === n);
  const s = col("SYMBOL"), n = col("NAME OF COMPANY"), i = col("ISIN NUMBER");
  return lines
    .filter((l) => l[s] && l[i])
    .map((l) => ({ symbol: l[s].trim().toUpperCase(), name: l[n].trim(), isin: l[i].trim().toUpperCase() }));
}

export function getMaster(): MasterIndex {
  if (!cache) {
    const file = path.join(process.cwd(), "src", "data", "nse-equity.csv");
    cache = buildIndex(parseMaster(readFileSync(file, "utf8")));
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
export const fromYahoo = (symbol: string) => symbol.toUpperCase().replace(/\.(NS|BO)$/, "");
