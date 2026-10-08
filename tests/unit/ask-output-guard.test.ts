/**
 * The filter that keeps advice out of a live answer. It works on text that arrives in fragments,
 * so the tests feed it fragments: what matters is what the reader ends up seeing.
 */
import { describe, expect, it } from "vitest";
import { REMOVED_NOTE, SentenceFilter, findDirectives } from "@/lib/ask/output-guard";

/** Streams `text` through the filter in fragments of `size` characters, as a model would send it. */
const stream = (text: string, size = 7) => {
  const f = new SentenceFilter();
  let seen = "";
  for (let i = 0; i < text.length; i += size) seen += f.push(text.slice(i, i + size));
  seen += f.end();
  return { seen, removed: f.removed };
};

describe("an answer with no advice in it", () => {
  const clean = "Your portfolio is down ₹4,321 today (-0.35%).\n\n- Infosys took away ₹2,100.\n- HDFC Bank added ₹600.\n\n**What this means for you:** most of the move was the market. Whether to act on it is your decision";
  it.each([1, 3, 7, 50, 1000])("comes out exactly as it went in, in fragments of %i", (size) => {
    expect(stream(clean, size)).toEqual({ seen: clean, removed: [] });
  });
  it("is released a sentence at a time, never mid-sentence", () => {
    const f = new SentenceFilter();
    expect(f.push("Infosys fell 3% to")).toBe("");
    expect(f.push("day. HDFC Bank ro")).toBe("Infosys fell 3% today. ");
    expect(f.push("se.")).toBe("");
    expect(f.end()).toBe("HDFC Bank rose.");
  });
});

describe("an answer that slips into advice", () => {
  it("loses that sentence and keeps the rest, with one note in its place", () => {
    const { seen, removed } = stream("Infosys fell 3% today. You should sell it before results. The Nifty was flat.");
    expect(seen).toBe(`Infosys fell 3% today. ${REMOVED_NOTE} The Nifty was flat.`);
    expect(removed).toEqual(["you should"]);
  });
  it("says so once, however many sentences go", () => {
    const { seen, removed } = stream("I would recommend holding this. It is a good time to buy more. Keep a stop-loss at 1,450. Revenue grew 12%.");
    expect(seen.split(REMOVED_NOTE)).toHaveLength(2);
    expect(seen).toContain("Revenue grew 12%.");
    expect(seen).not.toMatch(/recommend|good time|stop-loss/);
    expect(removed).toHaveLength(3);
  });
  it("handles a bullet, keeping the list intact", () => {
    const { seen } = stream("What stands out:\n- IT is 34% of your money.\n- Trim it on the next rally.\n- Banks are 20%.\n");
    expect(seen).toBe(`What stands out:\n- IT is 34% of your money.\n- ${REMOVED_NOTE}\n- Banks are 20%.\n`);
  });
  it("catches the last sentence, which has no full stop after it", () => {
    expect(stream("Margins widened. Abhi kharid lo").seen).toBe(`Margins widened. ${REMOVED_NOTE} `);
  });
  it("works in Hindi and Hinglish", () => {
    expect(stream("TCS का P/E 15 है। इसे अभी बेच दें। मार्जिन स्थिर है।").removed).toEqual(["hindi imperative"]);
    expect(stream("Portfolio thoda gira hai. Aapko yeh share abhi bechna chahiye. Baaki sab theek hai.").removed).toHaveLength(1);
  });
  it("records which pattern fired, never the words", () => {
    const { removed } = stream("You should buy more Infosys while it is cheap.");
    expect(removed.join(" ")).not.toMatch(/Infosys|cheap/);
  });
});

describe("what it deliberately lets through", () => {
  it.each([
    "The data can help frame a review, but it can’t determine which holding you should sell.",
    "Add your investments first, then ask again.",
    "Your snapshot flags a few losses and meaningful overlap, but it doesn’t show which holding you ought to sell.",
    "Nothing in this data settles what you should buy next.",
    "Whether it is a good time to invest depends on your time horizon.",
    "Holding these four stocks provides healthy diversification across sectors.",
    "For the exact steps, I'd recommend checking the app's Portfolio section.",
    "Becho-ya-rakho ka faisla aapka hai.",
    "क्या आपको खरीदना चाहिए?",
    "उदाहरण के लिए, आप हर महीने ₹1,000 निवेश करें।",
    "A sample wire said “this is a strong buy with a target price of 1,200 and a stop-loss at 640”, which is a claim, not a fact.",
  ])("%s", (s) => expect(stream(s).seen).toBe(s));

  it("a fixed deposit's guaranteed return is noted, not removed", () => {
    const s = "Fixed deposits give guaranteed returns with capital protection.";
    expect(stream(s).seen).toBe(s);
    expect(findDirectives(s)).toEqual([expect.objectContaining({ pattern: "guaranteed", blocks: false })]);
  });
});
