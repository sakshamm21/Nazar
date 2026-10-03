import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCsv } from "@/lib/importers/csv";
import { COMMODITIES, CRYPTO_PREFIX, US_PREFIX, classOfPrefix, isManualSymbol, mfSymbol, type MarketClass } from "./asset-classes";
import { DISPLAY_NAMES, getMaster, normalizeName, shortName, toYahoo } from "./master";

/**
 * Everything a user can search for and add: NSE stocks, ETFs, REITs and InvITs, every mutual fund
 * scheme (AMFI) and gold or silver. Built from the bundled lists in src/data (refreshed by
 * `npm run nse:refresh` and `npm run catalog:refresh`), so search never calls a data provider.
 */
export type CatalogItem = {
  symbol: string;
  name: string;
  assetClass: MarketClass;
  isin: string | null;
  /** One line of context under the name: fund category, ETF underlying, "REIT"… */
  sub: string | null;
  /** Lower-cased words to match a query against. */
  text: string;
  /** NSE trading symbol, upper-case (empty for funds and commodities). */
  ticker: string;
};

type Catalog = { items: CatalogItem[]; bySymbol: Map<string, CatalogItem>; byIsin: Map<string, CatalogItem> };

let cache: Catalog | null = null;

const read = (file: string) => parseCsv(readFileSync(path.join(process.cwd(), "src", "data", file), "utf8")).slice(1).filter((r) => r[0]?.trim());
const words = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
/** "Equity Scheme - Flexi Cap Fund" → "Flexi Cap Fund". */
const fundCategory = (c: string) => c.split(" - ").at(-1)?.trim() || c;

/** AMFI also lists ETFs as schemes. They are held as exchange units, so the exchange listing is the one to show. */
const funds = () => read("amfi-schemes.csv").filter((r) => !/\bETFs?\b/i.test(r[4] ?? ""));

export function getCatalog(): Catalog {
  if (cache) return cache;
  const items: CatalogItem[] = [];
  for (const r of getMaster().stocks) {
    const symbol = toYahoo(r.symbol);
    const name = DISPLAY_NAMES[symbol] ?? shortName(r.name);
    items.push({ symbol, name, assetClass: "stock", isin: r.isin, sub: null, text: `${normalizeName(r.name)} ${words(name)}`, ticker: r.symbol });
  }
  for (const [s, name, isin, underlying, kind] of read("nse-etf.csv")) {
    const sub = kind === "COMMODITY" ? "Gold or silver ETF" : kind === "DEBT" ? "Debt ETF" : kind === "GLOBAL INDICES" ? "International ETF" : underlying && underlying !== name ? `ETF · ${underlying}` : "ETF";
    items.push({ symbol: toYahoo(s), name, assetClass: "etf", isin: isin || null, sub, text: words(`${name} ${underlying} etf`), ticker: s.toUpperCase() });
  }
  for (const [s, name, isin, kind, yahoo] of read("nse-trusts.csv")) items.push({ symbol: yahoo || toYahoo(s), name, assetClass: "reit", isin: isin || null, sub: kind, text: words(`${name} ${kind}`), ticker: s.toUpperCase() });
  for (const [code, isin, isin2, name, category, amc] of funds())
    items.push({ symbol: mfSymbol(code), name, assetClass: "mf", isin: isin || isin2 || null, sub: `${fundCategory(category)} · ${amc.replace(/\s*mutual fund\s*$/i, "")}`, text: words(`${name} ${amc}`), ticker: "" });
  for (const c of COMMODITIES) items.push({ symbol: c.symbol, name: c.name, assetClass: "gold", isin: null, sub: "Valued at the day's price per gram", text: words(`${c.name} ${c.keywords}`), ticker: "" });

  const byIsin = new Map<string, CatalogItem>();
  for (const it of items) if (it.isin) byIsin.set(it.isin, it);
  // Funds list a second ISIN for the dividend-reinvestment option of the same scheme.
  for (const [code, , isin2] of funds()) if (isin2 && !byIsin.has(isin2)) byIsin.set(isin2, items.find((i) => i.symbol === mfSymbol(code))!);
  cache = { items, bySymbol: new Map(items.map((i) => [i.symbol, i])), byIsin };
  return cache;
}

export const catalogItem = (symbol: string) => getCatalog().bySymbol.get(symbol.toUpperCase()) ?? null;

/** The asset class of a market symbol. Anything on an exchange that isn't a listed ETF or trust is a stock. */
export function classOfSymbol(symbol: string): MarketClass | null {
  const s = symbol.toUpperCase();
  if (isManualSymbol(s)) return null;
  return classOfPrefix(s) ?? catalogItem(s)?.assetClass ?? "stock";
}

/** Score one item against a query; 0 = no match. Every query word must appear in the name. */
function score(it: CatalogItem, q: string, tokens: string[], upper: string): number {
  if (it.ticker && it.ticker === upper) return 100;
  if (it.isin === upper) return 95;
  if (it.ticker && it.ticker.startsWith(upper)) return 80 - Math.min(10, it.ticker.length - upper.length);
  if (!tokens.every((t) => it.text.includes(t))) return 0;
  let s = it.text.startsWith(q) ? 70 : it.text.includes(` ${q}`) ? 55 : 40;
  // "gold" should find gold itself before the companies and funds named after it.
  if (it.assetClass === "gold") s += 30;
  // Among a fund's many variants, the one most people hold comes first.
  if (it.assetClass === "mf") s += (/\bdirect\b/.test(it.text) ? 3 : 0) + (/\bgrowth\b/.test(it.text) ? 4 : 0) - (/\bidcw|dividend|bonus\b/.test(it.text) ? 4 : 0);
  return s - Math.min(8, it.text.length / 20);
}

export type SearchHit = Pick<CatalogItem, "symbol" | "name" | "assetClass" | "isin" | "sub">;

/** What a provider's symbol search returns (Yahoo's `search`). */
export type RemoteQuote = { symbol?: string; longname?: string; shortname?: string; quoteType?: string; exchange?: string; exchDisp?: string };
const US_EXCHANGES = new Set(["NMS", "NYQ", "NGM", "NCM", "PCX", "ASE", "BTS", "NAS", "NYS"]);

/**
 * US stocks, US ETFs and crypto have no bundled list (there are too many), so they are searched
 * live. This turns the provider's results into hits: US listings only, and one entry per coin.
 */
export function foreignHits(quotes: RemoteQuote[], cls: "us" | "crypto"): SearchHit[] {
  const out = new Map<string, SearchHit>();
  for (const q of quotes) {
    if (!q.symbol) continue;
    const name = q.longname ?? q.shortname ?? q.symbol;
    if (cls === "us" && (q.quoteType === "EQUITY" || q.quoteType === "ETF") && US_EXCHANGES.has(q.exchange ?? "") && /^[A-Z][A-Z.-]{0,9}$/.test(q.symbol))
      out.set(q.symbol, { symbol: `${US_PREFIX}${q.symbol}`, name, assetClass: "us", isin: null, sub: `${q.symbol} · ${q.quoteType === "ETF" ? "US ETF" : "US stock"} · ${q.exchDisp ?? "US"}` });
    if (cls === "crypto" && q.quoteType === "CRYPTOCURRENCY" && /^[A-Z0-9]{2,10}-USD$/.test(q.symbol)) {
      const coin = q.symbol.slice(0, -4);
      out.set(coin, { symbol: `${CRYPTO_PREFIX}${coin}`, name: name.replace(/ USD$/, ""), assetClass: "crypto", isin: null, sub: `${coin} · priced in rupees at the day's dollar rate` });
    }
  }
  return [...out.values()];
}

/**
 * Search across every asset class. With `classes` unset, results are balanced so that a stock, its
 * ETFs and its funds all show up for a query like "nifty" instead of one class filling the list.
 */
export function searchCatalog(query: string, opts: { classes?: MarketClass[]; limit?: number } = {}): SearchHit[] {
  const q = words(query);
  if (q.length < 2) return [];
  const limit = opts.limit ?? 12;
  const upper = query.trim().toUpperCase().replace(/\.(NS|BO)$/, "");
  const tokens = q.split(" ");
  const pool = opts.classes?.length ? getCatalog().items.filter((i) => opts.classes!.includes(i.assetClass)) : getCatalog().items;
  const scored = pool.map((it) => ({ it, s: score(it, q, tokens, upper) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.it.name.length - b.it.name.length);
  let picked = scored;
  if (!opts.classes?.length) {
    const perClass = Math.max(3, Math.ceil(limit / 2));
    const seen = new Map<string, number>();
    const first = scored.filter((x) => {
      const n = seen.get(x.it.assetClass) ?? 0;
      seen.set(x.it.assetClass, n + 1);
      return n < perClass;
    });
    picked = [...first, ...scored.filter((x) => !first.includes(x))];
  }
  return picked.slice(0, limit).map(({ it }) => ({ symbol: it.symbol, name: it.name, assetClass: it.assetClass, isin: it.isin, sub: it.sub }));
}
