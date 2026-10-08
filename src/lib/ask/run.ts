import "server-only";
import { convertToModelMessages, createIdGenerator, createUIMessageStream, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream, type UIMessage } from "ai";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { marketOf, track } from "@/lib/events";
import { today as istToday } from "@/lib/goals/draft";
import { LIMITS, checkAndRecord } from "@/lib/limits";
import { answerLang, traceNumbers } from "./checks";
import { compactHistory, detectLang, modelViewOf } from "./context";
import { AUTO_MODEL, estimateCost, getModel, routeModel } from "./models";
import { SentenceFilter, findDirectives } from "./output-guard";
import { allowedModelIds } from "./openai-models";
import { planPrefetch } from "./prefetch";
import { systemPrompt, type AskMode } from "./prompt";
import { promptVersion } from "./prompt-version";
import { variantFor } from "./rollout";
import { askConfigured, languageModel } from "./provider";
import { classify, GUARD_MODEL, refusalText } from "./scope-guard";
import { makeTools } from "./tools";
import { WRITE_TOOLS, writesAsked } from "./writes";
import { writeTrace, type Trace, type TraceGuard, type TraceOutcome, type TraceStep } from "./trace";

/**
 * The script to answer in, said outright when the question's language is certain. Left to itself a
 * model sometimes answers a Hinglish question in Devanagari; the code already knows which it was.
 * English gets no note: a message with no Hindi words may still be one, and the prompt's own rule covers it.
 */
const LANGUAGE_NOTE = {
  en: "",
  hinglish: "\n\nTHIS MESSAGE is in Hinglish (Hindi written in Latin letters). Answer in Hinglish, in Latin letters. Do not use Devanagari script.",
  hi: "\n\nTHIS MESSAGE is in Hindi (Devanagari). Answer in Hindi, in Devanagari script.",
} as const;

/** The most model calls one answer may take. The last one is not offered tools, so it has to answer. */
export const MAX_STEPS = 8;

const envNumber = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
/**
 * Two more ways a run is told to stop looking things up and answer: it has taken too long (the
 * function is cut off at 60 seconds, and an answer cut off is no answer), or it has cost too much
 * for one question. Like the step cap, they withdraw the tools; they never cut the answer short.
 */
/**
 * 30 seconds, not more: a deep dive on the premium model was measured at 15 seconds to write its
 * answer and up to 8 for a round of lookups already under way, and all of it has to fit in 60.
 */
const maxSeconds = () => envNumber("ASK_MAX_SECONDS", 30);
const maxUsdPerAnswer = () => envNumber("ASK_MAX_USD_PER_ANSWER", 0.1);

export type AskMeta = { model?: string; inputTokens?: number; outputTokens?: number; costUsd?: number; guarded?: boolean; latencyMs?: number; mode?: string; promptVersion?: string; adviceRemoved?: number };

/**
 * What happens to a sentence in an answer that tells the reader what to do with their money.
 * "enforce" (the default) leaves it out as the answer streams. "shadow" lets it through and only
 * records it, for trying a change to the patterns safely. "off" does neither.
 */
const adviceGuard = (): "enforce" | "shadow" | "off" => {
  const v = process.env.ASK_ADVICE_GUARD;
  return v === "shadow" || v === "off" ? v : "enforce";
};
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
  /**
   * For evals only; the chat route never sets it. Lets a run replay recorded tool results, pin the
   * date those recordings were made on, try a model that is not in the catalog, and skip the
   * per-user limits that would otherwise stop a batch of questions after the first few.
   */
  harness?: {
    tools?: (tools: ReturnType<typeof makeTools>) => ReturnType<typeof makeTools>;
    today?: string;
    model?: string;
    skipLimits?: boolean;
    /** How hard a reasoning model thinks before it answers: an experiment in trading depth for speed. */
    reasoningEffort?: string;
    /** Which wording to answer with, whoever the user is: how a candidate prompt is evaluated before anyone gets it. */
    variant?: "stable" | "candidate";
    /** Turns off reading the portfolio ahead of the model, to measure what it saves. */
    noReadAhead?: boolean;
    /** Receives each sentence the advice filter leaves out, so an eval can check the filter was right. */
    onAdviceRemoved?: (sentence: string, pattern: string) => void;
  };
};

const textOf = (m: Msg | undefined) => (m?.parts ?? []).map((p) => (p.type === "text" ? p.text : "")).join(" ").trim();
const fail = (status: number, error: string) => Response.json({ error }, { status });

function friendlyError(msg: string, modelId: string) {
  if (/model/i.test(msg) && /(not found|does not exist|access)/i.test(msg)) return `Model "${modelId}" isn't available with the current API key. Pick another model.`;
  if (/quota|billing|insufficient|requires more credits|payment required/i.test(msg)) return "The AI account behind this app is out of credit. Please try again later.";
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
  if (!askConfigured()) return fail(500, "No AI key is set. Add OPENROUTER_API_KEY (or OPENAI_API_KEY) to .env.local (local) or your Vercel project env vars.");

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

  const limit = input.harness?.skipLimits ? ({ ok: true } as const) : await checkAndRecord(userId, input.ip, user.isDemo || user.isTestAccount);
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
  const logUsage = async (model: string, inputTokens: number, outputTokens: number, cachedInputTokens = 0) => {
    try {
      await db.insert(schema.usage).values({ id: randomUUID(), userId, chatId: id, model, inputTokens, outputTokens, costUsd: estimateCost(model, inputTokens, outputTokens, cachedInputTokens) });
    } catch (e) {
      console.error("usage log failed", e);
    }
  };

  // The answer's id is fixed up front, so its trace can name the message it describes.
  const answerId = createIdGenerator({ prefix: "msg", size: 16 })();
  // A wording on trial goes to a fixed tenth of users, under its own version; with none on trial this is always "stable".
  const variant = input.harness?.variant ?? variantFor(userId);
  const version = promptVersion(variant);
  const lang = detectLang(text);
  const available = await allowedModelIds();

  // Each tool call is timed where it runs; the step it belonged to picks the time up when it ends.
  const toolMs = new Map<string, number>();
  const plainTools = input.harness?.tools ? input.harness.tools(makeTools(userId)) : makeTools(userId);
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

  const isError = (out: unknown) => Boolean(out && typeof out === "object" && "error" in out);

  // ── Read ahead ──────────────────────────────────────────────
  // If the wording says the question is about the user's own portfolio, read it now, while the
  // scope guard is deciding, so the model does not spend a round trip asking for it.
  let plan = input.harness?.noReadAhead ? null : planPrefetch(text);
  if (plan) {
    const names = (await db.select({ name: schema.portfolios.name }).from(schema.portfolios).where(eq(schema.portfolios.userId, userId))).map((p) => p.name);
    plan = planPrefetch(text, names);
  }
  const readAheadId = `read_${randomUUID().slice(0, 12)}`;
  const readAheadStart = Date.now();
  const reading = plan
    ? (tools as unknown as Record<string, { execute: (i: unknown, o: { toolCallId: string; messages: [] }) => Promise<unknown> }>)[plan.tool]
        .execute(plan.input, { toolCallId: readAheadId, messages: [] })
        .then((output) => ({ output, ms: Date.now() - readAheadStart }))
        .catch(() => null)
    : null;

  // ── Scope guard ─────────────────────────────────────────────
  const prevUser = [...history].reverse().find((m) => m.role === "user");
  const prevAssistant = [...history].reverse().find((m) => m.role === "assistant");
  const guardStart = Date.now();
  const [guard, read] = await Promise.all([classify(text, { previousUser: textOf(prevUser), previousAssistant: textOf(prevAssistant) }, available), reading]);
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
      onEnd: ({ messages: all }) => save(all),
    });
    return createUIMessageStreamResponse({ stream });
  }

  // ── Main agent ──────────────────────────────────────────────
  const auto = !requested || requested === AUTO_MODEL || !getModel(requested) || !available.includes(requested);
  const modelId = input.harness?.model ?? (auto ? routeModel(text, available, process.env.ASK_AUTO_MODEL) : requested);
  let firstTokenAt: number | null = null;
  let firstOutputAt: number | null = null;
  /** Text streamed in the step still under way, which no usage figure covers yet. */
  let unbilledChars = 0;

  const effort = input.harness?.reasoningEffort ?? process.env.ASK_REASONING_EFFORT ?? getModel(modelId)?.reasoningEffort;
  const guardMode = adviceGuard();
  /** One filter per stretch of text the model writes (an answer can have several, around tool calls). */
  const filters = new Map<string, SentenceFilter>();
  /** The patterns that removed a sentence (enforce) or would have (shadow). Names only, never the words. */
  const advice: string[] = [];
  const steps: TraceStep[] = [];
  // What was read ahead reaches the model exactly as a tool result it had asked for would.
  const ahead = plan && read ? { tool: plan.tool, input: plan.input, output: read.output } : null;
  const modelMessages = await convertToModelMessages(compactHistory(messages, tools), { ignoreIncompleteToolCalls: true, tools });
  if (ahead) {
    const view = (plainTools as unknown as Record<string, { toModelOutput?: (o: { output: unknown }) => { type: "json"; value: any } }>)[ahead.tool].toModelOutput?.({ output: ahead.output }) ?? { type: "json" as const, value: ahead.output as any };
    modelMessages.push({ role: "assistant", content: [{ type: "tool-call", toolCallId: readAheadId, toolName: ahead.tool, input: ahead.input }] }, { role: "tool", content: [{ type: "tool-result", toolCallId: readAheadId, toolName: ahead.tool, output: view }] });
    steps.push({ n: 1, ms: read!.ms, finishReason: "read-ahead", inputTokens: 0, outputTokens: 0, tools: [{ name: ahead.tool, ms: read!.ms, ok: !isError(ahead.output), outChars: JSON.stringify(ahead.output ?? null).length, viewChars: JSON.stringify(view.value ?? null).length }] });
    firstOutputAt = Date.now();
  }
  // The tools that change something are offered only when this message asks for that change, so
  // nothing the model reads along the way (a headline, a company profile) can set one off.
  const mayWrite = writesAsked(text, textOf(prevAssistant));
  const activeTools = (Object.keys(tools) as (keyof typeof tools)[]).filter((n) => !WRITE_TOOLS.includes(n) || mayWrite.includes(n));
  let stepStartedAt = Date.now();
  /** What the answer has cost so far, from the steps that have finished. */
  const spent = () => estimateCost(modelId, steps.reduce((a, s) => a + s.inputTokens, 0), steps.reduce((a, s) => a + s.outputTokens, 0));

  /** Writes the trace once. The first of finish, stop and error to arrive decides the outcome. */
  let traced = false;
  /**
   * The checks that cost nothing, run on the finished answer: was it in the language of the
   * question, and does every number in it come from something the model was given. They are the
   * same functions the evals grade with. Counts only are kept, never the words or the numbers.
   */
  const checks = (answer: string, outputs: unknown[]): NonNullable<Trace["flags"]> => {
    const said = answer.trim();
    if (!said) return {};
    // What the model had in front of it from earlier turns counts as a source too.
    const earlier = history.flatMap((m) => m.parts.flatMap((p: any) => (p.type === "text" ? [p.text as string] : typeof p.type === "string" && p.type.startsWith("tool-") && p.output ? [JSON.stringify(p.output).slice(0, 20_000)] : [])));
    const numbers = traceNumbers(said, outputs, [text, ...earlier]);
    const words = said.split(/\s+/).length;
    const answered = answerLang(said);
    // A few words say little about language ("Thanks!", a ticker and a price).
    return { words, numbers: { total: numbers.total, untraced: numbers.untraced.length }, lang: { asked: lang, answered, match: words < 12 || answered === lang } };
  };

  const trace = (outcome: TraceOutcome, totals: { inputTokens: number; outputTokens: number; cachedInputTokens?: number; reasoningTokens?: number }, error?: string, checked: NonNullable<Trace["flags"]> = {}) => {
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
      costUsd: estimateCost(modelId, totals.inputTokens, totals.outputTokens, totals.cachedInputTokens),
      ttftMs: firstTokenAt ? firstTokenAt - startedAt : null,
      latencyMs: Date.now() - startedAt,
      error: error?.slice(0, 200) ?? null,
      flags: { ...checked, adviceGuard: guardMode, advicePatterns: advice },
    });
  };

  const result = streamText({
    model: languageModel(modelId),
    // The reader's calendar date: the UTC date is still yesterday in India until 05:30.
    instructions: systemPrompt(mode, input.harness?.today ?? istToday(), variant) + LANGUAGE_NOTE[lang],
    // Unfinished tool calls are dropped by convertToModelMessages.
    messages: modelMessages,
    tools,
    activeTools,
    stopWhen: isStepCount(MAX_STEPS),
    // Without this, a run that is still looking things up at the cap ends with no answer at all.
    prepareStep: ({ stepNumber }) => (stepNumber >= MAX_STEPS - 1 || Date.now() - startedAt > maxSeconds() * 1000 || spent() > maxUsdPerAnswer() ? { toolChoice: "none" } : undefined),
    maxOutputTokens: 8000,
    // Most questions are lookups over data Nazar has already worked out, so a reasoning model is told
    // how much to deliberate: the catalog's setting for it, or ASK_REASONING_EFFORT for the deployment.
    providerOptions: effort ? { openai: { reasoningEffort: effort } } : undefined,
    abortSignal: input.signal,
    // The no-advice rule, held at the last point before the reader: text is released a sentence at
    // a time, and a sentence that tells them what to do with their money is left out.
    experimental_transform:
      guardMode === "enforce"
        ? () =>
            new TransformStream({
              transform(chunk, controller) {
                if (chunk.type === "text-delta") {
                  let f = filters.get(chunk.id);
                  if (!f) filters.set(chunk.id, (f = new SentenceFilter(input.harness?.onAdviceRemoved)));
                  const text = f.push(chunk.text);
                  if (text) controller.enqueue({ ...chunk, text });
                  return;
                }
                if (chunk.type === "text-end") {
                  const f = filters.get(chunk.id);
                  if (f) {
                    const text = f.end();
                    if (text) controller.enqueue({ type: "text-delta", id: chunk.id, text });
                    advice.push(...f.removed);
                    filters.delete(chunk.id);
                  }
                }
                controller.enqueue(chunk);
              },
            })
        : undefined,
    onChunk: ({ chunk }) => {
      if (firstOutputAt === null && (chunk.type === "text-delta" || chunk.type === "tool-input-start" || chunk.type === "tool-call")) firstOutputAt = Date.now();
      if (firstTokenAt === null && chunk.type === "text-delta") firstTokenAt = Date.now();
      if (chunk.type === "text-delta") unbilledChars += chunk.text.length;
    },
    onStepEnd: (step) => {
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
    onEnd: ({ totalUsage, steps: done, finishReason }) => {
      if (guardMode === "shadow") advice.push(...findDirectives(done.map((s) => s.text).join("\n")).filter((d) => d.blocks).map((d) => d.pattern));
      if (advice.length) track(userId, "advice_filtered", { mode: guardMode, model: modelId, promptVersion: version, lang, sentences: advice.length, patterns: [...new Set(advice)] }, id);
      const inputTokens = totalUsage.inputTokens ?? 0;
      const outputTokens = totalUsage.outputTokens ?? 0;
      const cachedInputTokens = totalUsage.inputTokenDetails.cacheReadTokens ?? 0;
      const reasoningTokens = totalUsage.outputTokenDetails.reasoningTokens ?? 0;
      void logUsage(modelId, inputTokens, outputTokens, cachedInputTokens);
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
          adviceRemoved: guardMode === "enforce" ? advice.length : 0,
          tools: [...(ahead ? [ahead.tool] : []), ...calls.map((c) => c.toolName)],
          readAhead: ahead?.tool ?? null,
          toolErrors: results.filter((r) => isError(r.output)).length,
          steps: done.length,
          tickers,
          market: markets.length === 1 ? markets[0] : markets.length ? "MIXED" : "NONE",
          inputTokens,
          cachedInputTokens,
          outputTokens,
          reasoningTokens,
          costUsd: estimateCost(modelId, inputTokens, outputTokens, cachedInputTokens),
          guardMs,
          ttftMs: firstTokenAt ? firstTokenAt - startedAt : null,
          firstOutputMs: firstOutputAt ? firstOutputAt - startedAt : null,
          latencyMs: Date.now() - startedAt,
        },
        id,
      );
      trace("finished", { inputTokens, outputTokens, cachedInputTokens, reasoningTokens }, undefined, checks(done.map((s) => s.text).join("\n"), [...(ahead ? [ahead.output] : []), ...results.map((r) => r.output)]));
    },
    onError: ({ error }) => {
      const message = String(error instanceof Error ? error.message : error);
      console.error("[chat] stream error:", error);
      track(userId, "answer_error", { model: modelId, promptVersion: version, message: message.slice(0, 120) }, id);
      trace("error", { inputTokens: steps.reduce((a, s) => a + s.inputTokens, 0), outputTokens: steps.reduce((a, s) => a + s.outputTokens, 0) }, message);
    },
  });

  const friendly = (error: unknown) => {
    console.error("[chat] ui stream error:", error);
    return friendlyError(error instanceof Error ? error.message : String(error), modelId);
  };
  const finishMeta = (u: { inputTokens?: number; outputTokens?: number; inputTokenDetails?: { cacheReadTokens?: number } }): AskMeta => {
    const i = u.inputTokens ?? 0;
    const o = u.outputTokens ?? 0;
    return { model: modelId, mode, promptVersion: version, inputTokens: i, outputTokens: o, costUsd: estimateCost(modelId, i, o, u.inputTokenDetails?.cacheReadTokens ?? 0), latencyMs: Date.now() - startedAt, adviceRemoved: guardMode === "enforce" ? advice.length : 0 };
  };

  // With something read ahead, the answer opens with that result's card, then the model's stream follows it.
  if (ahead) {
    const stream = createUIMessageStream<Msg>({
      originalMessages: messages,
      generateId: () => answerId,
      execute: ({ writer }) => {
        writer.write({ type: "start", messageId: answerId, messageMetadata: { model: modelId, mode, promptVersion: version } });
        writer.write({ type: "start-step" });
        writer.write({ type: "tool-input-available", toolCallId: readAheadId, toolName: ahead.tool, input: ahead.input });
        writer.write({ type: "tool-output-available", toolCallId: readAheadId, output: ahead.output });
        writer.write({ type: "finish-step" });
        writer.merge(toUIMessageStream<typeof tools, Msg>({ stream: result.stream, sendStart: false, messageMetadata: ({ part }) => (part.type === "finish" ? finishMeta(part.totalUsage) : undefined), onError: friendly }));
      },
      onError: friendly,
      onEnd: ({ messages: all }) => save(all),
    });
    return createUIMessageStreamResponse({ stream });
  }

  return createUIMessageStreamResponse({
    stream: toUIMessageStream<typeof tools, Msg>({
      stream: result.stream,
      originalMessages: messages,
      generateMessageId: () => answerId,
      messageMetadata: ({ part }) => (part.type === "start" ? { model: modelId, mode, promptVersion: version } : part.type === "finish" ? finishMeta(part.totalUsage) : undefined),
      onError: friendly,
      onEnd: ({ messages: all }) => save(all),
    }),
  });
}
