/**
 * The loop from live answers back to the evals: the checks recorded on each answer, the numbers the
 * insights page builds from them, and the candidates harvested from answers that went wrong.
 * Real SQL on an in-memory database, with answers produced through the real chat route.
 */
import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { MockLanguageModelV4 } from "ai/test";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Chat from "@/app/api/chat/route";
import { promptVersion } from "@/lib/ask/prompt-version";
import { setModelsForTests } from "@/lib/ask/provider";
import { GUARD_MODEL } from "@/lib/ask/scope-guard";
import { schema, type DB } from "@/lib/db";
import { getInsights } from "@/lib/insights";
import { harvestCandidates } from "../../evals/harvest";
import { makeUser, memoryDb, request, type TestUser } from "./harness";

let db: DB;
let tester: TestUser, admin: TestUser, stranger: TestUser;
let next: LanguageModelV4StreamPart[] = [];
const tokens = (input: number, output: number) => ({ inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: output, text: output, reasoning: 0 } });
const usage = tokens(1000, 50);
const say = (text: string): LanguageModelV4StreamPart[] => [{ type: "stream-start", warnings: [] }, { type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: text }, { type: "text-end", id: "t" }, { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage }];
const callTool = (toolName: string, input: unknown): LanguageModelV4StreamPart[] => [{ type: "stream-start", warnings: [] }, { type: "tool-call", toolCallId: "call_1", toolName, input: JSON.stringify(input) }, { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage }];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const guard = new MockLanguageModelV4({ doGenerate: async () => ({ content: [{ type: "text", text: JSON.stringify({ verdict: "in_scope", topic: "stocks" }) }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] }) });
let turns: LanguageModelV4StreamPart[][] = [];
const model = new MockLanguageModelV4({ doStream: async () => ({ stream: new ReadableStream({ start: (c) => { for (const p of turns.shift() ?? next) c.enqueue(p); c.close(); } }) }) });

let n = 0;
/** Asks, waits for the trace, and returns it with the saved answer's id. */
async function ask(user: TestUser, text: string, script: LanguageModelV4StreamPart[][]) {
  const id = `quality-${String(++n).padStart(4, "0")}`;
  turns = [...script];
  const res = await Chat.POST(await request("/api/chat", { user, method: "POST", body: { id, mode: "simple", message: { id: `u-${id}`, role: "user", parts: [{ type: "text", text }] } } }));
  await res.text();
  for (let i = 0; i < 80; i++) {
    const [trace] = await db.select().from(schema.askTraces).where(eq(schema.askTraces.chatId, id));
    const [chat] = await db.select().from(schema.chats).where(eq(schema.chats.id, id));
    if (trace && (chat?.messages as unknown[] | undefined)?.length === 2) return { id, trace, messageId: (chat!.messages as { id: string }[])[1].id };
    await sleep(40);
  }
  throw new Error("answer was not traced");
}

beforeAll(async () => {
  db = await memoryDb();
  setModelsForTests((id) => (id === GUARD_MODEL ? guard : model));
  next = say("ok");
  tester = await makeUser(db, { isTestAccount: true });
  admin = await makeUser(db, { email: "owner@test.nazar.dev" });
  stranger = await makeUser(db);
}, 120_000);
afterAll(() => setModelsForTests(null));

describe("what is recorded about each answer", () => {
  it("a grounded answer in the right language has nothing flagged", async () => {
    const { trace } = await ask(tester, "Run a DCF on Infosys", [callTool("runDcfValuation", { symbol: "INFY.NS", growthRate: 0.08, terminalGrowth: 0.05, discountRate: 0.05, years: 5 }), say("The model could not be run: the discount rate of 5% has to sit at least 0.5 points above terminal growth, and here both are 5%. That is a property of the formula, so the inputs need changing before it says anything.")]);
    expect(trace.flags).toMatchObject({ numbers: { untraced: 0 }, lang: { asked: "en", answered: "en", match: true }, advicePatterns: [] });
    expect(trace.flags.words).toBeGreaterThan(20);
  });

  it("a number that came from nowhere is counted, not quoted", async () => {
    const { trace } = await ask(tester, "What is TCS trading at?", [say("TCS is trading at ₹4,321.50 with a P/E of 27.3, which is in line with what large Indian IT companies have traded at over the last few years.")]);
    expect(trace.flags.numbers).toEqual({ total: 2, untraced: 2 });
    expect(JSON.stringify(trace.flags)).not.toContain("4,321");
  });

  it("an answer in the wrong script is flagged", async () => {
    const { trace } = await ask(tester, "TCS abhi sasta hai kya? Simple mein batao", [say("TCS का मूल्यांकन पहले के मुकाबले कम दिख रहा है, लेकिन सस्ता कहना अकेले इस आँकड़े से तय नहीं होता। यह आपके समय और जोखिम पर निर्भर है।")]);
    expect(trace.flags.lang).toEqual({ asked: "hinglish", answered: "hi", match: false });
  });

  it("a very short answer says nothing about language", async () => {
    const { trace } = await ask(tester, "Mera portfolio kaisa hai aaj?", [say("Thanks!")]);
    expect(trace.flags.lang?.match).toBe(true);
  });
});

describe("the Ask quality numbers on the insights page", () => {
  it("count what the traces say", async () => {
    await ask(stranger, "Should I sell Infosys?", [say("Infosys fell 3% this month. You should sell it before the results. The Nifty was flat over the same stretch of time.")]);
    const q = (await getInsights()).quality;
    expect(q).toMatchObject({ traces: 5, finished: 5, stopped: 0, blocked: 0, errors: 0, adviceAnswers: 1, langMismatch: 1, guardSkipped: 0 });
    expect(q.untracedAnswers).toBeGreaterThanOrEqual(1);
    expect(q.untracedShare).toBeGreaterThan(0);
    expect(q.avgSteps).toBeGreaterThan(1);
    // Every one of the five was read ahead: the portfolio for "mera portfolio", the ticker for the four that name a company.
    expect(q.readAheadShare).toBeCloseTo(1);
    expect(q.tools.find((t) => t.name === "runDcfValuation")).toMatchObject({ calls: 1, failed: 1 });
    expect(q.tools.find((t) => t.name === "getMyPortfolio")).toMatchObject({ calls: 1, failed: 0 });
    expect(q.versions).toEqual([expect.objectContaining({ version: promptVersion(), answers: 5, rated: 0, helpful: null })]);
  });

  it("show how each prompt version was rated", async () => {
    const { id, messageId } = await ask(tester, "What is an ETF?", [say("An ETF is a fund that trades on the exchange like a share and usually follows an index.")]);
    await db.insert(schema.feedback).values({ userId: tester.id, messageId, chatId: id, rating: "up", promptVersion: promptVersion() });
    const [v] = (await getInsights()).quality.versions;
    expect(v).toMatchObject({ answers: 6, rated: 1, helpful: 1 });
  });
});

describe("harvesting candidate eval cases", () => {
  const since = new Date(Date.now() - 86_400_000);

  it("takes flagged and thumbs-down answers from test accounts and admins, as the conversation up to that question", async () => {
    const { id, messageId } = await ask(admin, "Compare HDFC Bank and ICICI Bank", [say("Both are large private banks with similar margins.")]);
    await db.insert(schema.feedback).values({ userId: admin.id, messageId, chatId: id, rating: "down", reason: "missed_question", model: "m", promptVersion: promptVersion() });

    const found = await harvestCandidates(db, { since, adminEmails: ["owner@test.nazar.dev"] });
    const questions = found.map((c) => c.turns.at(-1));
    expect(questions).toContain("Compare HDFC Bank and ICICI Bank");
    expect(questions).toContain("What is TCS trading at?");
    expect(questions).toContain("TCS abhi sasta hai kya? Simple mein batao");
    expect(found.find((c) => c.turns.at(-1) === "Compare HDFC Bank and ICICI Bank")).toMatchObject({ why: ["marked not helpful (missed_question)"], category: "harvested", lang: "en", promptVersion: promptVersion() });
    expect(found.find((c) => c.turns.at(-1) === "TCS abhi sasta hai kya? Simple mein batao")!.why).toEqual(["asked in hinglish, answered in hi"]);
    expect(found.find((c) => c.turns.at(-1) === "Run a DCF on Infosys")!.why).toEqual(["tool failed: runDcfValuation"]);
    // Clean answers are not candidates.
    expect(questions).not.toContain("What is an ETF?");
  });

  it("never reads an ordinary user's conversations, however badly the answer went", async () => {
    const found = await harvestCandidates(db, { since, adminEmails: ["owner@test.nazar.dev"] });
    expect(found.map((c) => c.turns.at(-1))).not.toContain("Should I sell Infosys?");
    expect(await harvestCandidates(db, { since: new Date(Date.now() + 1000) })).toEqual([]);
  });
});
