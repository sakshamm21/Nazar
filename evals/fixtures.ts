/**
 * Recorded tool results. The first time a case asks Yahoo for something, the real result is saved
 * under evals/fixtures/<tool>/; every run after that replays it. An eval then measures the prompt
 * and the model, not whether Yahoo was having a good day, and costs nothing in market-data calls.
 *
 * Tools that read the user's own data are never recorded: they run against the eval world's database.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isPrivateTool } from "@/lib/ask/registry";

const DIR = path.join(process.cwd(), "evals", "fixtures");

/** The same input always gives the same key, whatever order the model wrote its fields in. */
const stable = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(stable).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(typeof v === "string" ? v.trim().toUpperCase() : v);

export const fixturePath = (tool: string, input: unknown) => path.join(DIR, tool, `${createHash("sha1").update(stable(input)).digest("hex").slice(0, 12)}.json`);

export type FixtureLog = { replayed: Set<string>; recorded: number; missed: string[] };

type AnyTools = Record<string, { execute?: (input: unknown, opts: { toolCallId: string }) => Promise<unknown> }>;

/**
 * Wraps the Ask tools so market-data calls are replayed from disk.
 * `frozen`: never call the real source; a result that was not recorded comes back as "not found".
 * `plant`: results to return for a tool whatever it is asked, for cases that test what the model
 * does with hostile text in a tool result.
 */
export function withFixtures<T extends object>(tools: T, opts: { frozen: boolean; plant?: Record<string, unknown>; log: FixtureLog }): T {
  const out: AnyTools = {};
  for (const [name, t] of Object.entries(tools as AnyTools)) {
    const real = t.execute;
    if (!real || (isPrivateTool(name) && !opts.plant?.[name])) {
      out[name] = t;
      continue;
    }
    out[name] = {
      ...t,
      execute: async (input, o) => {
        if (opts.plant && name in opts.plant) {
          opts.log.replayed.add(o.toolCallId);
          return opts.plant[name];
        }
        const file = fixturePath(name, input);
        if (existsSync(file)) {
          opts.log.replayed.add(o.toolCallId);
          return (JSON.parse(readFileSync(file, "utf8")) as { output: unknown }).output;
        }
        if (opts.frozen) {
          opts.log.missed.push(`${name}(${JSON.stringify(input)})`);
          return { error: "Symbol not found or no data available." };
        }
        const output = await real(input, o);
        // A rate limit is the source's mood, not its answer: recording it would freeze a bad day in place.
        const transient = Boolean(output && typeof output === "object" && "error" in output && /rate-limiting|temporarily unavailable/i.test(String((output as { error: unknown }).error)));
        if (!transient) {
          mkdirSync(path.dirname(file), { recursive: true });
          writeFileSync(file, `${JSON.stringify({ tool: name, input, output }, null, 1)}\n`);
          opts.log.recorded++;
        }
        return output;
      },
    };
  }
  return out as T;
}
