import { randomUUID } from "crypto";
import { getDb, schema } from "@/lib/db";
import { badRequest } from "@/lib/errors";
import { api, json, requireUser } from "@/lib/http";
import { parseSheets } from "@/lib/importers/brokers";
import { parseCas } from "@/lib/importers/cas";
import { PdfPasswordError, isPdf, readPdfText, readTables } from "@/lib/importers/read";
import { resolve, type Resolution } from "@/lib/importers/resolve";
import { suggestMatches } from "@/lib/importers/suggest";
import { estimateCost } from "@/lib/ask/models";
import { getCatalog, searchCatalog } from "@/lib/instruments/catalog";
import { getMaster } from "@/lib/instruments/master";
import { ipHash, overBudget, rateLimit } from "@/lib/limits";
import { NV, yahooCall, yf } from "@/lib/data/yahoo";
import { requirePortfolio } from "@/lib/repo/portfolios";
import { track } from "@/lib/events";

export const runtime = "nodejs";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Step 1 of an import: parse a Zerodha / Groww / Upstox (or generic) CSV/XLSX, or a mutual fund
 * statement PDF from CAMS / KFintech (with its password), resolve every row to an instrument and
 * return a preview. Nothing is saved until the user confirms
 * (POST /api/portfolios/[id]/holdings). Unmatched rows are flagged for the user to fix or skip;
 * for those, a model may suggest matches from the NSE list, which the user still has to choose.
 */
export const POST = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  await requirePortfolio(u.id, id);
  await rateLimit(`import:${u.id}`, 30, 3600_000);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw badRequest("Choose a CSV, XLSX or PDF file to import.");
  if (file.size > MAX_BYTES) throw badRequest("That file is larger than 2 MB. Export only your holdings.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let parsed;
  try {
    // The statement's password is used once to open it here and is never stored or logged.
    parsed = isPdf(bytes, file.name) ? parseCas(await readPdfText(bytes, String(form?.get("password") ?? "") || undefined)) : parseSheets(await readTables(bytes, file.name));
  } catch (e) {
    if (e instanceof PdfPasswordError) throw badRequest(e.message, e.wrong ? "PDF_PASSWORD_WRONG" : "PDF_PASSWORD");
    throw badRequest((e as Error).message || "Couldn't read that file.");
  }
  const index = getMaster();
  const search = async (q: string) => {
    await rateLimit(`import:search:${ipHash(req)}`, 60, 3600_000);
    const r: any = await yahooCall(() => yf.search(q, { quotesCount: 6, newsCount: 0 }, NV));
    return (r?.quotes ?? []).filter((x: any) => x.symbol).map((x: any) => ({ symbol: x.symbol, name: x.longname ?? x.shortname ?? x.symbol, type: x.quoteType }));
  };
  const rows: ((typeof parsed.rows)[number] & { resolution: Resolution })[] = [];
  for (const row of parsed.rows) {
    // Mutual funds aren't exchange-listed: their ISIN maps straight to the AMFI scheme.
    const fund = row.isin ? getCatalog().byIsin.get(row.isin) : null;
    let resolution: Resolution = fund?.assetClass === "mf" ? { status: "matched", symbol: fund.symbol, name: fund.name, isin: row.isin ?? null, via: "isin" } : await resolve(index, row, parsed.broker === "cas" ? undefined : search);
    // Still unknown: it may be a fund named without an ISIN. Offer the closest schemes to choose from.
    if (resolution.status === "unmatched") {
      const funds = searchCatalog(row.rawName.replace(/\b(plan|option|fund)\b/gi, " "), { classes: ["mf"], limit: 4 });
      if (funds.length) resolution = { status: "ambiguous", candidates: funds.map((f) => ({ symbol: f.symbol, name: f.name })) };
    }
    rows.push({ ...row, resolution });
  }
  const db = await getDb();
  // Whatever is still unknown in a broker file gets a second opinion: a model proposes tickers, and
  // only those in the NSE list are kept, as suggestions the user picks or skips. A fund statement is
  // left alone: its schemes are matched by ISIN and name, and have no ticker to propose.
  let suggested = 0;
  const unknown = parsed.broker === "cas" ? [] : rows.filter((r) => r.resolution.status === "unmatched");
  // Not when today's model budget is spent: the rows simply stay flagged, as they were before this existed.
  if (unknown.length && !(await overBudget(u.id))) {
    const help = await suggestMatches(index, unknown.map((r) => ({ line: r.line, rawName: r.rawName })));
    for (const r of unknown) {
      const candidates = help.byLine.get(r.line);
      if (candidates) {
        r.resolution = { status: "ambiguous", candidates, suggested: true };
        suggested++;
      }
    }
    // It is model spend like any other: it counts toward the same daily budgets as Ask.
    if (help.usage) await db.insert(schema.usage).values({ id: randomUUID(), userId: u.id, model: help.usage.model, inputTokens: help.usage.inputTokens, outputTokens: help.usage.outputTokens, costUsd: estimateCost(help.usage.model, help.usage.inputTokens, help.usage.outputTokens) }).catch(() => {});
  }
  const unmatched = rows.filter((r) => r.resolution.status !== "matched");
  await db.insert(schema.importBatches).values({ id: randomUUID(), portfolioId: id, broker: parsed.broker, filename: file.name.slice(0, 120), rowCount: rows.length, matched: rows.length - unmatched.length, unmatched: unmatched.map((r) => ({ name: r.rawName, reason: r.resolution.status })) });
  track(u.id, "import_previewed", { broker: parsed.broker, rows: rows.length, unmatched: unmatched.length, suggested });
  return json({ broker: parsed.broker, format: parsed.format, rows, skipped: parsed.skipped, notes: parsed.notes ?? [] });
});
