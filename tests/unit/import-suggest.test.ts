/** A model's help with import rows nothing else matched: it proposes, the NSE list decides. */
import { MockLanguageModelV4 } from "ai/test";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { setModelsForTests } from "@/lib/ask/provider";
import { suggestMatches, verify } from "@/lib/importers/suggest";
import { buildIndex } from "@/lib/instruments/master";

const index = buildIndex([
  { symbol: "HINDUNILVR", name: "Hindustan Unilever Limited", isin: "INE030A01027" },
  { symbol: "M&MFIN", name: "Mahindra & Mahindra Financial Services Limited", isin: "INE774D01024" },
  { symbol: "BAJAJFINSV", name: "Bajaj Finserv Limited", isin: "INE918I01026" },
]);

let reply: unknown = { rows: [] };
let prompts: string[] = [];
const model = new MockLanguageModelV4({
  doGenerate: async (call) => {
    prompts.push(JSON.stringify(call.prompt));
    if (reply === "throw") throw new Error("This request requires more credits");
    return { content: [{ type: "text", text: JSON.stringify(reply) }], finishReason: { unified: "stop", raw: undefined }, usage: { inputTokens: { total: 200, noCache: 200, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 20, text: 20, reasoning: 0 } }, warnings: [] };
  },
});

beforeEach(() => {
  setModelsForTests(() => model);
  reply = { rows: [] };
  prompts = [];
  delete process.env.IMPORT_HELP;
});
afterAll(() => setModelsForTests(null));

describe("checking a proposed ticker against the NSE list", () => {
  it("keeps what is listed, under the list's own name, whatever suffix it came with", () => {
    expect(verify(index, ["hindunilvr.ns", "BAJAJFINSV-EQ"])).toEqual([
      { symbol: "HINDUNILVR.NS", name: "Hindustan Unilever Limited" },
      { symbol: "BAJAJFINSV.NS", name: "Bajaj Finserv Limited" },
    ]);
  });
  it("drops a ticker that does not exist, and a repeat", () => {
    expect(verify(index, ["HINDUNILEVER", "HINDUNILVR", "HINDUNILVR.NS", "DROP TABLE"])).toEqual([{ symbol: "HINDUNILVR.NS", name: "Hindustan Unilever Limited" }]);
  });
});

describe("suggestions for rows nothing else matched", () => {
  const rows = [
    { line: 2, rawName: "HIND UNILVR" },
    { line: 5, rawName: "M&M FIN SERV" },
    { line: 9, rawName: "Some Unlisted Pvt Co" },
  ];

  it("are the model's tickers that the list has; an invented one is not shown", async () => {
    reply = { rows: [{ line: 2, tickers: ["HINDUNILVR", "HINDUNILEVER"] }, { line: 5, tickers: ["M&MFIN"] }, { line: 9, tickers: ["SOMEUNLISTED"] }] };
    const r = await suggestMatches(index, rows);
    expect([...r.byLine.keys()]).toEqual([2, 5]);
    expect(r.byLine.get(2)).toEqual([{ symbol: "HINDUNILVR.NS", name: "Hindustan Unilever Limited" }]);
    expect(r.usage).toMatchObject({ inputTokens: 200, outputTokens: 20 });
  });

  it("only names are sent, and a line the model was not asked about is ignored", async () => {
    reply = { rows: [{ line: 77, tickers: ["BAJAJFINSV"] }] };
    const r = await suggestMatches(index, rows);
    expect(r.byLine.size).toBe(0);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("HIND UNILVR");
  });

  it("a failure leaves every row as it was", async () => {
    reply = "throw";
    expect(await suggestMatches(index, rows)).toEqual({ byLine: new Map(), usage: null });
  });

  it("no model is called when there is nothing to ask, or the help is switched off", async () => {
    await suggestMatches(index, []);
    process.env.IMPORT_HELP = "0";
    await suggestMatches(index, rows);
    expect(prompts).toHaveLength(0);
  });
});
