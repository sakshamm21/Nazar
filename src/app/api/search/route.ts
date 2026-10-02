import { api, json, requireUser } from "@/lib/http";
import { getMaster, normalizeName, toYahoo } from "@/lib/instruments/master";

export const runtime = "nodejs";

/** Ticker search for "add a holding": the bundled NSE list only (no Yahoo call per keystroke). */
export const GET = api(async (req) => {
  await requireUser(req);
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return json({ results: [] });
  const m = getMaster();
  const up = q.toUpperCase().replace(/\.NS$/, "");
  const nq = normalizeName(q);
  const scored = m.rows
    .map((r) => {
      const n = normalizeName(r.name);
      const score = r.symbol === up ? 100 : r.symbol.startsWith(up) ? 80 : n.startsWith(nq) ? 70 : n.includes(nq) ? 40 : r.isin === up ? 90 : 0;
      return { r, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.r.symbol.length - b.r.symbol.length)
    .slice(0, 8);
  return json({ results: scored.map(({ r }) => ({ symbol: toYahoo(r.symbol), name: r.name, isin: r.isin })) });
});
