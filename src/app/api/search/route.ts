import { NV, yahooCall, yf } from "@/lib/data/yahoo";
import { api, json, requireUser } from "@/lib/http";
import { MARKET_CLASSES, type MarketClass } from "@/lib/instruments/asset-classes";
import { foreignHits, searchCatalog, type RemoteQuote } from "@/lib/instruments/catalog";
import { rateLimit } from "@/lib/limits";

export const runtime = "nodejs";

/**
 * Search for anything a portfolio can hold. Indian stocks, ETFs, mutual funds, REITs and InvITs,
 * gold and silver come from the bundled lists (no provider call per keystroke). US stocks and crypto
 * have no list to bundle, so `type=us` or `type=crypto` asks the data provider, rate-limited per user.
 * `type` narrows the bundled search to one or more asset classes, comma-separated.
 */
export const GET = api(async (req) => {
  const u = await requireUser(req);
  const p = new URL(req.url).searchParams;
  const q = p.get("q")?.trim() ?? "";
  if (q.length < 2) return json({ results: [] });
  const classes = (p.get("type") ?? "").split(",").filter((c): c is MarketClass => (MARKET_CLASSES as readonly string[]).includes(c));
  const foreign = classes.find((c) => c === "us" || c === "crypto") as "us" | "crypto" | undefined;
  if (foreign) {
    await rateLimit(`search:${u.id}`, 240, 3600_000, "That's a lot of searching. Please wait a few minutes.");
    const r = (await yahooCall(() => yf.search(q.slice(0, 60), { quotesCount: 12, newsCount: 0 }, NV)).catch(() => null)) as { quotes?: RemoteQuote[] } | null;
    return json({ results: foreignHits(r?.quotes ?? [], foreign).slice(0, 10) });
  }
  return json({ results: searchCatalog(q, { classes, limit: classes.length ? 20 : 14 }) });
});
