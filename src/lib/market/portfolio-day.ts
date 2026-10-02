import "server-only";
import type { DB } from "@/lib/db";
import type { schema } from "@/lib/db";
import { DISPLAY_NAMES, shortName } from "@/lib/instruments/master";
import { NIFTY, SECTOR_INDICES, sectorOf } from "@/lib/instruments/sectors";
import type { DayHolding } from "@/lib/alerts/rules";
import { instrumentsFor, latestResults, snapshotsAsOf, type Instrument, type Snapshot } from "./store";

type HoldingRow = typeof schema.holdings.$inferSelect;

export function displayName(symbol: string, inst?: Instrument | null): string {
  return DISPLAY_NAMES[symbol] ?? inst?.shortName ?? (inst?.name ? shortName(inst.name) : symbol.replace(/\.(NS|BO)$/, ""));
}

export type PortfolioDay = {
  tradeDate: string;
  holdings: (DayHolding & { snapshot: Snapshot | null; stale: boolean; sectorLabel: string; instrument: Instrument | null })[];
  niftyPct: number | null;
  nifty: Snapshot | null;
  sectorPct: Record<string, number | null>;
  asOf: Date | null;
};

/**
 * One portfolio's state on `date` from stored snapshots: today's and the previous snapshot per
 * holding, names/sectors, the latest results event, and the market (Nifty + sector indices).
 */
export async function loadPortfolioDay(db: DB, holdings: HoldingRow[], date: string, sources: string[]): Promise<PortfolioDay> {
  const symbols = [...new Set(holdings.map((h) => h.symbol))];
  const all = [...symbols, NIFTY, ...SECTOR_INDICES];
  const [today, prev, inst, results] = await Promise.all([
    snapshotsAsOf(db, all, date, sources),
    snapshotsAsOf(db, symbols, date, sources, true),
    instrumentsFor(db, symbols),
    latestResults(db, symbols, sources),
  ]);
  const nifty = today.get(NIFTY) ?? null;
  const sectorPct: Record<string, number | null> = {};
  for (const s of SECTOR_INDICES) {
    const snap = today.get(s);
    sectorPct[s] = snap && snap.tradeDate === date ? snap.changePct : null;
  }

  // Previous-day weights, for concentration crossings.
  const prevVal = new Map(holdings.map((h) => [h.symbol, h.quantity * (prev.get(h.symbol)?.price ?? today.get(h.symbol)?.prevClose ?? h.avgPrice)]));
  const prevTotal = [...prevVal.values()].reduce((a, b) => a + b, 0);

  const rows = holdings.map((h) => {
    const snap = today.get(h.symbol) ?? null;
    const p = prev.get(h.symbol) ?? null;
    const i = inst.get(h.symbol) ?? null;
    const sec = sectorOf(i?.sector, i?.industry);
    const fresh = snap?.tradeDate === date;
    const r = results.get(h.symbol);
    const lastPeriod = (x: Snapshot | null) => x?.health?.periods?.at(-1) ?? null;
    return {
      symbol: h.symbol,
      name: displayName(h.symbol, i),
      sector: sec.label,
      sectorLabel: sec.label,
      sectorRaw: i?.sector ?? null,
      industry: i?.industry ?? null,
      isFinancial: sec.financial,
      quantity: h.quantity,
      avgPrice: h.avgPrice,
      buyDate: h.buyDate,
      price: snap?.price ?? null,
      prevClose: fresh ? (snap?.prevClose ?? null) : (snap?.price ?? null),
      changePct: fresh ? (snap?.changePct ?? null) : null,
      beta: snap?.beta ?? null,
      health: snap?.health?.score ?? null,
      healthPrev: p?.health?.score ?? null,
      altmanZone: snap?.health?.altmanZone ?? null,
      altmanZonePrev: p?.health?.altmanZone ?? null,
      healthAnnualChanged: !!lastPeriod(snap) && !!lastPeriod(p) && lastPeriod(snap) !== lastPeriod(p),
      nextResultsDate: snap?.nextResultsDate ?? null,
      results:
        r && r.detectedOn <= date
          ? { id: r.id, quarterEnd: r.quarterEnd, detectedOn: r.detectedOn, current: r.data.current, previous: r.data.previous, yearAgo: r.data.yearAgo, healthBefore: r.healthBefore, healthAfter: r.healthAfter, annualHealthUpdated: r.data.annualHealthUpdated }
          : null,
      prevWeight: prevTotal ? (prevVal.get(h.symbol) ?? 0) / prevTotal : null,
      snapshot: snap,
      stale: !fresh,
      instrument: i,
    };
  });
  const asOf = nifty?.asOf ?? nifty?.fetchedAt ?? null;
  return { tradeDate: date, holdings: rows, niftyPct: nifty && nifty.tradeDate === date ? nifty.changePct : null, nifty, sectorPct, asOf };
}
