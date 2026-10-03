import "server-only";
import { and, desc, eq, gte, inArray, lt, lte } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { schema } from "@/lib/db";
import { NIFTY } from "@/lib/instruments/sectors";

/**
 * Reads market data from Postgres — pages never call a data provider. Data is keyed by `source`:
 * "live" (the nightly checkup and refresh-on-open) or "sim:<userId>" (a test account's simulated
 * bad day, which sits on top of live data for that user only). A user reads a chain of sources in
 * priority order, e.g. ["sim:abc", "live"].
 */
export type Snapshot = typeof schema.symbolSnapshots.$inferSelect;
export type Instrument = typeof schema.instruments.$inferSelect;

export function sourcesFor(u: { id: string; simState?: { date: string } | null }): string[] {
  return u.simState ? [`sim:${u.id}`, "live"] : ["live"];
}

/** Sources that define "today" for this user (the whole chain: a simulated day is the latest one). */
export const dateSources = (chain: string[]) => chain;

const rank = (sources: string[], s: string) => {
  const i = sources.indexOf(s);
  return i < 0 ? 99 : i;
};

/** Most recent trade date with a Nifty snapshot in this source chain. */
export async function latestTradeDate(db: DB, sources: string[]): Promise<string | null> {
  const rows = await db
    .select({ d: schema.symbolSnapshots.tradeDate, s: schema.symbolSnapshots.source })
    .from(schema.symbolSnapshots)
    .where(and(eq(schema.symbolSnapshots.symbol, NIFTY), inArray(schema.symbolSnapshots.source, dateSources(sources))))
    .orderBy(desc(schema.symbolSnapshots.tradeDate))
    .limit(5);
  return rows[0]?.d ?? null;
}

/** Latest snapshot per symbol on or before `date` (within 14 days), best source first. */
export async function snapshotsAsOf(db: DB, symbols: string[], date: string, sources: string[], strictlyBefore = false): Promise<Map<string, Snapshot>> {
  if (!symbols.length) return new Map();
  const from = shiftDate(date, -21);
  const rows = await db
    .select()
    .from(schema.symbolSnapshots)
    .where(
      and(
        inArray(schema.symbolSnapshots.symbol, symbols),
        inArray(schema.symbolSnapshots.source, sources),
        strictlyBefore ? lt(schema.symbolSnapshots.tradeDate, date) : lte(schema.symbolSnapshots.tradeDate, date),
        gte(schema.symbolSnapshots.tradeDate, from),
      ),
    );
  const best = new Map<string, Snapshot>();
  for (const r of rows) {
    const cur = best.get(r.symbol);
    if (!cur || r.tradeDate > cur.tradeDate || (r.tradeDate === cur.tradeDate && rank(sources, r.source) < rank(sources, cur.source))) best.set(r.symbol, r);
  }
  return best;
}

/** Daily closes per symbol since `from`, merging sources by priority. */
export async function priceHistory(db: DB, symbols: string[], sources: string[], from: string, to?: string): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  if (!symbols.length) return out;
  const rows = await db
    .select()
    .from(schema.priceDaily)
    .where(and(inArray(schema.priceDaily.symbol, symbols), inArray(schema.priceDaily.source, sources), gte(schema.priceDaily.date, from), ...(to ? [lte(schema.priceDaily.date, to)] : [])));
  const seen = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.symbol}|${r.date}`;
    const rk = rank(sources, r.source);
    if (seen.has(k) && seen.get(k)! <= rk) continue;
    seen.set(k, rk);
    if (!out.has(r.symbol)) out.set(r.symbol, new Map());
    out.get(r.symbol)!.set(r.date, r.close);
  }
  for (const [s, m] of out) out.set(s, new Map([...m.entries()].sort(([a], [b]) => a.localeCompare(b))));
  return out;
}

export async function instrumentsFor(db: DB, symbols: string[]): Promise<Map<string, Instrument>> {
  if (!symbols.length) return new Map();
  const rows = await db.select().from(schema.instruments).where(inArray(schema.instruments.symbol, symbols));
  return new Map(rows.map((r) => [r.symbol, r]));
}

export type ResultsEvent = typeof schema.resultsEvents.$inferSelect;

/** Most recent results event per symbol (any date), best source first. */
export async function latestResults(db: DB, symbols: string[], sources: string[]): Promise<Map<string, ResultsEvent>> {
  if (!symbols.length) return new Map();
  const rows = await db.select().from(schema.resultsEvents).where(and(inArray(schema.resultsEvents.symbol, symbols), inArray(schema.resultsEvents.source, sources)));
  const best = new Map<string, ResultsEvent>();
  for (const r of rows) {
    const cur = best.get(r.symbol);
    if (!cur || r.quarterEnd > cur.quarterEnd || (r.quarterEnd === cur.quarterEnd && rank(sources, r.source) < rank(sources, cur.source))) best.set(r.symbol, r);
  }
  return best;
}

export function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Previous weekday (Mon–Fri) strictly before `iso`. */
export function prevWeekday(iso: string): string {
  let d = shiftDate(iso, -1);
  while ([0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay())) d = shiftDate(d, -1);
  return d;
}
