import { SYMBOL_ALIASES, normalizeName, yahooOf, type MasterIndex, type MasterRow } from "@/lib/instruments/master";

/**
 * Maps a broker row to an NSE ticker. Order (most → least certain):
 * ISIN → exact NSE symbol → known rename/alias → exact normalised name → unique partial name →
 * Yahoo search (NSE listing preferred, the v1 `searchTicker` rule) → unmatched (flagged for the user).
 */
export type Resolution =
  | { status: "matched"; symbol: string; name: string; isin: string | null; via: "isin" | "symbol" | "alias" | "name" | "partial" | "search" }
  | { status: "ambiguous"; candidates: { symbol: string; name: string }[]; /** The candidates are a model's guesses, checked against the NSE list: nothing is chosen for the user. */ suggested?: boolean }
  | { status: "unmatched"; reason: string };

export type SearchFn = (query: string) => Promise<{ symbol: string; name: string; type?: string }[]>;

const hit = (r: MasterRow, via: Extract<Resolution, { status: "matched" }>["via"]): Resolution => ({ status: "matched", symbol: yahooOf(r), name: r.name, isin: r.isin || null, via });

export function resolveLocal(index: MasterIndex, input: { rawName: string; symbol?: string | null; isin?: string | null }): Resolution {
  if (input.isin) {
    const r = index.byIsin.get(input.isin.toUpperCase());
    if (r) return hit(r, "isin");
  }
  const candidates = [input.symbol, input.rawName].filter(Boolean).map((s) => s!.trim().toUpperCase().replace(/\.(NS|BO)$/, "").replace(/-(EQ|BE)$/, ""));
  for (const c of candidates) {
    const r = index.bySymbol.get(c);
    if (r) return hit(r, "symbol");
    const alias = SYMBOL_ALIASES[c];
    if (alias && index.bySymbol.get(alias)) return hit(index.bySymbol.get(alias)!, "alias");
  }
  const key = normalizeName(input.rawName);
  if (!key) return { status: "unmatched", reason: "Empty name" };
  const exact = index.byName.get(key);
  if (exact?.length === 1) return hit(exact[0], "name");
  if (exact && exact.length > 1) return { status: "ambiguous", candidates: exact.map((r) => ({ symbol: yahooOf(r), name: r.name })) };
  // Partial: every word of the input appears at the start of the company's name ("HDFC Bank" ⊂ "HDFC Bank Limited").
  const partial = index.rows.filter((r) => {
    const n = normalizeName(r.name);
    return n.startsWith(key + " ") || n === key;
  });
  if (partial.length === 1) return hit(partial[0], "partial");
  if (partial.length > 1 && partial.length <= 5) return { status: "ambiguous", candidates: partial.map((r) => ({ symbol: yahooOf(r), name: r.name })) };
  return { status: "unmatched", reason: "Not found in the NSE list" };
}

/** Local first, then a remote search for whatever is still unmatched. */
export async function resolve(index: MasterIndex, input: { rawName: string; symbol?: string | null; isin?: string | null }, search?: SearchFn): Promise<Resolution> {
  const local = resolveLocal(index, input);
  if (local.status !== "unmatched" || !search) return local;
  try {
    const results = await search(input.rawName);
    const eq = results.filter((r) => !r.type || /EQUITY/i.test(r.type));
    const ns = eq.find((r) => r.symbol.endsWith(".NS"));
    if (ns) {
      const base = ns.symbol.replace(/\.NS$/, "");
      const m = index.bySymbol.get(base);
      return { status: "matched", symbol: ns.symbol, name: m?.name ?? ns.name, isin: m?.isin ?? null, via: "search" };
    }
  } catch {
    // Search is best effort; the row stays flagged for the user.
  }
  return local;
}
