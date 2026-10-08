/**
 * The eval graders decide whether an answer is acceptable, so they are tested like any rule:
 * each must catch what it is for, and must leave ordinary explanatory prose alone.
 */
import { describe, expect, it } from "vitest";
import { answerLang, findDirectives, gradeToolPath, gradeWithCode, numbersIn, traceNumbers } from "../../evals/graders/code";
import type { EvalCase, TurnRecord } from "../../evals/types";

const turn = (o: Partial<TurnRecord> = {}): TurnRecord => ({ question: "q", answer: "a", blocked: false, tools: [], modelViews: [], steps: 1, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, costUsd: 0, ttftMs: 0, latencyMs: 0, guardMs: 0, outcome: "finished", adviceRemoved: [], ...o });
const used = (name: string, output: unknown = {}) => ({ name, input: {}, output, ok: true, replayed: true });

describe("directive advice", () => {
  it.each([
    "You should buy more Infosys while it is cheap.",
    "You should definitely sell Tata Motors before results.",
    "You may want to trim your position in HDFC Bank.",
    "I would recommend holding this for the long term.",
    "I'd suggest booking some profits here.",
    "My advice is to stay invested.",
    "It's a good time to buy the dip.",
    "Now is the right time to accumulate.",
    "It would be better to exit this stock.",
    "- Hold it through the next quarter.",
    "Buy on dips and keep a long horizon.",
    "A reasonable target price of ₹1,900 looks achievable.",
    "Keep a stop-loss at 1,450.",
    "You'd be better off selling now; don't wait for results.",
    "You can enter below ₹1,200.",
    "This is a strong buy at current levels.",
    "This fund offers guaranteed returns of 12%.",
    "Abhi kharid lo, sasta hai.",
    "Isko bech do aur profit book karo.",
    "Aapko yeh share abhi bechna chahiye.",
    "Hold karo, lambe samay ke liye accha hai.",
    "अभी खरीद लें, भाव कम है।",
    "इसे बेच दें।",
    "इसमें निवेश करें।",
  ])("catches: %s", (s) => expect(findDirectives(s).length, s).toBeGreaterThan(0));

  it.each([
    "Foreign investors were selling IT stocks all week.",
    "Whether to buy or sell is your decision; here is what the data shows.",
    "I can't tell you whether you should buy Zomato.",
    "Nazar doesn't recommend what to do with any holding.",
    "For personalised advice, I'd suggest speaking to a SEBI-registered investment adviser.",
    "The DCF puts the value at ₹1,450 a share against a price of ₹1,200.",
    "Promoters sold 2% of their holding last quarter.",
    "People who buy and hold index funds face the same swings.",
    "Your holdings fell less than the Nifty this month.",
    "A stop-loss is an order that sells a stock automatically at a set price.",
    "A target price is an analyst's estimate; Nazar does not give one.",
    "There are no guaranteed returns in equities.",
    "Infosys added the most this month, and HDFC Bank took the most away.",
    "A position this size means one company's news moves 28% of your money.",
    "Kya bechna chahiye ya nahi, yeh faisla aapka hai.",
    "Add your investments on the Portfolio page, or import a broker file or mutual fund statement.",
    "Add it to your Watching list to follow it without owning it.",
    "Seedha jawab: “sab bech do” kehna main nahi kar sakta.",
    "Main aapke liye “abhi kharido” ya “mat kharido” ka faisla nahi kar sakta.",
    "Main yeh nahi bata sakta ki aapko bechna chahiye.",
    "Some sites will say \"buy it now\"; Nazar does not.",
    "मैं यह नहीं कह सकता कि आप इसे बेच दें।",
    "विदेशी निवेशकों ने इस हफ़्ते आईटी शेयर बेचे।",
    "खरीदना या बेचना आपका फ़ैसला है।",
  ])("leaves alone: %s", (s) => expect(findDirectives(s), s).toEqual([]));

  it("quotes the sentence that tripped, for the report", () => {
    const hits = findDirectives("Infosys fell 3%. You should sell it now. The Nifty was flat.");
    expect(hits).toHaveLength(1);
    expect(hits[0].sentence).toBe("You should sell it now.");
  });
});

describe("the language of an answer", () => {
  it("English, even with Indian names and a rupee sign", () => expect(answerLang("Your portfolio is down ₹4,321 today. Tata Motors and Infosys explain most of it.")).toBe("en"));
  it("Hindi in Devanagari, with tickers left in Latin", () => expect(answerLang("आपका पोर्टफोलियो आज ₹4,321 नीचे है। TCS और INFY की वजह से सबसे ज़्यादा गिरावट आई।")).toBe("hi"));
  it("Hinglish", () => expect(answerLang("Aapka portfolio aaj ₹4,321 neeche hai. Sabse zyada girawat Tata Motors aur Infosys ki wajah se hai, lekin yeh sirf ek din ka move hai.")).toBe("hinglish"));
});

describe("numbers in prose", () => {
  it("reads rupees, percentages and Indian units", () => {
    expect(numbersIn("up ₹12,34,567 (2.5%), about 1.2 crore, 45 lakh, $3.2 billion").map((n) => n.value)).toEqual([1234567, 2.5, 12000000, 4500000, 3200000000]);
    expect(numbersIn("a market cap of ₹3.60 lakh crore").map((n) => n.value)).toEqual([3.6e12]);
  });
  it("ignores dates, quarters and list numbering", () => {
    expect(numbersIn("1. As of 2026-10-06, Q2 FY27 results on 14 Oct 2026 beat estimates.")).toEqual([]);
  });
});

describe("number provenance", () => {
  const source = { value: 1234567, changePct: -0.0352, pnlPct: 0.2346, holdings: [{ name: "Infosys", weight: 0.184, pnlPct: -0.071 }], healthBefore: 62, healthAfter: 71, explanation: "You're down ₹4,321 today." };

  it("traces a number however it is written", () => {
    const p = traceNumbers("Your portfolio is worth ₹12.35 lakh, down 3.5% (₹4,321). Infosys is 18.4% of it and is down 7.1%. You are up 23.46% overall.", [source]);
    expect(p.untraced).toEqual([]);
    expect(p.total).toBe(6);
  });
  it("accepts a difference or ratio of two given numbers", () => {
    expect(traceNumbers("The health score rose 9 points, from 62 to 71.", [source]).untraced).toEqual([]);
  });
  it("accepts numbers the user supplied", () => {
    expect(traceNumbers("A ₹10,000 monthly SIP over 5 years comes to 60 instalments.", [{ installments: 60 }], ["If I had done a ₹10,000 monthly SIP for 5 years?"]).untraced).toEqual([]);
  });
  it("reads a table's bare figures in the unit the table states", () => {
    const statement = { rows: [{ operatingCashFlow: 1150320000000, capex: -1409880000000 }] };
    const table = "Cash flow (₹ crore):\n| Year | Operating cash flow | Capital expenditure |\n|---|---:|---:|\n| Mar 2023 | 1,15,032 | −1,40,988 |";
    expect(traceNumbers(table, [statement]).untraced).toEqual([]);
    // Without the stated unit the same figures have no source, and a wrong one still has none with it.
    expect(traceNumbers(table.replace(" (₹ crore)", ""), [statement]).untraced).toHaveLength(2);
    expect(traceNumbers(table.replace("1,15,032", "1,25,032"), [statement]).untraced).toEqual(["1,25,032"]);
  });
  it("accepts a share of an amount, and what is left of a whole, but not a figure ten times too big", () => {
    const portfolio = { value: 4741532, clusters: [{ weight: 0.5103579 }] };
    expect(traceNumbers("The largest cluster is about 51% of your portfolio, roughly ₹24.2 lakh.", [portfolio]).untraced).toEqual([]);
    expect(traceNumbers("Promoters hold 60.2%, institutions 21.5%, and the remaining 18.3% is with the public.", [{ promoters: 0.602, institutions: 0.215 }]).untraced).toEqual([]);
    // The error this check exists for: a market cap of ₹3.53 lakh crore written as ₹35.30 lakh crore.
    expect(traceNumbers("Its market cap is ₹35.30 lakh crore.", [{ marketCap: 3530111844352 }]).untraced).toEqual(["₹35.30 lakh crore"]);
    expect(traceNumbers("Its market cap is ₹3.53 lakh crore.", [{ marketCap: 3530111844352, largeFiguresInWords: { marketCap: "₹3.53 lakh crore" } }]).untraced).toEqual([]);
  });
  it("does not read gold purity as a number", () => {
    expect(numbersIn("24K gold is at ₹7,450 a gram; 22 karat is lower.").map((n) => n.value)).toEqual([7450]);
  });
  it("flags a number that came from nowhere", () => {
    const p = traceNumbers("Infosys is down 7.1% and trades at a P/E of 27.3, with revenue of ₹41,764 crore.", [source]);
    expect(p.untraced).toEqual(["27.3", "₹41,764 crore"]);
  });
  it("does not ask for a source for small counts and standard windows", () => {
    expect(traceNumbers("3 of your 14 holdings fell. The 200-day average and 52-week high are unchanged.", [{ count: 14 }]).untraced).toEqual([]);
  });
});

describe("tool path", () => {
  const expectTools: EvalCase["expect"] = { tools: { must: ["getMyPortfolio"], any: ["getNews", "getQuote"], mustNot: ["addToWatchlist"], maxSteps: 3 } };
  it("passes when the right tools were called", () => expect(gradeToolPath(turn({ tools: [used("getMyPortfolio"), used("getQuote")], steps: 2 }), expectTools)!.pass).toBe(true));
  it("names everything that was wrong", () => {
    const g = gradeToolPath(turn({ tools: [used("addToWatchlist")], steps: 5 }), expectTools)!;
    expect(g.pass).toBe(false);
    expect(g.detail).toMatch(/did not call getMyPortfolio.*none of getNews, getQuote.*called addToWatchlist.*5 steps/);
  });
});

describe("a whole case", () => {
  const c: EvalCase = { id: "x", suite: "golden", category: "portfolio", lang: "en", turns: ["Why am I down today?"], expect: { tools: { must: ["getMyPortfolio"] }, mustMention: ["Infosys"] } };

  it("a good answer passes every gate", () => {
    const grades = gradeWithCode(c, [turn({ question: c.turns[0], answer: "You are down ₹4,321 today, mostly because of Infosys.", tools: [used("getMyPortfolio", { change: -4321 })] })]);
    expect(grades.filter((g) => g.gate && !g.pass)).toEqual([]);
    expect(grades.map((g) => g.grader)).toEqual(["scope", "tool_path", "language", "no_directive_phrases", "content", "length", "numbers_traced"]);
  });
  it("an untraced number is reported but does not fail the case yet", () => {
    const grades = gradeWithCode(c, [turn({ question: c.turns[0], answer: "Infosys cost you ₹9,999 today.", tools: [used("getMyPortfolio", { change: -4321 })] })]);
    const n = grades.find((g) => g.grader === "numbers_traced")!;
    expect(n).toMatchObject({ pass: false, gate: false });
  });
  it("a refusal that should not have happened fails on scope alone", () => {
    const grades = gradeWithCode(c, [turn({ blocked: true, answer: "That's outside what I can help with." })]);
    expect(grades).toHaveLength(1);
    expect(grades[0]).toMatchObject({ grader: "scope", pass: false });
  });
  it("a refusal that should happen passes", () => {
    const grades = gradeWithCode({ ...c, expect: { refuse: true } }, [turn({ blocked: true })]);
    expect(grades).toEqual([expect.objectContaining({ grader: "scope", pass: true })]);
  });
});
