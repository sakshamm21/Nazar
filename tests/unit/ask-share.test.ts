/**
 * A public link must not carry the owner's portfolio or Watching list: not as a card, not in the
 * data sent to the page, and not in the words of an answer that was written from them.
 */
import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { TOOLS, isPrivateTool, type ToolName } from "@/lib/ask/registry";
import { SHARED_PLACEHOLDER, sharedView } from "@/lib/ask/share";
import { TOOL_RESULTS } from "../fixtures/ask-tool-results";

const user = (id: string, text: string): UIMessage => ({ id, role: "user", parts: [{ type: "text", text }] });
const answer = (id: string, text: string, tool?: ToolName): UIMessage => ({
  id,
  role: "assistant",
  metadata: { model: "test-model", costUsd: 0.01 },
  parts: [...(tool ? [{ type: `tool-${tool}`, toolCallId: `call_${id}`, state: "output-available", ...TOOL_RESULTS[tool] }] : []), { type: "text", text }] as UIMessage["parts"],
});

const chat: UIMessage[] = [
  user("u1", "What is Titan trading at?"),
  answer("a1", "Titan closed at ₹3,259.", "getPriceHistory"),
  user("u2", "Why is my portfolio down this month?"),
  answer("a2", "Your portfolio is worth ₹12,34,567 and Held company 3 fell the most.", "getMyPortfolio"),
  user("u3", "And which one is riskiest?"),
  answer("a3", "Held company 7 has the highest beta of what you own."),
];

describe("what a shared link contains", () => {
  const shared = sharedView(chat);
  const payload = JSON.stringify(shared);

  it("nothing from the portfolio reaches the page", () => {
    expect(payload).not.toContain("Held company");
    expect(payload).not.toContain("1234567");
    expect(payload).not.toContain("12,34,567");
    expect(payload).not.toContain("tool-getMyPortfolio");
  });

  it("an answer written from the portfolio is replaced, card and words", () => {
    expect(shared[3].parts).toEqual([{ type: "text", text: SHARED_PLACEHOLDER }]);
  });

  it("so is every answer after it, which could repeat the same facts without a tool call", () => {
    expect(shared[5].parts).toEqual([{ type: "text", text: SHARED_PLACEHOLDER }]);
  });

  it("answers before it are shared in full", () => {
    expect(shared[1]).toEqual(chat[1]);
  });

  it("the owner's questions are shown as typed", () => {
    expect(shared.filter((m) => m.role === "user")).toEqual(chat.filter((m) => m.role === "user"));
  });

  it("a conversation with no private data is unchanged", () => {
    expect(sharedView(chat.slice(0, 2))).toEqual(chat.slice(0, 2));
  });

  it.each((Object.keys(TOOLS) as ToolName[]).filter(isPrivateTool))("%s is treated as private", (tool) => {
    const out = JSON.stringify(sharedView([user("u", "q"), answer("a", "text", tool)]));
    expect(out).not.toContain(`tool-${tool}`);
    expect(out).toContain(SHARED_PLACEHOLDER);
  });
});
