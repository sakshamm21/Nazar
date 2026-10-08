/**
 * What the model is shown of an older turn. The rule that broke: a conversation whose first answer
 * drew a chart failed on its fourth question, because the chart's result was cut down to a shape
 * the tool's own compact view could not read. Checked here for every tool, through the same SDK
 * call the chat route makes.
 */
import { convertToModelMessages, type UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { compactHistory } from "@/lib/ask/context";
import { TOOLS, type ToolName } from "@/lib/ask/registry";
import { makeTools } from "@/lib/ask/tools";
import { TOOL_RESULTS } from "../fixtures/ask-tool-results";

const tools = makeTools("test-user");
const names = Object.keys(TOOLS) as ToolName[];

const user = (id: string, text: string): UIMessage => ({ id, role: "user", parts: [{ type: "text", text }] });
const answer = (id: string, parts: unknown[]): UIMessage => ({ id, role: "assistant", parts: parts as UIMessage["parts"] });
const toolPart = (name: ToolName) => ({ type: `tool-${name}`, toolCallId: "call_1", state: "output-available", ...TOOL_RESULTS[name] });

/** `turns` questions; the first answer used `name`, the rest are plain text. Ends on an unanswered question. */
const conversation = (name: ToolName, turns: number): UIMessage[] => {
  const out: UIMessage[] = [];
  for (let t = 1; t <= turns; t++) {
    out.push(user(`u${t}`, `question ${t}`));
    if (t < turns) out.push(answer(`a${t}`, t === 1 ? [{ type: "step-start" }, toolPart(name), { type: "step-start" }, { type: "text", text: "What stands out." }] : [{ type: "text", text: `answer ${t}` }]));
  }
  return out;
};

/** The tool result as it reaches the model, as JSON text. */
const seenByModel = async (messages: UIMessage[]) => {
  const model = await convertToModelMessages(compactHistory(messages, tools), { ignoreIncompleteToolCalls: true, tools });
  const result = model.flatMap((m) => (Array.isArray(m.content) ? (m.content as { type: string }[]) : [])).find((c) => c.type === "tool-result");
  return JSON.stringify((result as { output?: { value?: unknown } } | undefined)?.output?.value ?? null);
};

describe("an older tool result", () => {
  it("every sample is big enough to be worth cutting", () => {
    for (const name of names) expect(JSON.stringify(TOOL_RESULTS[name].output).length, name).toBeGreaterThan(2500);
  });

  it.each(names)("%s: the fourth question still goes through, and the model sees something small and real", async (name) => {
    const seen = await seenByModel(conversation(name, 4));
    expect(seen.length).toBeLessThan(2600);
    // Not "{}" or null: the model must be left with either the tool's summary or a note that it was cut.
    expect(seen.length).toBeGreaterThan(40);
  });

  it.each(names)("%s: a long conversation goes through too", async (name) => {
    await expect(seenByModel(conversation(name, 12))).resolves.toBeTypeOf("string");
  });

  it("is left whole while it is recent", () => {
    // Third question: the first answer is still within the last few messages.
    const kept = compactHistory(conversation("getFinancialStatements", 3), tools)[1].parts.find((p) => p.type === "tool-getFinancialStatements") as { output: unknown };
    expect(kept.output).toEqual(TOOL_RESULTS.getFinancialStatements.output);
  });

  it("a tool with a compact view keeps that view, not a slice of raw chart points", async () => {
    const seen = JSON.parse(await seenByModel(conversation("getPriceHistory", 4)));
    expect(seen.stats.maxDrawdown).toBe(-0.31);
    expect(seen.truncated).toBeUndefined();
  });

  it("a tool without one is cut down, and says so", async () => {
    const seen = JSON.parse(await seenByModel(conversation("getFinancialStatements", 4)));
    expect(seen.truncated).toBe(true);
    expect(seen.note).toMatch(/call the tool again/);
  });

  it("the stored conversation is not changed", () => {
    const messages = conversation("getFinancialStatements", 4);
    const before = JSON.stringify(messages);
    compactHistory(messages, tools);
    expect(JSON.stringify(messages)).toBe(before);
  });

  it("only the last 30 messages are sent", () => {
    expect(compactHistory(conversation("getQuote", 40), tools)).toHaveLength(30);
  });
});
