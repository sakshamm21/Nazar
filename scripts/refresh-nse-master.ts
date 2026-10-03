/**
 * Refreshes src/data/nse-equity.csv (NSE's public list of equities: symbol, name, ISIN).
 * Used to map broker exports (which carry ISINs and company names) to NSE tickers.
 *
 *   npm run nse:refresh
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

const NSE_EQUITY_LIST = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv";

async function main() {
  const res = await fetch(NSE_EQUITY_LIST, { headers: { "user-agent": "Mozilla/5.0 (Nazar NSE master refresh)" } });
  if (!res.ok) throw new Error(`NSE responded ${res.status}`);
  const text = await res.text();
  if (!text.startsWith("SYMBOL,")) throw new Error("Unexpected file format from NSE");
  const out = path.join(process.cwd(), "src", "data", "nse-equity.csv");
  writeFileSync(out, text);
  console.log(`Saved ${text.trim().split("\n").length - 1} equities to ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
