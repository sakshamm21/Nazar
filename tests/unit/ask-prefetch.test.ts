/** Which data is read before the model runs, from the wording of the question alone. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { planPrefetch } from "@/lib/ask/prefetch";
import type { EvalCase } from "../../evals/types";

const snapshot = (portfolio?: string) => ({ tool: "getMyPortfolio", input: portfolio ? { portfolio } : {} });
const period = (p: string, portfolio?: string) => ({ tool: "getPortfolioPerformance", input: { period: p, ...(portfolio ? { portfolio } : {}) } });

describe("a question plainly about the user's portfolio", () => {
  it.each([
    ["Which of my holdings is riskiest, and why?", snapshot()],
    ["How diversified am I really?", snapshot()],
    ["Why am I down today?", snapshot()],
    ["What is my money actually in?", snapshot()],
    ["What does beta mean? Use my holdings as examples", snapshot()],
    ["Mere portfolio mein sabse risky share kaunsa hai?", snapshot()],
    ["आज मेरे पोर्टफोलियो में क्या हुआ?", snapshot()],
    // The questions the Risk and Stock screens open Ask with.
    ["How concentrated am I, and in what?", snapshot()],
    ["Explain what's going on with my holding Titan Company (TITAN.NS) in simple words", snapshot()],
    ["Explain what's going on with my holding Parag Parikh Flexi Cap Fund in simple words", snapshot()],
    ["Why is my portfolio down this month?", period("1M")],
    ["How did my portfolio do over the last week?", period("1W")],
    ["Over the last year, how much of my portfolio's move was just the market?", period("1Y")],
    ["How have my investments done over the last 3 months?", period("3M")],
    ["Is mahine mera portfolio kyun gira?", period("1M")],
    ["पिछले साल मेरा पोर्टफोलियो कैसा रहा?", period("1Y")],
  ])("%s", (q, want) => expect(planPrefetch(q)).toEqual(want));

  it("reads the portfolio the question names, when there is more than one", () => {
    expect(planPrefetch("How is my Dividend basket portfolio doing?", ["My portfolio", "Dividend basket"])).toEqual(snapshot("Dividend basket"));
    expect(planPrefetch("How did my dividend basket portfolio do this month?", ["My portfolio", "Dividend basket"])).toEqual(period("1M", "Dividend basket"));
    expect(planPrefetch("How is my portfolio doing?", ["My portfolio", "Dividend basket"])).toEqual(snapshot("My portfolio"));
  });
});

describe("everything else is left to the model", () => {
  it.each([
    "What is TCS trading at?",
    "Compare HDFC Bank and ICICI Bank on valuation",
    "How are Indian markets doing today?",
    "Explain XIRR like I am new to investing",
    "What is my friend's favourite stock?",
    // Another tool answers these, so reading the portfolio first would be wasted.
    "Am I on track for my savings goals?",
    "How much of my gain would count as long-term if I sold today?",
    "Add Titan to my Watching list",
    "Give me a quick update on the stocks I'm watching",
    "How do I import my Zerodha holdings?",
    "hi",
    // A scenario is worked out by its own tool, from the question's number.
    "What if the Nifty falls 15%?",
    "Agar market 20% gir jaye toh mere portfolio ka kya hoga?",
    "If the Nifty fell 10%, roughly what would happen to my portfolio?",
  ])("%s", (q) => expect(planPrefetch(q)).toBeNull());
});

describe("against the eval cases", () => {
  const cases = ["golden", "adversarial"].flatMap((f) => readFileSync(path.join(process.cwd(), "evals", "cases", `${f}.jsonl`), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as EvalCase));
  const expected = (c: EvalCase) => [...(c.expect.tools?.must ?? []), ...(c.expect.tools?.any ?? [])];

  it("never reads ahead for a tool the case says must not be the answer", () => {
    for (const c of cases) {
      const plan = planPrefetch(c.turns.at(-1)!);
      if (plan) expect(c.expect.tools?.mustNot ?? [], c.id).not.toContain(plan.tool);
    }
  });

  it("when it reads ahead, it reads what the case expects", () => {
    const wrong: string[] = [];
    for (const c of cases) {
      const plan = planPrefetch(c.turns.at(-1)!);
      const want = expected(c).filter((t) => t === "getMyPortfolio" || t === "getPortfolioPerformance");
      if (plan && want.length && !want.includes(plan.tool)) wrong.push(`${c.id}: read ${plan.tool}, case expects ${want.join(" or ")}`);
    }
    expect(wrong).toEqual([]);
  });

  it("catches most of the cases that need the portfolio", () => {
    const need = cases.filter((c) => (c.expect.tools?.must ?? []).some((t) => t === "getMyPortfolio" || t === "getPortfolioPerformance"));
    const caught = need.filter((c) => planPrefetch(c.turns.at(-1)!));
    expect(caught.length / need.length).toBeGreaterThan(0.75);
  });
});
