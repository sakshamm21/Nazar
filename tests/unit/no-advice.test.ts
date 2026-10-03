/**
 * HARD RULE: Nazar never says buy / sell / hold / target price, in English or Hindi.
 * 1. The guard catches advice phrasing in English, Hindi and Hinglish.
 * 2. Every generated text (alerts across a scenario matrix, every template, weekly reports, emails,
 *    the glossary, the disclaimer) passes the guard in both languages.
 * 3. Every user-facing string literal in the UI source passes the guard.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DISCLAIMER, findAdvice, isAdviceFree, safeText } from "@/lib/alerts/guard";
import type { ReasonKind } from "@/lib/alerts/reason";
import { evaluate, type DayHolding, type DayInput } from "@/lib/alerts/rules";
import * as T from "@/lib/alerts/templates";
import { effectiveSettings } from "@/lib/alerts/thresholds";
import { emails, digestEmail, reportEmail } from "@/lib/email/templates";
import { GLOSSARY } from "@/lib/glossary";
import { attribution, type HoldingState } from "@/lib/portfolio/math";
import { buildWeekly } from "@/lib/reports/weekly";
import type { Sensitivity } from "@/lib/db/schema";

const expectClean = (texts: string[]) => {
  const bad = texts.flatMap((t) => findAdvice(t).map((v) => `${v.match}  ⟵  ${t.slice(0, 140)}`));
  expect(bad).toEqual([]);
};
const strings = (o: unknown): string[] => (typeof o === "string" ? [o] : Array.isArray(o) ? o.flatMap(strings) : o && typeof o === "object" ? Object.values(o).flatMap(strings) : []);

describe("the guard catches advice", () => {
  it.each([
    "You should buy more Infosys",
    "Consider selling Tata Motors",
    "Hold Infosys through results",
    "Time to book profits",
    "Our target price is ₹2,000",
    "Set a stop-loss at 900",
    "We recommend HDFC Bank",
    "Infosys looks undervalued",
    "Strong buy rating",
    "Accumulate on dips",
    "Average down on this fall",
    "Exit the position now",
    "Don't miss this multibagger",
  ])("EN: %s", (s) => expect(isAdviceFree(s)).toBe(false));
  it.each(["Infosys के शेयर ख़रीदें", "अभी बेचें", "इसे होल्ड करें", "लक्ष्य मूल्य ₹2000", "टारगेट ₹900 है", "स्टॉप लॉस लगाएँ", "निवेश करें", "मुनाफ़ा वसूली करें", "बने रहें"])("HI: %s", (s) => expect(isAdviceFree(s)).toBe(false));
  it.each(["Infosys kharido", "abhi becho", "hold karo"])("Hinglish: %s", (s) => expect(isAdviceFree(s)).toBe(false));

  it("does not trip on everyday words", () => {
    expectClean(["Your holdings", "Shareholders approved", "The threshold", "Promoter holding fell", "Infosys was sold off in a broad slide", "household names"]);
  });
  it("safeText swaps in a fallback", () => {
    expect(safeText("Buy now", "fallback", "test")).toBe("fallback");
    expect(safeText("Infosys fell 3%", "fallback")).toBe("Infosys fell 3%");
  });
});

/* ------------------------------------------------------------------ */
/* Scenario matrix                                                       */
/* ------------------------------------------------------------------ */

const SECTORS = [
  { sector: "IT", sectorRaw: "Technology", industry: "Information Technology Services", idx: "^CNXIT" },
  { sector: "Banks", sectorRaw: "Financial Services", industry: "Banks - Regional", idx: "^NSEBANK" },
  { sector: "Pharma", sectorRaw: "Healthcare", industry: "Drug Manufacturers - Specialty & Generic", idx: "^CNXPHARMA" },
  { sector: "Auto", sectorRaw: "Consumer Cyclical", industry: "Auto Manufacturers", idx: "^CNXAUTO" },
];
const quarter = (end: string, rev: number, earn: number, eps: number, est: number | null) => ({ quarterEnd: end, revenue: rev, earnings: earn, epsActual: eps, epsEstimate: est });

function scenario(i: number, moves: number[], nifty: number, sectorMove: number, ownerLabel: string | null, withResults: boolean): DayInput {
  const holdings: DayHolding[] = moves.map((m, j) => {
    const s = SECTORS[(i + j) % SECTORS.length];
    return {
      symbol: `S${j}.NS`,
      name: ["Infosys", "HDFC Bank", "Sun Pharma", "Tata Motors", "ITC", "Reliance"][j % 6],
      ...s,
      quantity: 10 + j * 15,
      avgPrice: 80 + j * 10,
      buyDate: "2024-03-15",
      price: 100 * (1 + m),
      prevClose: 100,
      changePct: m,
      beta: 0.6 + j * 0.2,
      health: 40 + j * 9,
      healthPrev: j === 1 ? 70 : 40 + j * 9,
      nextResultsDate: j === 2 ? "2026-10-05" : null,
      results:
        withResults && j === 0
          ? { id: "r1", quarterEnd: "2026-06-30", detectedOn: "2026-10-02", current: quarter("2026-06-30", 1100, 150, 10.5, 10), previous: quarter("2026-03-31", 1000, 160, 10, 10), yearAgo: quarter("2025-06-30", 900, 120, 8, 8), annualHealthUpdated: i % 2 === 0, healthBefore: 60, healthAfter: i % 2 === 0 ? 72 : 60 }
          : null,
      prevWeight: j === 3 ? 0.2 : null,
      healthAnnualChanged: j === 1,
      altmanZone: j === 1 ? "Grey" : "Safe",
      altmanZonePrev: "Safe",
    } as DayHolding;
  });
  return { tradeDate: "2026-10-02", portfolio: { id: `p${i}`, ownerLabel }, holdings, niftyPct: nifty, sectorPct: Object.fromEntries(SECTORS.map((s) => [s.idx, sectorMove])), recent: [], priceTargets: [{ id: "t1", symbol: "S0.NS", direction: "below", target: 99, note: "my level" }, { id: "t2", symbol: "S1.NS", direction: "above", target: 101, note: null }] };
}

describe("every alert the engine can produce is advice-free (EN + HI)", () => {
  const sens: Sensitivity[] = ["everything", "balanced", "major"];
  const moveSets = [
    [-0.08, -0.06, -0.03, 0.01, 0.002],
    [0.09, 0.05, 0.03, -0.01, 0.0],
    [-0.12, 0.07, -0.045, 0.025, -0.01, 0.06],
    [-0.04, -0.035, -0.05, -0.06, -0.045, -0.03],
    [0.001, -0.002, 0.0, 0.003],
  ];
  const cases = moveSets.flatMap((moves, i) => [-0.025, 0.004, 0.02].flatMap((nifty) => sens.flatMap((s) => [null, "Papa"].map((owner) => ({ moves, i, nifty, s, owner })))));
  it(`${cases.length} scenarios`, () => {
    let produced = 0;
    const types = new Set<string>();
    for (const c of cases) {
      const out = evaluate(scenario(c.i, c.moves, c.nifty, c.nifty * 1.4, c.owner, c.i % 2 === 0), effectiveSettings(c.s));
      produced += out.length;
      out.forEach((a) => types.add(a.type));
      expectClean(out.flatMap((a) => [a.title.en, a.title.hi, a.body.en, a.body.hi, ...strings(a.data)]));
    }
    expect(produced).toBeGreaterThan(100);
    expect(types.size).toBeGreaterThanOrEqual(7);
  });
});

describe("every template is advice-free (EN + HI)", () => {
  const hs = (owner: string | null): HoldingState[] => [
    { symbol: "A", name: "Infosys", sector: "IT", quantity: 10, avgPrice: 900, buyDate: null, price: 950, prevClose: 1000, beta: 1, health: 80 },
    { symbol: "B", name: "HDFC Bank", sector: "Banks", quantity: 10, avgPrice: 1500, buyDate: null, price: 1530, prevClose: 1500, beta: 0.9, health: null },
    { symbol: "C", name: owner ?? "ITC", sector: "FMCG", quantity: 100, avgPrice: 400, buyDate: null, price: 401, prevClose: 400, beta: 0.6, health: 70 },
  ];
  it("stock moves × every reason", () => {
    const reasons: ReasonKind[] = ["market", "sector", "results", "company"];
    for (const reason of reasons)
      for (const pct of [-0.09, -0.031, 0.042, 0.11]) {
        expectClean(strings(T.reasonText({ name: "Infosys", changePct: pct, reason, niftyPct: -0.02, sectorPct: -0.04, sectorName: "IT", sectorNameHi: "आईटी", sectorIndexName: "Nifty IT" })));
        expectClean(strings(T.REASON_LABEL[reason]));
      }
  });
  it("attribution, market split and portfolio moves", () => {
    for (const owner of [null, "Papa"])
      for (const nifty of [-0.03, 0, 0.02]) {
        const a = attribution(hs(owner), nifty);
        expectClean(strings([T.attributionLine(a, owner), T.marketSplitLine(a), T.portfolioMoveText({ attribution: a, ownerLabel: owner })]));
      }
    expectClean(strings(T.attributionLine(attribution([], 0))));
  });
  it("results, health, concentration, upcoming, price levels, digest and learning", () => {
    const pts = T.resultsPoints(quarter("2026-06-30", 1100, 150, 10.5, 10), quarter("2026-03-31", 1000, 160, 10, 10), quarter("2025-06-30", 900, 120, 8, 8));
    const worse = T.resultsPoints(quarter("2026-06-30", 800, -20, -1, 2), quarter("2026-03-31", 1000, 160, 10, 10), quarter("2025-06-30", 900, 120, 8, 8));
    expectClean(
      strings([
        pts,
        worse,
        T.resultsText({ name: "Infosys", quarterEnd: "2026-06-30", points: pts, healthBefore: 60, healthAfter: 72, annualHealthUpdated: true }),
        T.resultsText({ name: "Infosys", quarterEnd: "2026-06-30", points: worse, healthBefore: 72, healthAfter: 60, annualHealthUpdated: true }),
        T.resultsText({ name: "Infosys", quarterEnd: "2026-06-30", points: [], healthBefore: null, healthAfter: null, annualHealthUpdated: false }),
        T.healthChangeText({ name: "Yes Bank", before: 70, after: 40, zoneBefore: "Safe", zoneAfter: "Distress" }),
        T.healthChangeText({ name: "Yes Bank", before: 40, after: 70 }),
        T.concentrationText({ label: "Infosys", weight: 0.31, limit: 25, kind: "stock" }),
        T.concentrationText({ label: "Banks", weight: 0.46, limit: 40, kind: "sector", ownerLabel: "Papa" }),
        T.upcomingText({ name: "TCS", date: "2026-10-09" }),
        T.priceTargetText({ name: "Infosys", direction: "below", target: 1400, price: 1390, note: "check results" }),
        T.priceTargetText({ name: "Infosys", direction: "above", target: 1600, price: 1610 }),
        T.digestText({ count: 3 }),
        T.learnedText({ type: "stock_move", value: 5, muted: false }),
        T.learnedText({ type: "portfolio_move", value: 3, muted: false }),
        T.learnedText({ type: "concentration", value: 30, muted: false }),
        T.learnedText({ type: "results_upcoming", value: null, muted: true }),
      ]),
    );
  });
});

describe("weekly reports, emails, glossary and disclaimer are advice-free", () => {
  it("weekly report in both languages, up and down weeks", () => {
    for (const [s, e] of [[100, 92], [100, 108], [100, 100]])
      for (const owner of [null, "Papa"]) {
        const w = buildWeekly({
          portfolioName: "Mine",
          ownerLabel: owner,
          weekStart: "2026-09-28",
          weekEnd: "2026-10-02",
          holdings: [{ symbol: "A", name: "Infosys", quantity: 10, startPrice: s, endPrice: e }, { symbol: "B", name: "ITC", quantity: 5, startPrice: 400, endPrice: 410 }],
          niftyStart: 25000,
          niftyEnd: 24600,
          alerts: [{ type: "stock_move", titleEn: "Infosys fell 8.0%", titleHi: "Infosys 8.0% गिरा" }],
          results: [{ name: "Infosys", summaryEn: "Revenue grew 10% from a year ago", summaryHi: "राजस्व एक साल पहले से 10% बढ़ा" }],
          upcoming: [{ name: "TCS", date: "2026-10-09" }],
        });
        expectClean(strings([w.en, w.hi]));
        for (const lang of ["en", "hi"] as const) expectClean(strings(reportEmail({ lang, subject: w[lang].subject, sections: w[lang].sections, link: "https://x/r", unsubscribeUrl: "https://x/u" })));
      }
  });
  it("every email template", () => {
    const items = [{ title: "Infosys fell 8.0%", body: "Infosys is 12% of your portfolio.", severity: "critical" as const, link: "https://x/a", usefulUrl: "https://x/y", notUsefulUrl: "https://x/n", simulated: true }];
    expectClean(
      strings([
        emails.verificationCode({ name: "Aarav", code: "123456", minutes: 15 }),
        emails.passwordReset({ name: "Aarav", url: "https://x/reset", minutes: 30 }),
        emails.recipientConfirm({ ownerName: "Aarav", portfolioName: "Papa", url: "https://x/c", lang: "hi" }),
        emails.recipientConfirm({ ownerName: "Aarav", portfolioName: "Papa", url: "https://x/c", lang: "en" }),
        digestEmail({ lang: "en", portfolioName: "Mine", items, appLink: "https://x", unsubscribeUrl: "https://x/u" }),
        digestEmail({ lang: "hi", portfolioName: "Papa", items, appLink: "https://x" }),
      ]),
    );
  });
  it("glossary and disclaimer", () => {
    expectClean(strings(GLOSSARY));
    expectClean([DISCLAIMER.en, DISCLAIMER.hi]);
    expect(DISCLAIMER.en).toMatch(/you decide/);
  });
});

/* ------------------------------------------------------------------ */
/* UI copy                                                               */
/* ------------------------------------------------------------------ */

const ROOT = path.resolve(__dirname, "../..");
// Files whose job is to name the forbidden words: the guard itself and the AI's instructions/refusals.
// brokers.ts matches CSV column headers ("avg buy price"); users never see those strings from us.
const ALLOW = new Set(["src/lib/importers/brokers.ts", "src/lib/alerts/guard.ts", "src/lib/ask/prompt.ts", "src/lib/guard.ts", "src/app/api/chat/route.ts"]);
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|mdx?)$/.test(f) ? [p] : [];
  });
/** String literals and JSX text: what a user can actually read. */
const userText = (src: string) => {
  const out: string[] = [];
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  for (const m of noComments.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) out.push(m[1] ?? m[2] ?? m[3]);
  for (const m of noComments.matchAll(/>([^<>{}]*[A-Za-zऀ-ॿ][^<>{}]*)</g)) out.push(m[1]);
  return out;
};

describe("UI copy is advice-free", () => {
  it("every string a user can read in src/app, src/components and src/lib", () => {
    const files = ["src/app", "src/components", "src/lib"].flatMap((d) => walk(path.join(ROOT, d)));
    expect(files.length).toBeGreaterThan(100);
    const bad: string[] = [];
    for (const f of files) {
      const rel = path.relative(ROOT, f).replace(/\\/g, "/");
      if (ALLOW.has(rel)) continue;
      for (const t of userText(readFileSync(f, "utf8"))) for (const v of findAdvice(t)) bad.push(`${rel}: "${v.match}" in ${JSON.stringify(t.slice(0, 120))}`);
    }
    expect(bad).toEqual([]);
  });
});
