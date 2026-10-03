import { after } from "next/server";
import { z } from "zod";
import { api, json, parseBody, requireUser } from "@/lib/http";
import { upsertHoldings } from "@/lib/repo/portfolios";
import { firstLookFor } from "@/lib/pipeline/first-look";

export const runtime = "nodejs";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

const Item = z.object({
  symbol: z.string().trim().min(1).max(30),
  quantity: z.number().positive("Quantity must be more than 0.").max(1e9),
  avgPrice: z.number().positive("Average price must be more than 0.").max(1e8),
  buyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  isin: z.string().max(12).nullable().optional(),
  rawName: z.string().max(120).nullable().optional(),
  source: z.enum(["manual", "zerodha", "groww", "upstox", "generic", "screenshot"]).default("manual"),
});
/** `mode`: "replace" overwrites a symbol already held (imports); "add" merges it in as a further purchase. */
const Body = z.object({ holdings: z.array(Item).min(1).max(200), mode: z.enum(["replace", "add"]).default("replace") });

/** Adds or updates market holdings (adding by hand, or the confirm step of an import). */
export const POST = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  const { holdings, mode } = await parseBody(req, Body);
  const rows = await upsertHoldings(u.id, id, holdings, mode);
  // New symbols get a one-time first look right away instead of waiting for tonight's checkup.
  after(() => firstLookFor(u, holdings.map((h) => h.symbol)));
  return json({ holdings: rows });
});
