import "server-only";
import { asSchema } from "ai";
import { createHash } from "node:crypto";
import { promptCandidate, systemPrompt, type PromptVariant } from "./prompt";
import { GUARD_PROMPT } from "./scope-guard";
import { makeTools } from "./tools";

const cached = new Map<string, string>();

/**
 * A short fingerprint of everything the model is told that is not the conversation: both system
 * prompts, the scope guard's prompt, and every tool's name, description and input schema.
 * Stamped on each answer, its events, its rating and its trace, so a change in quality, cost or
 * speed can be tied to the wording that caused it. It changes whenever any of that text changes,
 * and only then: the date is held fixed.
 */
export function promptVersion(variant: PromptVariant = "stable"): string {
  // Without a candidate on trial there is one prompt, and so one version, whatever is asked for.
  const on = variant === "candidate" && promptCandidate() ? "candidate" : "stable";
  const key = on === "candidate" ? `candidate:${promptCandidate()!.name}` : "stable";
  const hit = cached.get(key);
  if (hit) return hit;
  const tools = Object.entries(makeTools("prompt-version"))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, t]) => ({ name, description: (t as { description?: string }).description ?? "", input: asSchema((t as { inputSchema: Parameters<typeof asSchema>[0] }).inputSchema).jsonSchema }));
  const text = JSON.stringify({ simple: systemPrompt("simple", "DATE", on), pro: systemPrompt("pro", "DATE", on), guard: GUARD_PROMPT, tools });
  const version = createHash("sha256").update(text).digest("hex").slice(0, 8);
  cached.set(key, version);
  return version;
}
