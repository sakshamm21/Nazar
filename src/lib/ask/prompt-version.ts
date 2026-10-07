import "server-only";
import { asSchema } from "ai";
import { createHash } from "node:crypto";
import { systemPrompt } from "./prompt";
import { GUARD_PROMPT } from "./scope-guard";
import { makeTools } from "./tools";

let cached: string | null = null;

/**
 * A short fingerprint of everything the model is told that is not the conversation: both system
 * prompts, the scope guard's prompt, and every tool's name, description and input schema.
 * Stamped on each answer, its events, its rating and its trace, so a change in quality, cost or
 * speed can be tied to the wording that caused it. It changes whenever any of that text changes,
 * and only then: the date is held fixed.
 */
export function promptVersion(): string {
  if (cached) return cached;
  const tools = Object.entries(makeTools("prompt-version"))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, t]) => ({ name, description: (t as { description?: string }).description ?? "", input: asSchema((t as { inputSchema: Parameters<typeof asSchema>[0] }).inputSchema).jsonSchema }));
  const text = JSON.stringify({ simple: systemPrompt("simple", "DATE"), pro: systemPrompt("pro", "DATE"), guard: GUARD_PROMPT, tools });
  cached = createHash("sha256").update(text).digest("hex").slice(0, 8);
  return cached;
}
