import { api, json, requireUser } from "@/lib/http";
import { MARKET_CLASSES, type MarketClass } from "@/lib/instruments/asset-classes";
import { searchCatalog } from "@/lib/instruments/catalog";

export const runtime = "nodejs";

/**
 * Search for anything a portfolio can hold: stocks, ETFs, mutual funds, REITs and InvITs, gold and
 * silver. Uses the bundled lists only (no data-provider call per keystroke). `type` narrows it to
 * one or more asset classes, comma-separated.
 */
export const GET = api(async (req) => {
  await requireUser(req);
  const p = new URL(req.url).searchParams;
  const q = p.get("q")?.trim() ?? "";
  if (q.length < 2) return json({ results: [] });
  const classes = (p.get("type") ?? "").split(",").filter((c): c is MarketClass => (MARKET_CLASSES as readonly string[]).includes(c));
  return json({ results: searchCatalog(q, { classes, limit: classes.length ? 20 : 14 }) });
});
