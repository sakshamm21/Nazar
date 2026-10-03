/**
 * Refreshes the bundled lists behind search (all from free public sources):
 *   src/data/nse-etf.csv       every ETF listed on NSE, with a readable name from Yahoo
 *   src/data/nse-trusts.csv    REITs and InvITs, with the Yahoo symbol that has a live quote
 *   src/data/amfi-schemes.csv  every active mutual fund scheme from AMFI (code, ISINs, name, category)
 * The equity list has its own script (`npm run nse:refresh`).
 *
 *   npm run catalog:refresh
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { parseAmfi } from "../src/lib/data/amfi-parse";
import { yahooProvider } from "../src/lib/data/provider";
import { parseCsv } from "../src/lib/importers/csv";

const UA = { "user-agent": "Mozilla/5.0 (Nazar catalogue refresh)" };
const NSE = "https://nsearchives.nseindia.com/content/equities";
const AMFI = "https://www.amfiindia.com/spages/NAVAll.txt";
/** Trusts that NSE's own list files leave out. */
const EXTRA_TRUSTS = [
  { symbol: "NXST", kind: "REIT" },
  { symbol: "KRT", kind: "REIT" },
  { symbol: "BHINVIT", kind: "InvIT" },
  { symbol: "INDUSINVIT", kind: "InvIT" },
];

const out = (name: string) => path.join(process.cwd(), "src", "data", name);
const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const toCsv = (rows: string[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";

async function get(url: string) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.text();
}

/**
 * Yahoo's long name for each symbol that has a recent quote there, keyed by the bare symbol. The
 * exchange files only carry abbreviations, and a listing Yahoo no longer updates is of no use.
 */
async function yahooNames(symbols: string[], suffix: ".NS" | ".BO") {
  const quotes = await yahooProvider.quotes(symbols.map((s) => `${s}${suffix}`));
  const recent = Date.now() - 10 * 86400000;
  return new Map(quotes.filter((q) => q.price != null && q.asOf && Date.parse(q.asOf) > recent).map((q) => [q.symbol.slice(0, -suffix.length), q.name]));
}

async function etfs() {
  const [header, ...lines] = parseCsv(await get(`${NSE}/eq_etfseclist.csv`));
  const col = (n: string) => header.findIndex((h) => h.trim().toLowerCase() === n);
  const s = col("symbol"), u = col("underlying asset"), i = col("isinnumber"), k = col("etf underlying");
  const rows = lines.filter((l) => l[s]?.trim() && l[i]?.trim());
  const names = await yahooNames(rows.map((l) => l[s].trim()), ".NS");
  const data = rows.filter((l) => names.has(l[s].trim())).map((l) => [l[s].trim(), names.get(l[s].trim())!, l[i].trim(), l[u]?.trim() ?? "", l[k]?.trim() ?? ""]);
  writeFileSync(out("nse-etf.csv"), toCsv([["SYMBOL", "NAME", "ISIN", "UNDERLYING", "KIND"], ...data]));
  console.log(`Saved ${data.length} ETFs (${rows.length - data.length} without a recent Yahoo quote were left out)`);
}

async function trusts() {
  const listed: { symbol: string; name: string; isin: string; kind: string }[] = [];
  for (const [file, kind] of [["REITS_L.csv", "REIT"], ["INVITS_L.csv", "InvIT"]] as const) {
    const [, ...lines] = parseCsv(await get(`${NSE}/${file}`));
    for (const l of lines) if (l[0]?.trim() && /^IN/.test(l[6]?.trim() ?? "")) listed.push({ symbol: l[0].trim(), name: l[1].trim(), isin: l[6].trim(), kind });
  }
  for (const e of EXTRA_TRUSTS) if (!listed.some((l) => l.symbol === e.symbol)) listed.push({ ...e, name: "", isin: "" });
  // Yahoo stopped updating these trusts' NSE quotes; their BSE quotes are current.
  const names = await yahooNames(listed.map((l) => l.symbol), ".BO");
  const data = listed.filter((l) => names.has(l.symbol)).map((l) => [l.symbol, l.name || names.get(l.symbol)!, l.isin, l.kind, `${l.symbol}.BO`]);
  writeFileSync(out("nse-trusts.csv"), toCsv([["SYMBOL", "NAME", "ISIN", "KIND", "YAHOO"], ...data]));
  console.log(`Saved ${data.length} REITs and InvITs`);
}

async function funds() {
  const schemes = parseAmfi(await get(AMFI));
  // Schemes whose NAV stopped updating are closed or merged: leave them out of search.
  const latest = schemes.reduce((a, s) => (s.date > a ? s.date : a), "");
  const cutoff = new Date(Date.parse(`${latest}T00:00:00Z`) - 10 * 86400000).toISOString().slice(0, 10);
  const live = schemes.filter((s) => s.date >= cutoff && s.nav > 0);
  writeFileSync(out("amfi-schemes.csv"), toCsv([["CODE", "ISIN", "ISIN2", "NAME", "CATEGORY", "AMC"], ...live.map((s) => [s.code, s.isin ?? "", s.isin2 ?? "", s.name, s.category, s.amc])]));
  console.log(`Saved ${live.length} mutual fund schemes (NAV dated ${latest})`);
}

async function main() {
  await etfs();
  await trusts();
  await funds();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
