/**
 * Google News RSS (free, keyless) for company-specific moves only (H1 "likely reason").
 *
 * The bar is high: we show a headline only if it is clearly ABOUT this company. Rejected:
 * - market wraps and roundups ("Sensex today", "stocks to watch", "top gainers", "buzzing stocks")
 * - headlines that name two or more other listed companies (multi-stock lists)
 * - tips, predictions and anything that reads as a recommendation (no-advice guard)
 * - anything older than the move's window
 * - any headline that also appears for another holding in the same run (generic news)
 * At most 2 per alert; trusted Indian business sources first.
 * Fetched only for symbols that triggered a company-specific alert, so a handful of calls a day.
 */
import { findAdvice } from "@/lib/alerts/guard";

export type Headline = { title: string; source: string; link: string; published: string };

const GENERIC = [
  /\b(sensex|nifty|market)s?\b.*\b(today|live|update|close|closing|opening|ends|ended|settles|wrap|highlights)\b/i,
  /\bstock market (today|live|update|news)\b/i,
  /\bstocks? (to|that) (watch|buy|track)\b/i,
  /\b(top|biggest) (gainers|losers|movers)\b/i,
  /\b(buzzing|trending|hot|top \d+|\d+) stocks\b/i,
  /\bstocks in (news|focus|the news)\b/i,
  /\bshares? to watch\b/i,
  /\bmarket (outlook|wrap|recap|mood)\b/i,
  /\b(prediction|forecast|price target|share price target|technical view|trading (idea|call))\b/i,
  /\bmidday|pre-?market|opening bell|closing bell\b/i,
  /\bmutual funds? (bought|sold|added)\b/i,
];

const TRUSTED = /(economic times|economictimes|moneycontrol|livemint|mint|business standard|reuters|cnbc|ndtv profit|financial express|the hindu businessline|businessline|bloomberg|the hindu|times of india|business today)/i;

/** Distinctive name tokens: "Infosys Limited" → ["infosys"]; "HDFC Bank Limited" → ["hdfc bank"]. */
export function companyNeedles(name: string, symbol: string, aliases: string[] = []): string[] {
  const base = name.replace(/\b(limited|ltd\.?|the)\b/gi, "").replace(/\s+/g, " ").trim();
  const ticker = symbol.replace(/\.(NS|BO)$/, "");
  const out = new Set<string>([base.toLowerCase(), ...aliases.map((a) => a.toLowerCase())]);
  if (ticker.length >= 3 && !/^[A-Z]{1,3}$/.test(ticker)) out.add(ticker.toLowerCase());
  return [...out].filter((x) => x.length >= 3);
}

const mentions = (title: string, needle: string) => new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(title);

export function filterHeadlines(items: Headline[], opts: { needles: string[]; otherCompanies: string[]; since: Date; max?: number }): Headline[] {
  const seen = new Set<string>();
  const kept = items.filter((h) => {
    const t = h.title.replace(/\s+-\s+[^-]+$/, ""); // Google appends " - Publisher"
    const key = t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    if (new Date(h.published) < opts.since) return false;
    if (!opts.needles.some((n) => mentions(t, n))) return false;
    if (GENERIC.some((re) => re.test(t))) return false;
    if (findAdvice(t).length) return false;
    const others = opts.otherCompanies.filter((o) => !opts.needles.includes(o) && mentions(t, o)).length;
    if (others >= 2) return false;
    return true;
  });
  return kept
    .sort((a, b) => Number(TRUSTED.test(b.source)) - Number(TRUSTED.test(a.source)) || new Date(b.published).getTime() - new Date(a.published).getTime())
    .slice(0, opts.max ?? 2);
}

/** Drops headlines that appear for more than one symbol in the same run (they're about the market, not the company). */
export function dropShared(bySymbol: Map<string, Headline[]>): Map<string, Headline[]> {
  const count = new Map<string, number>();
  const k = (h: Headline) => h.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  for (const list of bySymbol.values()) for (const h of new Set(list.map(k))) count.set(h, (count.get(h) ?? 0) + 1);
  return new Map([...bySymbol].map(([s, list]) => [s, list.filter((h) => (count.get(k(h)) ?? 0) < 2)]));
}

export function parseRss(xml: string): Headline[] {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  const tag = (s: string, t: string) => {
    const m = new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`).exec(s);
    return m ? decode(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, "").trim()) : "";
  };
  return items.map((it) => ({ title: tag(it, "title"), link: tag(it, "link"), source: tag(it, "source"), published: new Date(tag(it, "pubDate") || 0).toISOString() }));
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");

const newsEnabled = () => process.env.NEWS_ENABLED !== "0";

/** Fetches recent headlines for one company. Never throws: news is optional context. */
export async function fetchCompanyNews(name: string, symbol: string, opts: { since: Date; otherCompanies: string[]; aliases?: string[]; fetchImpl?: typeof fetch }): Promise<Headline[]> {
  if (!newsEnabled()) return [];
  const needles = companyNeedles(name, symbol, opts.aliases);
  const q = `"${needles[0]}" when:3d`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`;
  try {
    const res = await (opts.fetchImpl ?? fetch)(url, { headers: { "user-agent": "Mozilla/5.0 (Nazar news check)" }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    return filterHeadlines(parseRss(await res.text()), { needles, otherCompanies: opts.otherCompanies, since: opts.since });
  } catch {
    return [];
  }
}
