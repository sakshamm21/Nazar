import type { UIMessage } from "ai";
import { isPrivateTool } from "./registry";

/** Stands in for an answer that is left out of a shared conversation. */
export const SHARED_PLACEHOLDER = "This answer drew on the owner's portfolio or Watching list, so it is not part of the shared copy.";

const usesPrivateTool = (m: UIMessage) => m.parts.some((p) => typeof p.type === "string" && p.type.startsWith("tool-") && isPrivateTool(p.type.slice(5)));

/**
 * What a public link may contain. Runs on the server, so private data never reaches the page:
 * hiding a card in the browser still ships its data to anyone who has the link.
 *
 * Once an answer has read the portfolio or the Watching list, that data is in the conversation the
 * model sees, and any later answer can repeat it in words without calling a tool again. So every
 * answer from that point on is replaced, not only the one that made the call.
 */
export function sharedView(messages: UIMessage[]): UIMessage[] {
  let seenPrivate = false;
  return messages.map((m) => {
    if (m.role !== "assistant") return m;
    seenPrivate ||= usesPrivateTool(m);
    return seenPrivate ? { id: m.id, role: m.role, parts: [{ type: "text", text: SHARED_PLACEHOLDER }] } : m;
  });
}
