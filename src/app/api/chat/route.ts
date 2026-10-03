import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { marketOf, track } from "@/lib/events";
import { getDb, schema } from "@/lib/db";
import { classify, GUARD_MODEL, refusalText } from "@/lib/ask/scope-guard";
import { api, parseBody, requireUser } from "@/lib/http";
import { LIMITS, checkAndRecord, ipHash } from "@/lib/limits";
import { ADVICE_RULES, NAZAR_SCOPE } from "@/lib/ask/prompt";
import { AUTO_MODEL, estimateCost, getModel, routeModel } from "@/lib/ask/models";
import { allowedModelIds } from "@/lib/ask/openai-models";
import { makeTools } from "@/lib/ask/tools";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODE_STYLE = {
  simple: `AUDIENCE: a beginner retail investor (Simple mode).
- Explain every piece of jargon in plain words the first time you use it, e.g. "P/E of 25 (you pay ₹25 for every ₹1 of yearly profit)".
- Prefer everyday analogies over formulas. Keep answers to roughly 150-200 words unless the user asks for depth.
- Finish with a short "**What this means for you:**" line that explains the situation in plain language (context, never an instruction).`,
  pro: `AUDIENCE: an experienced investor or analyst (Pro mode).
- Be dense and quantitative: multiples, growth rates, margins, peer context. Skip definitions of standard terms.
- Call out the non-obvious: accounting quirks, cyclicality, capital allocation, what the market is pricing in.`,
} as const;

/** Built per request so the date is always current on long-running servers. */
function systemPrompt(mode: keyof typeof MODE_STYLE) {
  const today = new Date().toISOString().slice(0, 10);
  return `You are Nazar's "Ask" assistant: a calm, precise research companion for Indian retail investors. Nazar watches the user's portfolio every day and explains what happened and why. Today is ${today}.

LANGUAGE (highest priority for formatting): answer in the language of the user's latest message. Default to English. Use Devanagari Hindi only when the message itself is mostly in Devanagari; use Hinglish only when the message is Hindi written in Latin letters ("kya hai", "samjhao"). A ₹ sign or Indian company names do NOT mean Hindi. Keep tickers, numbers and terms like P/E as-is.

${NAZAR_SCOPE}

HOW TO WORK:
- For anything about "my portfolio", "my holdings", "why am I down", "which holding is riskiest", "how diversified am I": call getMyPortfolio first. It is read-only data from Nazar's last checkup (prices as of the last market close). Quote its "as of" date.
- ALWAYS use tools for market data. Never invent prices, ratios, financials or news. If a tool fails or data is missing, say so plainly.
- Only make comparative claims the tool data supports.
- If the user names a company rather than a ticker, call searchTicker first. Prefer the NSE listing (.NS).
- Call only the tools the question needs; call independent tools in parallel.
- Tool results render automatically as charts/tables. Don't repeat raw numbers in a big table; add insight: what stands out, context, risks.
- Analysis models: getRiskReturn, getCorrelationMatrix, getDupontAnalysis, getFinancialHealthScore, runSipBacktest, getTechnicalIndicators, runComparableValuation, runDcfValuation. Present valuation models as estimates with their assumptions, never as a price to act on.
- Indian stocks: amounts in ₹ with lakh / crore for large figures.

${ADVICE_RULES}

STYLE:
- Calm, direct, slightly warm. No hype, no FOMO, no emojis like rockets.
- Tight prose: short paragraphs or bullets, bold the key takeaways, markdown.
- End substantive answers with one line: "Nazar explains; the decision is yours. This isn't investment advice."

${MODE_STYLE[mode]}`;
}

type Meta = { model?: string; inputTokens?: number; outputTokens?: number; costUsd?: number; guarded?: boolean; latencyMs?: number; mode?: string };
type Msg = UIMessage<Meta>;

const Body = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  model: z.string().max(64).optional(),
  mode: z.enum(["simple", "pro"]).default("simple"),
  message: z.object({
    id: z.string().max(100),
    role: z.literal("user"),
    parts: z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()).min(1).max(20),
  }),
});

function textOf(m: Msg | undefined) {
  return (m?.parts ?? []).map((p) => (p.type === "text" ? p.text : "")).join(" ").trim();
}

/**
 * What the model sees: recent history only, with bulky tool outputs from older turns
 * summarised (the UI keeps the full data). Unfinished tool calls are dropped by convertToModelMessages.
 */
function forModel(messages: Msg[]): Msg[] {
  const recent = messages.slice(-30);
  return recent.map((m, i) => {
    const old = i < recent.length - 4;
    const parts = m.parts.map((p: any) => {
      if (!old || !p.type?.startsWith("tool-") || p.state !== "output-available") return p;
      const json = JSON.stringify(p.output ?? null);
      return json.length > 2500 ? { ...p, output: { note: "Older tool output truncated to save context; call the tool again if exact figures are needed.", excerpt: json.slice(0, 1500) } } : p;
    });
    return { ...m, parts };
  });
}

function friendlyError(msg: string, modelId: string) {
  if (/model/i.test(msg) && /(not found|does not exist|access)/i.test(msg)) return `Model "${modelId}" isn't available for this OpenAI key. Pick another model.`;
  if (/quota|billing|insufficient/i.test(msg)) return "The OpenAI account behind this app is out of credit. Please try again later.";
  if (/rate limit|429/i.test(msg)) return "The AI provider is busy right now. Please retry in a few seconds.";
  if (/context|too long|maximum.*tokens/i.test(msg)) return "This conversation has grown too long. Start a new research chat.";
  return "Something went wrong while generating the answer. Please try again.";
}

export const POST = api(async (req: Request) => {
  const user = await requireUser(req);
  const userId = user.id;
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "OPENAI_API_KEY is not set. Add it to .env.local (local) or your Vercel project env vars." }, { status: 500 });
  }

  const body = await parseBody(req, Body);
  const { id, model: requested, mode } = body;
  const startedAt = Date.now();

  // Only plain text from the user is accepted: no forged tool results, files or system messages.
  const text = body.message.parts.map((p) => (p.type === "text" ? (p.text ?? "") : "")).join("\n").trim();
  if (!text) return Response.json({ error: "Empty message" }, { status: 400 });
  if (text.length > LIMITS.maxInputChars) return Response.json({ error: `Please keep questions under ${LIMITS.maxInputChars} characters (yours is ${text.length}).` }, { status: 400 });
  const userMessage: Msg = { id: body.message.id || randomUUID(), role: "user", parts: [{ type: "text", text }] };

  const db = await getDb();
  const [existing] = await db.select({ userId: schema.chats.userId, messages: schema.chats.messages }).from(schema.chats).where(eq(schema.chats.id, id)).limit(1);
  if (existing && existing.userId !== userId) return Response.json({ error: "Forbidden" }, { status: 403 });

  // History comes from the database, never from the client, so it can't be tampered with.
  const history = (Array.isArray(existing?.messages) ? existing.messages : []) as Msg[];
  const messages: Msg[] = [...history, userMessage];

  const limit = await checkAndRecord(userId, ipHash(req), user.isDemo);
  if (!limit.ok) {
    track(userId, "rate_limited", { status: limit.status, reason: limit.error.slice(0, 60) }, id);
    return Response.json({ error: limit.error }, { status: limit.status });
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
  const generateMessageId = createIdGenerator({ prefix: "msg", size: 16 });

  const available = await allowedModelIds();

  // ── Scope guard ─────────────────────────────────────────────
  const prevUser = [...history].reverse().find((m) => m.role === "user");
  const prevAssistant = [...history].reverse().find((m) => m.role === "assistant");
  const guardStart = Date.now();
  const guard = await classify(text, { previousUser: textOf(prevUser), previousAssistant: textOf(prevAssistant) }, available);
  const guardMs = Date.now() - guardStart;
  if (guard.usage) void logUsage(GUARD_MODEL, guard.usage.inputTokens, guard.usage.outputTokens);
  if (guard.verdict !== "in_scope") {
    // Only the classifier's short topic label is stored, never the raw question.
    track(userId, "guard_block", { verdict: guard.verdict, topic: guard.topic.slice(0, 60), guardMs, mode, turn: history.filter((m) => m.role === "user").length + 1 }, id);
    const stream = createUIMessageStream<Msg>({
      originalMessages: messages,
      generateId: generateMessageId,
      execute: ({ writer }) => {
        const tid = randomUUID();
        writer.write({ type: "start", messageMetadata: { guarded: true } });
        writer.write({ type: "text-start", id: tid });
        writer.write({ type: "text-delta", id: tid, delta: refusalText(guard) });
        writer.write({ type: "text-end", id: tid });
        writer.write({ type: "finish", messageMetadata: { guarded: true } });
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
  const tools = makeTools(userId);

  const result = streamText({
    model: openai(modelId),
    system: systemPrompt(mode),
    messages: convertToModelMessages(forModel(messages), { ignoreIncompleteToolCalls: true, tools }),
    tools,
    stopWhen: stepCountIs(10),
    maxOutputTokens: 8000,
    abortSignal: req.signal,
    onChunk: ({ chunk }) => {
      if (firstOutputAt === null && (chunk.type === "text-delta" || chunk.type === "tool-input-start" || chunk.type === "tool-call")) firstOutputAt = Date.now();
      if (firstTokenAt === null && chunk.type === "text-delta") firstTokenAt = Date.now();
    },
    onFinish: ({ totalUsage, steps }) => {
      const inputTokens = totalUsage.inputTokens ?? 0;
      const outputTokens = totalUsage.outputTokens ?? 0;
      void logUsage(modelId, inputTokens, outputTokens);
      const calls = steps.flatMap((s) => s.toolCalls);
      const results = steps.flatMap((s) => s.toolResults);
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
          turn: history.filter((m) => m.role === "user").length + 1,
          chars: text.length,
          lang: /[\u0900-\u097F]/.test(text) ? "hi" : "en",
          tools: calls.map((c) => c.toolName),
          toolErrors: results.filter((r: any) => r.output && typeof r.output === "object" && "error" in r.output).length,
          steps: steps.length,
          tickers,
          market: markets.length === 1 ? markets[0] : markets.length ? "MIXED" : "NONE",
          inputTokens,
          outputTokens,
          costUsd: estimateCost(modelId, inputTokens, outputTokens),
          guardMs,
          ttftMs: firstTokenAt ? firstTokenAt - startedAt : null,
          firstOutputMs: firstOutputAt ? firstOutputAt - startedAt : null,
          latencyMs: Date.now() - startedAt,
        },
        id,
      );
    },
    onError: ({ error }) => {
      console.error("[chat] stream error:", error);
      track(userId, "answer_error", { model: modelId, message: String(error instanceof Error ? error.message : error).slice(0, 120) }, id);
    },
  });

  return result.toUIMessageStreamResponse<Msg>({
    originalMessages: messages,
    generateMessageId,
    messageMetadata: ({ part }) => {
      if (part.type === "start") return { model: modelId, mode };
      if (part.type === "finish") {
        const i = part.totalUsage.inputTokens ?? 0;
        const o = part.totalUsage.outputTokens ?? 0;
        return { model: modelId, mode, inputTokens: i, outputTokens: o, costUsd: estimateCost(modelId, i, o), latencyMs: Date.now() - startedAt };
      }
    },
    onError: (error) => {
      console.error("[chat] ui stream error:", error);
      return friendlyError(error instanceof Error ? error.message : String(error), modelId);
    },
    onFinish: ({ messages: all }) => save(all),
  });
});
