/** Which of the tools that change something a question may use, from the user's own words alone. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WRITE_TOOLS, writesAsked } from "@/lib/ask/writes";
import type { EvalCase } from "../../evals/types";

const ADD = ["addToWatchlist"];
const REMOVE = ["removeFromWatchlist"];

describe("the tools that write", () => {
  it("are the two that change the Watching list", () => expect(WRITE_TOOLS).toEqual([...ADD, ...REMOVE]));
});

describe("a message that asks for the change", () => {
  it.each([
    ["Add Titan to my Watching list", ADD],
    ["add TCS and Infosys to my watchlist please", ADD],
    ["Can you put HDFC Bank on my watch list?", ADD],
    ["Start watching Zomato", ADD],
    ["Watch Titan for me", ADD],
    ["Please track Reliance", ADD],
    ["Add Suzlon to my list", ADD],
    ["Titan ko meri watchlist mein daal do", ADD],
    ["TCS watchlist mein jodo", ADD],
    ["टाइटन को मेरी वॉचलिस्ट में जोड़ो", ADD],
    ["Remove Titan from my Watching list", REMOVE],
    ["Stop watching Zomato", REMOVE],
    ["Take Wipro off my watchlist", REMOVE],
    ["Unwatch Paytm", REMOVE],
    ["Paytm ko watchlist se hatao", REMOVE],
    ["पेटीएम को वॉचलिस्ट से हटाओ", REMOVE],
    ["Remove Wipro from my watchlist and add Infosys", [...ADD, ...REMOVE]],
  ])("%s", (q, want) => expect(writesAsked(q)).toEqual(want));
});

describe("everything else gets no tool that writes", () => {
  it.each([
    "Latest news on Zomato",
    "What did Infosys add this quarter?",
    "Give me a quick update on the stocks I'm watching",
    "What is on my Watching list?",
    "How do I use the watchlist?",
    "Set an alert if Infosys goes above 1100",
    "Why is my portfolio down this month?",
    "What is the track record of Infosys's management?",
    "Follow up on that: what about TCS?",
    "Should I drop Paytm?",
    "Is it time to stop my SIP?",
    "Yes",
    "मेरे पोर्टफोलियो में सबसे जोखिम भरा शेयर कौन सा है?",
  ])("%s", (q) => expect(writesAsked(q)).toEqual([]));

  it("no question the evals forbid a write on would be offered one", () => {
    const cases = ["golden", "adversarial"].flatMap((f) =>
      readFileSync(path.join(process.cwd(), "evals", "cases", `${f}.jsonl`), "utf8")
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l) as EvalCase),
    );
    for (const c of cases) {
      const forbidden = (c.expect?.tools?.mustNot ?? []).filter((t) => (WRITE_TOOLS as string[]).includes(t));
      const required = (c.expect?.tools?.must ?? []).filter((t) => (WRITE_TOOLS as string[]).includes(t));
      const offered = writesAsked(c.turns.at(-1)!);
      for (const t of forbidden) expect(offered, `${c.id}: ${t}`).not.toContain(t);
      for (const t of required) expect(offered, `${c.id}: ${t}`).toContain(t);
    }
  });
});

describe("a yes, to an offer the assistant made", () => {
  const offer = "Titan is not in your portfolio. Want me to add it to your Watching list?";
  it("is a request for what was offered", () => {
    expect(writesAsked("Yes please", offer)).toEqual(ADD);
    expect(writesAsked("haan kar do", offer)).toEqual(ADD);
    expect(writesAsked("Yes", "Shall I remove Paytm from your Watching list?")).toEqual(REMOVE);
  });
  it("is nothing when no such offer was made, or the answer says more than yes", () => {
    expect(writesAsked("Yes please", "Titan closed at ₹3,400. Want a chart of the last year?")).toEqual([]);
    expect(writesAsked("Yes", "I added nothing to your Watching list. It has five stocks.")).toEqual([]);
    expect(writesAsked("Yes, and tell me everything about its results over the last four quarters", offer)).toEqual([]);
    expect(writesAsked("Yesterday's close?", offer)).toEqual([]);
  });
});
