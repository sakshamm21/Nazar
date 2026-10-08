import { DISPLAY_NAMES, SYMBOL_ALIASES, normalizeName, shortName, yahooOf, type MasterIndex } from "@/lib/instruments/master";

/**
 * The company a question names, found in Nazar's own NSE list before any model runs.
 *
 * In 768 saved eval answers, 269 began with the model calling searchTicker, and a company answer
 * that began that way reached its first word two seconds later than one that did not. The search
 * also puts foreign listings first ("HDFC Bank" → HDB, the New York one). Nazar already knows the
 * NSE list, its renames and the names people actually use, so the question's company is resolved
 * here and handed to the model as a search it had already made.
 *
 * Cautious, like prefetch.ts: exactly one company, named unmistakably. Two companies, a group name
 * ("Tata", "Reliance" on its own is the one exception people mean) or a common word are left to the
 * model, which searches as before. A miss costs nothing.
 *
 * Pure: the caller passes in the index.
 */
export type KnownCompany = { query: string; symbol: string; name: string };

/** Words that start a question or name a thing that is not a company. Never the first word of a match. */
const NOT_A_NAME = new Set(
  "a an and are as at be by can compare could did do does explain for from give has have how i if in is it its latest me my of on or run set should show tell than that the their this to value was what when where which who why will with would write add remove put start stop watch track please nifty sensex india indian market markets sector stock stocks share shares fund funds gold silver sip etf dcf news results today".split(" "),
);

let common: Map<string, string> | null = null;
/** The names people use, to the NSE symbol: "infosys" → INFY, "zomato" → ETERNAL. */
function commonNames(): Map<string, string> {
  if (common) return common;
  common = new Map();
  for (const [yahoo, display] of Object.entries(DISPLAY_NAMES)) {
    if (!yahoo.endsWith(".NS")) continue;
    // "Eternal (Zomato)" is known by both.
    for (const part of display.split(/[()]/).map((s) => s.trim()).filter(Boolean)) common.set(normalizeName(part), yahoo.replace(/\.NS$/, ""));
  }
  for (const [old, now] of Object.entries(SYMBOL_ALIASES)) if (!common.has(old.toLowerCase())) common.set(old.toLowerCase(), now);
  return common;
}

const WORD = /[A-Za-z0-9&.'-]+/g;

export function findCompany(text: string, index: MasterIndex): KnownCompany | null {
  const words = [...text.matchAll(WORD)].map((m) => ({ raw: m[0].replace(/^['.-]+|['.,-]+$/g, "").replace(/'s$/i, ""), at: m.index! })).filter((w) => w.raw);
  const found = new Map<string, KnownCompany>();
  const taken = new Set<number>();
  // Longest names first, so "Tata Consultancy Services" is not read as three words.
  for (let size = 4; size >= 1; size--) {
    for (let i = 0; i + size <= words.length; i++) {
      if ([...Array(size).keys()].some((k) => taken.has(i + k))) continue;
      const span = words.slice(i, i + size);
      const first = span[0].raw;
      // A name is written with a capital or a digit; "titan" in lower case is still let through below by the common names.
      if (NOT_A_NAME.has(first.toLowerCase()) || NOT_A_NAME.has(span[size - 1].raw.toLowerCase())) continue;
      const written = span.map((w) => w.raw).join(" ");
      const key = normalizeName(written);
      if (!key) continue;
      const capital = /^[A-Z0-9]/.test(first);
      let row = undefined as ReturnType<MasterIndex["bySymbol"]["get"]>;
      const byCommon = commonNames().get(key);
      if (byCommon) row = index.bySymbol.get(byCommon);
      // A ticker typed as one: all capitals, three letters or more ("TCS", "INFY", "HDFCBANK.NS").
      if (!row && size === 1 && /^[A-Z][A-Z0-9&-]{2,}(\.NS)?$/.test(first)) row = index.bySymbol.get(first.replace(/\.NS$/, "")) ?? (SYMBOL_ALIASES[first] ? index.bySymbol.get(SYMBOL_ALIASES[first]) : undefined);
      // The company's own name, in full ("Asian Paints", "Tata Steel"): two words or more, capitalised, and only one company has it.
      if (!row && capital && size >= 2) {
        const exact = index.byName.get(key);
        if (exact?.length === 1) row = exact[0];
      }
      if (!row) continue;
      for (let k = 0; k < size; k++) taken.add(i + k);
      found.set(row.symbol, { query: written, symbol: yahooOf(row), name: DISPLAY_NAMES[yahooOf(row)]?.replace(/\s*\(.*\)$/, "") ?? shortName(row.name) });
    }
  }
  return found.size === 1 ? [...found.values()][0] : null;
}

/** What searchTicker would have returned, had it known what Nazar knows: the NSE listing, alone. */
export const asSearchResult = (c: KnownCompany) => ({ query: c.query, results: [{ symbol: c.symbol, name: c.name, exchange: "NSE", type: "EQUITY" }] });
