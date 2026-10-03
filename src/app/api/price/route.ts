import { api, json, requireUser } from "@/lib/http";
import { getDb } from "@/lib/db";
import { badRequest } from "@/lib/errors";
import { marketProvider } from "@/lib/data/market";
import { istDate } from "@/lib/data/provider";
import { isForeignSymbol, isManualSymbol } from "@/lib/instruments/asset-classes";
import { catalogItem } from "@/lib/instruments/catalog";
import { rateLimit } from "@/lib/limits";
import { snapshotsAsOf, sourcesFor } from "@/lib/market/store";

export const runtime = "nodejs";

/**
 * The latest price of one instrument, for the "add to portfolio" form (it pre-fills the price and
 * turns an amount into units). Stored prices are used when Nazar already tracks the symbol; only
 * something nobody holds yet costs one provider call.
 */
export const GET = api(async (req) => {
  const u = await requireUser(req);
  const symbol = new URL(req.url).searchParams.get("symbol")?.trim().toUpperCase() ?? "";
  if (!symbol || isManualSymbol(symbol) || !(catalogItem(symbol) || (isForeignSymbol(symbol) && /^[A-Z]+:[A-Z0-9.-]{1,12}$/.test(symbol)))) throw badRequest("Unknown instrument.");
  const db = await getDb();
  const stored = (await snapshotsAsOf(db, [symbol], istDate(new Date()), sourcesFor(u))).get(symbol);
  if (stored?.price != null) return json({ symbol, price: stored.price, asOf: stored.tradeDate });
  await rateLimit(`price:${u.id}`, 120, 3600_000);
  const [q] = await marketProvider.quotes([symbol]).catch(() => []);
  return json({ symbol, price: q?.price ?? null, asOf: q?.asOf ? istDate(new Date(q.asOf)) : null });
});
