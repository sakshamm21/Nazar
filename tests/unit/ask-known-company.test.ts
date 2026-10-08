/** The company a question names, resolved from Nazar's own NSE list before the model runs. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { asSearchResult, findCompany } from "@/lib/ask/known-company";
import { getMaster } from "@/lib/instruments/master";
import type { EvalCase } from "../../evals/types";

const index = getMaster();
const symbolOf = (q: string) => findCompany(q, index)?.symbol ?? null;

describe("a question about one company", () => {
  it.each([
    ["Explain Infosys's latest results in simple words", "INFY.NS"],
    ["What is TCS trading at?", "TCS.NS"],
    ["Is HDFC Bank financially healthy?", "HDFCBANK.NS"],
    ["Run a DCF on Infosys", "INFY.NS"],
    ["Give me a deep dive on Titan", "TITAN.NS"],
    ["Latest news on Zomato", "ETERNAL.NS"],
    ["Show Reliance's cash flow statement for the last 4 years", "RELIANCE.NS"],
    ["What is the financial health score of Tata Steel?", "TATASTEEL.NS"],
    ["Who owns ITC?", "ITC.NS"],
    ["Add Titan to my Watching list", "TITAN.NS"],
    ["Asian Paints ka P/E kya hai?", "ASIANPAINT.NS"],
    ["what is infosys trading at", "INFY.NS"],
    ["How has HDFCBANK.NS done this year?", "HDFCBANK.NS"],
  ])("%s → %s", (q, want) => expect(symbolOf(q)).toBe(want));

  it("is handed over as a search that found the NSE listing and nothing else", () => {
    const c = findCompany("Is HDFC Bank financially healthy?", index)!;
    expect(asSearchResult(c)).toEqual({ query: "HDFC Bank", results: [{ symbol: "HDFCBANK.NS", name: "HDFC Bank", exchange: "NSE", type: "EQUITY" }] });
  });
});

describe("everything else is left to the model", () => {
  it.each([
    "Compare HDFC Bank and ICICI Bank on valuation",
    "Value HDFC Bank against ICICI Bank, Kotak and Axis Bank using comps",
    "Why is my portfolio down this month?",
    "How are Indian markets doing today?",
    "What is the price of gold today?",
    "Explain XIRR like I am new to investing",
    "Which sectors are up the most this week?",
    "Is this a good time to buy Tata stocks?",
    "What is Apple trading at?",
    "Show me the top Nifty losers",
    "How do I import my holdings?",
    "Can I track my SIP here?",
    "hi",
  ])("%s", (q) => expect(findCompany(q, index)).toBeNull());

  it("no eval question about the user's own money, the market or a concept is read as a company", () => {
    const cases = ["golden", "adversarial"].flatMap((f) => readFileSync(path.join(process.cwd(), "evals", "cases", `${f}.jsonl`), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as EvalCase));
    const wrong = cases.filter((c) => ["market", "learn", "privacy", "off-topic"].includes(c.category)).flatMap((c) => c.turns.map((t) => [c.id, t, symbolOf(t)] as const)).filter(([, , s]) => s);
    expect(wrong).toEqual([]);
  });
});
