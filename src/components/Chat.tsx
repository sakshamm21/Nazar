"use client";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowUp, Square, TrendingUp, Wrench } from "lucide-react";
import { TOOL_COUNT } from "@/lib/tool-catalog";
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageList, type Rating } from "./Messages";
import type { FeedbackReason } from "@/lib/feedback-reasons";

const MAX_CHARS = 2000;

const SUGGESTIONS: { group: string; items: string[] }[] = [
  { group: "Markets", items: ["How are Indian markets doing today?", "₹10,000 monthly SIP in the Nifty 50 for 5 years: what would it be worth?"] },
  { group: "Research", items: ["Analyze Reliance Industries: valuation, growth and analyst view", "Value HDFC Bank against ICICI, Kotak and Axis Bank using comps"] },
  { group: "Learn", items: ["What is a P/E ratio and why does it matter?", "TCS ka P/E ratio kya hai? Hinglish mein samjhao"] },
];

export function Chat({
  chatId,
  initialMessages,
  model,
  mode,
  initialRatings,
  onFinished,
  prompt,
  onMessages,
  onOpenTools,
}: {
  chatId: string;
  initialMessages: UIMessage[];
  model: string;
  mode: "simple" | "pro";
  initialRatings?: Record<string, Rating>;
  onFinished: () => void;
  /** Lets the parent read the live conversation (for the whole-chat Excel export). */
  onMessages?: (m: UIMessage[]) => void;
  onOpenTools?: () => void;
  /** A prompt injected from outside the chat (e.g. clicking a watchlist item). */
  prompt?: { text: string; nonce: number } | null;
}) {
  const [input, setInput] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const modelRef = useRef(model);
  modelRef.current = model;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [ratings, setRatings] = useState<Record<string, Rating>>(initialRatings ?? {});

  const rate = async (messageId: string, rating: Rating | null, reason?: FeedbackReason) => {
    setRatings((r) => {
      const next = { ...r };
      if (rating) next[messageId] = rating;
      else delete next[messageId];
      return next;
    });
    await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chatId, messageId, rating, reason }) }).catch(() => {});
  };

  // Only the new message is sent; the server loads history from the database.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ id, messages, body }) => ({ body: { id, message: messages[messages.length - 1], model: body?.model, mode: body?.mode } }),
      }),
    [],
  );

  const { messages, sendMessage, status, stop, error, clearError } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
    onFinish: () => onFinished(),
  });

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    onMessages?.(messages);
  }, [messages, onMessages]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy || t.length > MAX_CHARS) return;
    clearError();
    sendMessage({ text: t }, { body: { model: modelRef.current, mode: modeRef.current } });
    setInput("");
  };

  const lastNonce = useRef<number | null>(null);
  useEffect(() => {
    if (prompt && prompt.nonce !== lastNonce.current && !busy) {
      lastNonce.current = prompt.nonce;
      send(prompt.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt]);

  const tooLong = input.length > MAX_CHARS;

  return (
    <div className="flex h-full flex-col print-expand">
      <div className="flex-1 overflow-y-auto print-expand">
        <div className="mx-auto max-w-3xl px-4 pb-8 pt-6">
          {messages.length === 0 && (
            <div className="no-print flex flex-col items-center pt-[12vh] text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
                <TrendingUp className="h-6 w-6" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">What are we researching today?</h1>
              <p className="mt-2 max-w-md text-sm text-zinc-400">Ask about any listed company in India, the US or elsewhere. Stock AI pulls live market data and renders charts and tables as it researches.</p>
              {onOpenTools && (
                <button onClick={onOpenTools} className="mt-4 flex items-center gap-1.5 rounded-full border border-emerald-700/50 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300 hover:bg-emerald-500/20">
                  <Wrench className="h-3.5 w-3.5" /> Explore {TOOL_COUNT} tools: DCF, comps, SIP backtest, risk, technicals · Excel models
                </button>
              )}
              <div className="mt-8 grid w-full gap-4 sm:grid-cols-3">
                {SUGGESTIONS.map((g) => (
                  <div key={g.group} className="space-y-2">
                    <div className="text-left text-[11px] font-medium uppercase tracking-wide text-zinc-600">{g.group}</div>
                    {g.items.map((s) => (
                      <button key={s} onClick={() => send(s)} className="block w-full rounded-xl border border-zinc-800 bg-zinc-900/50 px-3.5 py-3 text-left text-sm text-zinc-300 transition hover:border-emerald-500/50 hover:bg-zinc-900">
                        {s}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          <MessageList messages={messages} onPick={send} chatId={chatId} ratings={ratings} onRate={rate} showFollowUps={!busy} />

          {status === "submitted" && (
            <div className="no-print my-5 flex items-center gap-2 text-sm text-zinc-400">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400" />
              </span>
              Thinking…
            </div>
          )}

          {error && (
            <div className="no-print my-4 rounded-lg border border-rose-900/60 bg-rose-950/30 px-3 py-2 text-sm text-rose-300">
              {parseError(error.message)}
            </div>
          )}
          <div ref={bottom} />
        </div>
      </div>

      <div className="no-print border-t border-zinc-800/80 bg-zinc-950/80 backdrop-blur">
        <form
          className="mx-auto flex max-w-3xl items-end gap-2 px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="Ask about a stock, compare companies, run a DCF…"
            className={`max-h-40 min-h-[44px] flex-1 resize-none rounded-xl border bg-zinc-900 px-3.5 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 ${tooLong ? "border-rose-700" : "border-zinc-800 focus:border-emerald-500/60"}`}
          />
          {busy ? (
            <button type="button" onClick={() => stop()} className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-800 text-zinc-200 hover:bg-zinc-700" aria-label="Stop">
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button type="submit" disabled={!input.trim() || tooLong} className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500 text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-40" aria-label="Send">
              <ArrowUp className="h-5 w-5" />
            </button>
          )}
        </form>
        <div className="pb-2 text-center text-[11px] text-zinc-600">
          {tooLong ? <span className="text-rose-400">{input.length} / {MAX_CHARS} characters: please shorten your question.</span> : "Market data via Yahoo Finance, may be delayed. Not investment advice."}
        </div>
      </div>
    </div>
  );
}

function parseError(msg: string) {
  try {
    const j = JSON.parse(msg);
    return j.error ?? msg;
  } catch {
    return msg;
  }
}
