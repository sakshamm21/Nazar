import "server-only";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { schema, type DB } from "@/lib/db";
import type { MarketDataProvider, Split } from "@/lib/data/provider";
import { classOfSymbol } from "@/lib/instruments/catalog";
import { isForeignSymbol } from "@/lib/instruments/asset-classes";
import { shiftDate } from "@/lib/market/store";
import { summarise } from "@/lib/portfolio/lots";
import { logger } from "@/lib/logger";

/**
 * Splits and bonus issues. A price source adjusts its history when a company splits its shares, but
 * a holding's quantity and purchase prices are the user's own figures, so without this a 1:2 split
 * would look like the holding halved overnight.
 *
 * On a new action: every purchase lot bought before the ex-date, and recorded before it, gets
 * `ratio` times the units at 1/`ratio` of the price (what it cost is unchanged); the stored price
 * history is refetched, already adjusted. A lot recorded after the ex-date came from a broker file
 * or an entry that already states the new share count, so it is left alone. The action is written
 * first and keyed by (symbol, ex-date), so a re-run never applies it twice.
 */
const LOOKBACK_DAYS = 30;

/** Symbols that can split: listed shares, ETFs, REITs and US shares. */
export const splittable = (symbol: string) => isForeignSymbol(symbol) || ["stock", "etf", "reit"].includes(classOfSymbol(symbol) ?? "stock");

export async function applySplits(db: DB, provider: MarketDataProvider, symbols: string[], today: string, deadline = Infinity) {
  if (!provider.splits) return { checked: 0, applied: 0 };
  let checked = 0, applied = 0;
  const from = new Date(`${shiftDate(today, -LOOKBACK_DAYS)}T00:00:00Z`);
  for (const symbol of symbols.filter(splittable)) {
    if (Date.now() > deadline) break;
    checked++;
    let splits: Split[] = [];
    try {
      splits = await provider.splits(symbol, from);
    } catch (e) {
      logger.warn({ symbol, err: String((e as Error)?.message ?? e).slice(0, 200) }, "splits: lookup failed");
      continue;
    }
    for (const s of splits) if (s.date <= today && (await applySplit(db, provider, symbol, s))) applied++;
  }
  return { checked, applied };
}

export async function applySplit(db: DB, provider: MarketDataProvider, symbol: string, split: Split): Promise<boolean> {
  const claimed = await db.insert(schema.corporateActions).values({ symbol, exDate: split.date, ratio: split.ratio }).onConflictDoNothing().returning({ symbol: schema.corporateActions.symbol });
  if (!claimed.length) return false;

  // The start of the ex-date in India: a lot recorded before this did not know about the split.
  const exStart = new Date(`${split.date}T00:00:00+05:30`);
  const holdings = await db.select().from(schema.holdings).where(eq(schema.holdings.symbol, symbol));
  let adjusted = 0;
  for (const h of holdings) {
    const lots = await db.select().from(schema.holdingLots).where(eq(schema.holdingLots.holdingId, h.id));
    const before = lots.filter((l) => l.date < split.date && l.createdAt < exStart);
    if (!before.length) continue;
    for (const l of before) {
      await db
        .update(schema.holdingLots)
        .set({ quantity: l.quantity * split.ratio, remaining: l.remaining * split.ratio, price: l.price / split.ratio })
        .where(eq(schema.holdingLots.id, l.id));
    }
    const ids = new Set(before.map((l) => l.id));
    const next = summarise(lots.map((l) => (ids.has(l.id) ? { ...l, remaining: l.remaining * split.ratio, price: l.price / split.ratio } : l)));
    await db.update(schema.holdings).set({ quantity: next.quantity, avgPrice: next.avgPrice, updatedAt: new Date() }).where(eq(schema.holdings.id, h.id));
    adjusted++;
  }
  await db.update(schema.corporateActions).set({ holdingsAdjusted: adjusted }).where(and(eq(schema.corporateActions.symbol, symbol), eq(schema.corporateActions.exDate, split.date)));

  // The stored history before the ex-date is in old shares; the source's is adjusted. Replace it.
  try {
    const bars = await provider.dailyHistory(symbol, new Date(`${shiftDate(split.date, -400)}T00:00:00Z`));
    const old = bars.filter((b) => b.date < split.date);
    if (old.length) {
      await db.delete(schema.priceDaily).where(and(eq(schema.priceDaily.symbol, symbol), lt(schema.priceDaily.date, split.date), gte(schema.priceDaily.date, old[0].date)));
      for (let i = 0; i < old.length; i += 200) await db.insert(schema.priceDaily).values(old.slice(i, i + 200).map((b) => ({ symbol, date: b.date, source: "live", close: b.close, volume: b.volume }))).onConflictDoNothing();
    }
    // Snapshots before the ex-date hold prices in old shares too.
    const snaps = await db.select({ tradeDate: schema.symbolSnapshots.tradeDate, source: schema.symbolSnapshots.source, price: schema.symbolSnapshots.price, prevClose: schema.symbolSnapshots.prevClose }).from(schema.symbolSnapshots).where(and(eq(schema.symbolSnapshots.symbol, symbol), lt(schema.symbolSnapshots.tradeDate, split.date)));
    for (const sn of snaps) {
      await db
        .update(schema.symbolSnapshots)
        .set({ price: sn.price == null ? null : sn.price / split.ratio, prevClose: sn.prevClose == null ? null : sn.prevClose / split.ratio })
        .where(and(eq(schema.symbolSnapshots.symbol, symbol), eq(schema.symbolSnapshots.tradeDate, sn.tradeDate), eq(schema.symbolSnapshots.source, sn.source)));
    }
  } catch (e) {
    logger.warn({ symbol, err: String((e as Error)?.message ?? e).slice(0, 200) }, "splits: history refresh failed");
  }
  logger.info({ symbol, exDate: split.date, ratio: split.ratio, adjusted }, "split applied");
  return true;
}

/** Splits in the last `days` on any of these symbols, newest first, for the notes on Analysis. */
export async function recentSplits(db: DB, symbols: string[], since: string) {
  if (!symbols.length) return [];
  return db.select().from(schema.corporateActions).where(and(inArray(schema.corporateActions.symbol, symbols), gte(schema.corporateActions.exDate, since)));
}
