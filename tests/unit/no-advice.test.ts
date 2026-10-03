/**
 * HARD RULE: Nazar never says buy / sell / hold / target price, in English or Hindi.
 * 1. The guard catches advice phrasing in English, Hindi and Hinglish.
 * 2. Every generated text (the day's explanation, results, emails, the glossary, the disclaimer)
 *    passes the guard.
 * 3. Every user-facing string literal in the UI source passes the guard.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DISCLAIMER, findAdvice, isAdviceFree, safeText } from "@/lib/guard";
import * as T from "@/lib/portfolio/words";
import { emails } from "@/lib/email/templates";
import { GLOSSARY } from "@/lib/glossary";
import { attribution, type HoldingState } from "@/lib/portfolio/math";

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

describe("everything Nazar writes is advice-free", () => {
  const hs = (): HoldingState[] => [
    { symbol: "A", name: "Infosys", sector: "IT", quantity: 10, avgPrice: 900, buyDate: null, price: 950, prevClose: 1000, beta: 1, health: 80 },
    { symbol: "B", name: "HDFC Bank", sector: "Banks", quantity: 10, avgPrice: 1500, buyDate: null, price: 1530, prevClose: 1500, beta: 0.9, health: null },
    { symbol: "C", name: "ITC", sector: "FMCG", quantity: 100, avgPrice: 400, buyDate: null, price: 401, prevClose: 400, beta: 0.6, health: 70 },
  ];
  const quarter = (end: string, rev: number, earn: number, eps: number, est: number | null) => ({ quarterEnd: end, revenue: rev, earnings: earn, epsActual: eps, epsEstimate: est });
  it("today's move and what explains it", () => {
    for (const nifty of [-0.03, 0, 0.02]) {
      const a = attribution(hs(), nifty);
      expectClean(strings([T.attributionLine(a), T.marketSplitLine(a)]));
    }
    expectClean(strings(T.attributionLine(attribution([], 0))));
  });
  it("a quarter's results and the health line", () => {
    expectClean(strings([
      T.resultsPoints(quarter("2026-06-30", 45500, 7600, 18.3, 17.9), quarter("2026-03-31", 42000, 7000, 16.9, 17), quarter("2025-06-30", 39000, 6400, 15.5, null)),
      T.resultsPoints(quarter("2026-06-30", 40000, 5000, 12, 14), quarter("2026-03-31", 42000, 7000, 16.9, 17), null),
      T.healthLine({ healthBefore: 62, healthAfter: 71, annualHealthUpdated: true }),
      T.healthLine({ healthBefore: 71, healthAfter: 60, annualHealthUpdated: true }),
      T.healthLine({ healthBefore: null, healthAfter: null, annualHealthUpdated: false }),
      T.quarterName("2026-06-30"),
    ]));
  });
  it("the two emails Nazar sends: a sign-up code and a password reset", () => {
    expect(Object.keys(emails).sort()).toEqual(["passwordReset", "verificationCode"]);
    expectClean(strings([emails.verificationCode({ name: "Aarav", code: "123456", minutes: 15 }), emails.passwordReset({ name: "Aarav", url: "https://x/reset", minutes: 30 })]));
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
const ALLOW = new Set(["src/lib/importers/brokers.ts", "src/lib/guard.ts", "src/lib/ask/prompt.ts", "src/lib/ask/scope-guard.ts", "src/app/api/chat/route.ts"]);
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
