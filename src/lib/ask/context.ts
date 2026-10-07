import type { UIMessage } from "ai";

/** A tool as far as history compaction cares: it may have its own compact view for the model. */
type ToolLike = { toModelOutput?: (output: any) => unknown };

const RECENT_MESSAGES = 30;
/** Tool results in the last few messages are kept whole: the model is probably still using them. */
const KEEP_WHOLE = 4;
const MAX_CHARS = 2500;
const EXCERPT_CHARS = 1500;

/** What an old, bulky tool result is replaced with. tool-utils' forModel passes this through untouched. */
export type TruncatedOutput = { truncated: true; note: string; excerpt: string };

/**
 * What the model sees of a conversation: recent history only, with bulky tool results from older
 * turns cut down (the UI keeps the full data).
 *
 * Size is judged on what the model would actually be shown. A tool with its own compact view
 * (`toModelOutput`) is measured after that view is applied, so a chart with hundreds of points and
 * a small summary is left alone; cutting its raw result would hand the view a shape it cannot read.
 */
export function compactHistory<M extends UIMessage>(messages: M[], tools: Record<string, ToolLike>): M[] {
  const recent = messages.slice(-RECENT_MESSAGES);
  return recent.map((m, i) => {
    if (i >= recent.length - KEEP_WHOLE) return m;
    const parts = m.parts.map((p: any) => {
      if (typeof p.type !== "string" || !p.type.startsWith("tool-") || p.state !== "output-available") return p;
      const seen = modelView(tools[p.type.slice(5)], p.output);
      if (seen.length <= MAX_CHARS) return p;
      const output: TruncatedOutput = { truncated: true, note: "Older tool output truncated to save context; call the tool again if exact figures are needed.", excerpt: seen.slice(0, EXCERPT_CHARS) };
      return { ...p, output };
    });
    return { ...m, parts };
  });
}

/** The tool result as the model would read it, as JSON text. */
function modelView(tool: ToolLike | undefined, output: unknown): string {
  let seen: unknown = output;
  if (tool?.toModelOutput) {
    try {
      const v = tool.toModelOutput(output) as { value?: unknown } | undefined;
      seen = v && typeof v === "object" && "value" in v ? v.value : v;
    } catch {
      // A stored result the view can no longer read (the tool changed shape since): judge the raw result.
    }
  }
  return JSON.stringify(seen ?? null);
}
