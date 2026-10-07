import "server-only";
import { convertToModelMessages, createIdGenerator, createUIMessageStream, createUIMessageStreamResponse, stepCountIs, streamText, type UIMessage } from "ai";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { marketOf, track } from "@/lib/events";
import { today as istToday } from "@/lib/goals/draft";
import { LIMITS, checkAndRecord } from "@/lib/limits";
import { compactHistory, detectLang, modelViewOf } from "./context";
import { AUTO_MODEL, estimateCost, getModel, routeModel } from "./models";
import { allowedModelIds } from "./openai-models";
import { systemPrompt, type AskMode } from "./prompt";
import { promptVersion } from "./prompt-version";
import { askConfigured, languageModel } from "./provider";
import { classify, GUARD_MODEL, refusalText } from "./scope-guard";
import { makeTools } from "./tools";
import { writeTrace, type Trace, type TraceGuard, type TraceOutcome, type TraceStep } from "./trace";

/** The most model calls one answer may take. The last one is not offered tools, so it has to answer. */
export const MAX_STEPS = 10;

export type AskMeta = { model?: string; inputTokens?: number; outputTokens?: number; costUsd?: number; guarded?: boolean; latencyMs?: number; mode?: string; promptVersion?: string };
type Msg = UIMessage<AskMeta>;

export type AskInput = {
  user: { id: string; isDemo: boolean; isTestAccount: boolean };
  chatId: string;
  /** The client's id for the new message, if it sent one. */
  messageId?: string;
  /** The question, as plain text. Nothing else from the client reaches the model. */
  text: string;
  mode: AskMode;
  /** A model the user picked; anything else (or nothing) lets Nazar choose. */
  requestedModel?: string;
  /** The hashed network address, for the per-network limits. */
  ip: string;
  /** Aborts when the reader stops the answer or goes away. */
  signal?: AbortSignal;
};

const textOf = (m: Msg | undefined) => (m?.parts ?? []).map((p) => (p.type === "text" ? p.text : "")).join(" ").trim();
const fail = (status: number, error: string) => Response.json({ error }, { status });

function friendlyError(msg: string, modelId: string) {
  if (/model/i.test(msg) && /(not found|does not exist|access)/i.test(msg)) return `Model "${modelId}" isn't available for this OpenAI key. Pick another model.`;
  if (/quota|billing|insufficient/i.test(msg)) return "The OpenAI account behind this app is out of credit. Please try again later.";
  if (/rate limit|429/i.test(msg)) return "The AI provider is busy right now. Please retry in a few seconds.";
  if (/context|too long|maximum.*tokens/i.test(msg)) return "This conversation has grown too long. Start a new research chat.";
  return "Something went wrong while generating the answer. Please try again.";
}

/**
 * One Ask question, from the limits to the saved answer. The chat route is a thin wrapper around
 * this, and tests and evals call it directly, so what they exercise is what production runs.
 *
 * In order: the conversation is loaded from the database (never from the client), the limits and
 * budgets are checked, the scope guard decides whether the question is on topic, and the agent
 * answers with tools scoped to this user. Whatever happens, the answer leaves a usage row, an
 * event and a trace.
 */
export async function runAsk(input: AskInput): Promise<Response> {
  const { user, chatId: id, mode, requestedModel: requested } = input;
  const userId = user.id;
  if (!askConfigured()) return fail(500, "OPENAI_API_KEY is not set. Add it to .env.local (local) or your Vercel project env vars.");

  const startedAt = Date.now();
  const text = input.text.trim();
  if (!text) return fail(400, "Empty message");
  if (text.length > LIMITS.maxInputChars) return fail(400, `Please keep questions under ${LIMITS.maxInputChars} characters (yours is ${text.length}).`);
  const userMessage: Msg = { id: input.messageId || randomUUID(), role: "user", parts: [{ type: "text", text }] };

  const db = await getDb();
  const [existing] = await db.select({ userId: schema.chats.userId, messages: schema.chats.messages }).from(schema.chats).where(eq(schema.chats.id, id)).limit(1);
  if (existing && existing.userId !== userId) return fail(403, "Forbidden");

  // History comes from the database, never from the client, so it can't be tampered with.
  const history = (Array.isArray(existing?.messages) ? existing.messages : []) as Msg[];
  const messages: Msg[] = [...history, userMessage];
  const turn = history.filter((m) => m.role === "user").length + 1;

  const limit = await checkAndRecord(userId, input.ip, user.isDemo || user.isTestAccount);
  if (!limit.ok) {
    track(userId, "rate_limited", { status: limit.status, reason: limit.error.slice(0, 60) }, id);
    return fail(limit.status, limit.error);
  }

  const save = async (all: Msg[]) => {
    try {
      const title = textOf(all.find((m) => m.role === "user")).slice(0, 80) || "New research";
      await db
        .insert(schema.chats)
        .values({ id, userId, title, messages: all, updatedAt: new Date() })
        .onConflictDoUpdate({ target: schema.chats.id, set: { messages: all, updatedAt: new Date() } });
    } catch (e) {
      console.error("chat save failed", e);
    }
  };
  const logUsage = async (model: string, inputTokens: number, outputTokens: number) => {
    try {
      await db.insert(schema.usage).values({ id: randomUUID(), userId, chatId: id, model, inputTokens, outputTokens, costUsd: estimateCost(model, inputTokens, outputTokens) });
    } catch (e) {
      console.error("usage log failed", e);
    }
  };

  // The answer's id is fixed up front, so its trace can name the message it describes.
  const answerId = createIdGenerator({ prefix: "msg", size: 16 })();
  const version = promptVersion();
  const lang = detectLang(text);
  const available = await allowedModelIds();

  // ── Scope guard ─────────────────────────────────────────────
  const prevUser = [...history].reverse().find((m) => m.role === "user");
  const prevAssistant = [...history].reverse().find((m) => m.role === "assistant");
  const guardStart = Date.now();
  const guard = await classify(text, { previousUser: textOf(prevUser), previousAssistant: textOf(prevAssistant) }, available);
  const guardMs = Date.now() - guardStart;
  if (guard.usage) void logUsage(GUARD_MODEL, guard.usage.inputTokens, guard.usage.outputTokens);
  // A guard that is off on purpose is not news. One that is off by accident must be visible.
  if (guard.skipped && guard.skipped !== "disabled") track(userId, "guard_skipped", { reason: guard.skipped, guardMs }, id);
  const guardTrace: TraceGuard = { verdict: guard.verdict, ms: guardMs, skipped: guard.skipped ?? null };
  const traceBase = { id: randomUUID(), userId, chatId: id, messageId: answerId, promptVersion: version, mode, lang, turn, guard: guardTrace } satisfies Partial<Trace>;

  if (guard.verdict !== "in_scope") {
    // Only the classifier's short topic label is stored, never the raw question.
    track(userId, "guard_block", { verdict: guard.verdict, topic: guard.topic.slice(0, 60), guardMs, mode, turn, promptVersion: version }, id);
    void writeTrace({ ...traceBase, model: null, outcome: "blocked", latencyMs: Date.now() - startedAt });
    const stream = createUIMessageStream<Msg>({
      originalMessages: messages,
      generateId: () => answerId,
      execute: ({ writer }) => {
        const tid = randomUUID();
        writer.write({ type: "start", messageMetadata: { guarded: true, promptVersion: version } });
        writer.write({ type: "text-start", id: tid });
        writer.write({ type: "text-delta", id: tid, delta: refusalText(guard) });
        writer.write({ type: "text-end", id: tid });
        writer.write({ type: "finish", messageMetadata: { guarded: true, promptVersion: version } });
      },
      onFinish: ({ messages: all }) => save(all),
    });
    return createUIMessageStreamResponse({ stream });
  }

  // ── Main agent ──────────────────────────────────────────────
  const auto = !requested || requested === AUTO_MODEL || !getModel(requested) || !available.includes(requested);
  const modelId = auto ? routeModel(text, available) : requested;
  let firstTokenAt: number | null = null;
  let firstOutputAt: number | null = null;
  /** Text streamed in the step still under way, which no usage figure covers yet. */
  let unbilledChars = 0;

  // Each tool call is timed where it runs; the step it belonged to picks the time up when it ends.
  const toolMs = new Map<string, number>();
  const plainTools = makeTools(userId);
  const tools = Object.fromEntries(
    Object.entries(plainTools).map(([name, t]) => {
      const run = (t as unknown as { execute: (i: unknown, o: { toolCallId: string }) => Promise<unknown> }).execute;
      const execute = async (i: unknown, o: { toolCallId: string }) => {
        const t0 = Date.now();
        try {
          return await run(i, o);
        } finally {
          toolMs.set(o.toolCallId, Date.now() - t0);
        }
      };
      return [name, { ...t, execute }];
    }),
  ) as unknown as typeof plainTools;

  const steps: TraceStep[] = [];
  let stepStartedAt = Date.now();
  const isError = (out: unknown) => Boolean(out && typeof out === "object" && "error" in out);

  /** Writes the trace once. The first of finish, stop and error to arrive decides the outcome. */
  let traced = false;
  const trace = (outcome: TraceOutcome, totals: { inputTokens: number; outputTokens: number; cachedInputTokens?: number; reasoningTokens?: number }, error?: string) => {
    if (traced) return;
    traced = true;
    void writeTrace({
      ...traceBase,
      model: modelId,
      auto,
      outcome,
      steps,
      inputTokens: totals.inputTokens,
      cachedInputTokens: totals.cachedInputTokens ?? 0,
      outputTokens: totals.outputTokens,
      reasoningTokens: totals.reasoningTokens ?? 0,
      costUsd: estimateCost(modelId, totals.inputTokens, totals.outputTokens),
      ttftMs: firstTokenAt ? firstTokenAt - startedAt : null,
      latencyMs: Date.now() - startedAt,
      error: error?.slice(0, 200) ?? null,
    });
  };

  const result = streamText({
    model: languageModel(modelId),
    // The reader's calendar date: the UTC date is still yesterday in India until 05:30.
    system: systemPrompt(mode, istToday()),
    // Unfinished tool calls are dropped by convertToModelMessages.
    messages: convertToModelMessages(compactHistory(messages, tools), { ignoreIncompleteToolCalls: true, tools }),
    tools,
    stopWhen: stepCountIs(MAX_STEPS),
    // Without this, a run that is still looking things up at the cap ends with no answer at all.
    prepareStep: ({ stepNumber }) => (stepNumber >= MAX_STEPS - 1 ? { toolChoice: "none" } : undefined),
    maxOutputTokens: 8000,
    abortSignal: input.signal,
    onChunk: ({ chunk }) => {
      if (firstOutputAt === null && (chunk.type === "text-delta" || chunk.type === "tool-input-start" || chunk.type === "tool-call")) firstOutputAt = Date.now();
      if (firstTokenAt === null && chunk.type === "text-delta") firstTokenAt = Date.now();
      if (chunk.type === "text-delta") unbilledChars += chunk.text.length;
    },
    onStepFinish: (step) => {
      unbilledChars = 0;
      const now = Date.now();
      steps.push({
        n: steps.length + 1,
        ms: now - stepStartedAt,
        finishReason: step.finishReason,
        inputTokens: step.usage.inputTokens ?? 0,
        outputTokens: step.usage.outputTokens ?? 0,
        tools: step.toolCalls.map((c) => {
          const r = step.toolResults.find((x) => x.toolCallId === c.toolCallId);
          return { name: c.toolName, ms: toolMs.get(c.toolCallId) ?? null, ok: Boolean(r) && !isError(r?.output), outChars: JSON.stringify(r?.output ?? null).length, viewChars: modelViewOf(plainTools[c.toolName as keyof typeof plainTools], r?.output).length };
        }),
      });
      stepStartedAt = now;
    },
    // Stop (or a closed tab) skips onFinish. The tokens were still spent, so they still count
    // toward the budgets, and the answer still shows up in Insights.
    onAbort: ({ steps: done }) => {
      const inputTokens = done.reduce((a, s) => a + (s.usage.inputTokens ?? 0), 0);
      // The provider reports nothing for the step that was cut off: estimate its text at 4 characters a token.
      const outputTokens = done.reduce((a, s) => a + (s.usage.outputTokens ?? 0), 0) + Math.ceil(unbilledChars / 4);
      void logUsage(modelId, inputTokens, outputTokens);
      track(
        userId,
        "answer_stopped",
        { model: modelId, auto, mode, turn, lang, promptVersion: version, tools: done.flatMap((s) => s.toolCalls).map((c) => c.toolName), steps: done.length, inputTokens, outputTokens, costUsd: estimateCost(modelId, inputTokens, outputTokens), guardMs, latencyMs: Date.now() - startedAt },
        id,
      );
      trace("stopped", { inputTokens, outputTokens });
    },
    onFinish: ({ totalUsage, steps: done, finishReason }) => {
      const inputTokens = totalUsage.inputTokens ?? 0;
      const outputTokens = totalUsage.outputTokens ?? 0;
      void logUsage(modelId, inputTokens, outputTokens);
      const calls = done.flatMap((s) => s.toolCalls);
      const results = done.flatMap((s) => s.toolResults);
      const tickers = [
        ...new Set(
          calls.flatMap((c: any) => {
            const inp = c.input ?? {};
            return [inp.symbol, ...(Array.isArray(inp.symbols) ? inp.symbols : [])].filter((x): x is string => typeof x === "string").map((x) => x.toUpperCase());
          }),
        ),
      ].slice(0, 10);
      const markets = [...new Set(tickers.map(marketOf))];
      track(
        userId,
        "question",
        {
          model: modelId,
          auto,
          mode,
          turn,
          chars: text.length,
          lang,
          promptVersion: version,
          finishReason,
          tools: calls.map((c) => c.toolName),
          toolErrors: results.filter((r) => isError(r.output)).length,
          steps: done.length,
          tickers,
          market: markets.length === 1 ? markets[0] : markets.length ? "MIXED" : "NONE",
          inputTokens,
          cachedInputTokens: totalUsage.cachedInputTokens ?? 0,
          outputTokens,
          reasoningTokens: totalUsage.reasoningTokens ?? 0,
          costUsd: estimateCost(modelId, inputTokens, outputTokens),
          guardMs,
          ttftMs: firstTokenAt ? firstTokenAt - startedAt : null,
          firstOutputMs: firstOutputAt ? firstOutputAt - startedAt : null,
          latencyMs: Date.now() - startedAt,
        },
        id,
      );
      trace("finished", { inputTokens, outputTokens, cachedInputTokens: totalUsage.cachedInputTokens, reasoningTokens: totalUsage.reasoningTokens });
    },
    onError: ({ error }) => {
      const message = String(error instanceof Error ? error.message : error);
      console.error("[chat] stream error:", error);
      track(userId, "answer_error", { model: modelId, promptVersion: version, message: message.slice(0, 120) }, id);
      trace("error", { inputTokens: steps.reduce((a, s) => a + s.inputTokens, 0), outputTokens: steps.reduce((a, s) => a + s.outputTokens, 0) }, message);
    },
  });

  return result.toUIMessageStreamResponse<Msg>({
    originalMessages: messages,
    generateMessageId: () => answerId,
    messageMetadata: ({ part }) => {
      if (part.type === "start") return { model: modelId, mode, promptVersion: version };
      if (part.type === "finish") {
        const i = part.totalUsage.inputTokens ?? 0;
        const o = part.totalUsage.outputTokens ?? 0;
        return { model: modelId, mode, promptVersion: version, inputTokens: i, outputTokens: o, costUsd: estimateCost(modelId, i, o), latencyMs: Date.now() - startedAt };
      }
    },
    onError: (error) => {
      console.error("[chat] ui stream error:", error);
      return friendlyError(error instanceof Error ? error.message : String(error), modelId);
    },
    onFinish: ({ messages: all }) => save(all),
  });
}
