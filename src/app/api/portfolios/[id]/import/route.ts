import { randomUUID } from "crypto";
import { getDb, schema } from "@/lib/db";
import { badRequest } from "@/lib/errors";
import { api, json, requireUser } from "@/lib/http";
import { parseHoldings } from "@/lib/importers/brokers";
import { readTable } from "@/lib/importers/read";
import { resolve } from "@/lib/importers/resolve";
import { getMaster } from "@/lib/instruments/master";
import { ipHash, rateLimit } from "@/lib/limits";
import { NV, yahooCall, yf } from "@/lib/finance";
import { requirePortfolio } from "@/lib/repo/portfolios";
import { track } from "@/lib/analytics";

export const runtime = "nodejs";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Step 1 of an import: parse a Zerodha / Groww / Upstox (or generic) CSV/XLSX, detect the broker,
 * resolve every row to an NSE ticker and return a preview. Nothing is saved until the user confirms
 * (POST /api/portfolios/[id]/holdings). Unmatched rows are flagged for the user to fix or skip.
 */
export const POST = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  await requirePortfolio(u.id, id);
  await rateLimit(`import:${u.id}`, 30, 3600_000);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw badRequest("Choose a CSV or XLSX file to import.");
  if (file.size > MAX_BYTES) throw badRequest("That file is larger than 2 MB. Export only your holdings.");
  const table = await readTable(new Uint8Array(await file.arrayBuffer()), file.name);
  const parsed = parseHoldings(table);
  const index = getMaster();
  const search = async (q: string) => {
    await rateLimit(`import:search:${ipHash(req)}`, 60, 3600_000);
    const r: any = await yahooCall(() => yf.search(q, { quotesCount: 6, newsCount: 0 }, NV));
    return (r?.quotes ?? []).filter((x: any) => x.symbol).map((x: any) => ({ symbol: x.symbol, name: x.longname ?? x.shortname ?? x.symbol, type: x.quoteType }));
  };
  const rows = [];
  for (const row of parsed.rows) rows.push({ ...row, resolution: await resolve(index, row, search) });
  const unmatched = rows.filter((r) => r.resolution.status !== "matched");
  const db = await getDb();
  await db.insert(schema.importBatches).values({ id: randomUUID(), portfolioId: id, broker: parsed.broker, filename: file.name.slice(0, 120), rowCount: rows.length, matched: rows.length - unmatched.length, unmatched: unmatched.map((r) => ({ name: r.rawName, reason: r.resolution.status })) });
  track(u.id, "import_previewed", { broker: parsed.broker, rows: rows.length, unmatched: unmatched.length });
  return json({ broker: parsed.broker, format: parsed.format, rows, skipped: parsed.skipped });
});
