import "server-only";
import { getDb, schema } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * The structured record of one Ask answer: what ran, in what order, how long it took and what it
 * cost. It holds no words anyone typed and nothing the model wrote: those stay in the conversation
 * itself, which the trace points at by chat and message id.
 */
export type TraceTool = {
  name: string;
  /** How long the tool ran. Null when it never reported back (the answer was stopped mid-call). */
  ms: number | null;
  ok: boolean;
  /** Size of the full result, and of what the model was shown of it. */
  outChars: number;
  viewChars: number;
};

export type TraceStep = {
  n: number;
  ms: number;
  finishReason: string;
  inputTokens: number;
  outputTokens: number;
  tools: TraceTool[];
};

export type TraceGuard = { verdict: string; ms: number; skipped: string | null };

/** finished: ran to the end. stopped: the reader stopped it. blocked: the scope guard refused it. error: the provider failed. */
export type TraceOutcome = "finished" | "stopped" | "blocked" | "error";

export type Trace = typeof schema.askTraces.$inferInsert;

/** Never throws: a trace that cannot be written must not cost the reader their answer. */
export async function writeTrace(trace: Trace) {
  try {
    const db = await getDb();
    await db.insert(schema.askTraces).values(trace).onConflictDoNothing();
  } catch (e) {
    logger.warn({ err: String((e as Error)?.message ?? e).slice(0, 200) }, "ask trace not written");
  }
}
