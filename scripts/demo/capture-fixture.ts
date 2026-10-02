/**
 * Captures the demo fixture: ~400 days of REAL daily closes, quarterly results, metrics and
 * health scores for the demo portfolios, from Yahoo Finance, saved to src/data/demo-fixture.json.
 * The demo then runs entirely from this file (works with Yahoo down); the seeder shifts its dates
 * so the latest session is always the most recent weekday.
 *
 *   npm run demo:capture
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { buildHealth } from "../../src/lib/analytics/models";
import { metricsFromSummary } from "../../src/lib/finance";
import { yahooProvider } from "../../src/lib/data/provider";
import { DEMO_INDICES, DEMO_SYMBOLS } from "../../src/lib/demo/config";
import { getMaster } from "../../src/lib/instruments/master";
import { sectorOf } from "../../src/lib/instruments/sectors";

async function main() {
  const from = new Date(Date.now() - 400 * 86400000);
  const out: Record<string, unknown> = {};
  const indices: Record<string, [string, number][]> = {};
  for (const s of DEMO_INDICES) {
    const bars = await yahooProvider.dailyHistory(s, from);
    indices[s] = bars.map((b) => [b.date, round(b.close)]);
    console.log(`${s}: ${bars.length} bars`);
  }
  for (const s of DEMO_SYMBOLS) {
    const [bars, sum] = await Promise.all([yahooProvider.dailyHistory(s, from), yahooProvider.summary(s)]);
    const fx = sum.reportingCurrency !== sum.currency ? await yahooProvider.fx(sum.reportingCurrency, sum.currency) : null;
    const { values } = metricsFromSummary(sum.raw, fx);
    const sec = sectorOf(sum.sector, sum.industry);
    const rows = sec.financial ? [] : await yahooProvider.annualFundamentals(s).catch(() => []);
    const fxToReporting = sum.reportingCurrency !== sum.currency ? (fx ? 1 / fx : null) : 1;
    const health = buildHealth({ rows: rows as Record<string, unknown>[], metrics: values, sector: sum.sector, industry: sum.industry, marketCapReporting: sum.marketCap != null && fxToReporting ? sum.marketCap * fxToReporting : null });
    const master = getMaster().bySymbol.get(s.replace(/\.NS$/, ""));
    out[s] = {
      name: master?.name ?? sum.name ?? s,
      isin: master?.isin ?? null,
      sector: sum.sector,
      industry: sum.industry,
      marketCap: sum.marketCap,
      metrics: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v == null ? null : round(v, 6)])),
      health,
      quarters: sum.quarters,
      nextResultsDate: sum.nextResultsDate,
      bars: bars.map((b) => [b.date, round(b.close)]),
    };
    console.log(`${s}: ${bars.length} bars, health ${health.score ?? "n/a"} (${health.kind}), ${sum.quarters.length} quarters, next results ${sum.nextResultsDate}`);
  }
  const lastDate = (indices["^NSEI"] ?? []).at(-1)?.[0];
  const file = path.join(process.cwd(), "src", "data", "demo-fixture.json");
  writeFileSync(file, JSON.stringify({ capturedAt: new Date().toISOString(), lastDate, source: "Yahoo Finance via yahoo-finance2", indices, symbols: out }));
  console.log(`Saved ${file} (last session ${lastDate})`);
  process.exit(0);
}

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
