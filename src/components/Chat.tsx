"use client";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowUp, Square, Wrench } from "lucide-react";
import { NazarMark } from "@/components/rings/nazar-mark";
import { IrisLoader } from "@/components/rings/iris";
import { TOOL_COUNT } from "@/lib/tool-catalog";
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageList, type Rating } from "./Messages";
import type { FeedbackReason } from "@/lib/feedback-reasons";

const MAX_CHARS = 2000;

const SUGGESTIONS: { group: string; items: string[] }[] = [
  { group: "Your portfolio", items: ["Why is my portfolio down this month?", "Which of my holdings is riskiest, and why?"] },
  { group: "Understand", items: ["Explain Infosys's latest results in simple words", "How diversified am I really?"] },
  { group: "Markets & learning", items: ["How are Indian markets doing today?", "Mere portfolio mein sabse risky share kaunsa hai? Hinglish mein samjhao"] },
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
  // Read when a message is sent (not during render), so updating them after commit is enough.
  const modelRef = useRef(model);
  const modeRef = useRef(mode);
  useEffect(() => {
    modelRef.current = model;
    modeRef.current = mode;
  }, [model, mode]);
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
              <NazarMark size={44} className="mb-4" />
              <h1 className="t-title-1 text-text">Ask Nazar anything about your money</h1>
              <p className="mt-2 max-w-md text-sm text-muted">Questions about your portfolio, a company or the market. Nazar reads your holdings and live data, and explains in plain language. It never tells you what to do with your money.</p>
              {onOpenTools && (
                <button onClick={onOpenTools} className="mt-4 flex items-center gap-1.5 rounded-full border border-accent bg-accent-soft px-3 py-1 text-xs text-accent hover:bg-accent-soft">
                  <Wrench className="h-3.5 w-3.5" /> Research tools: {TOOL_COUNT} tools incl. DCF, comps, SIP backtest · Excel
                </button>
              )}
              <div className="mt-8 grid w-full gap-4 sm:grid-cols-3">
                {SUGGESTIONS.map((g) => (
                  <div key={g.group} className="space-y-2">
                    <div className="text-left text-[11px] font-medium uppercase tracking-wide text-subtle">{g.group}</div>
                    {g.items.map((s) => (
                      <button key={s} onClick={() => send(s)} className="block w-full rounded-[16px] border border-line bg-surface-2 px-3.5 py-3 text-left text-sm text-text transition hover:border-accent hover:bg-surface-2">
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
            <div className="no-print my-5 flex items-center gap-2 text-sm text-muted">
              <IrisLoader size={18} label="Thinking" />
              Thinking…
            </div>
          )}

          {error && (
            <div className="no-print my-4 rounded-lg border border-loss bg-loss-soft px-3 py-2 text-sm text-loss">
              {parseError(error.message)}
            </div>
          )}
          <div ref={bottom} />
        </div>
      </div>

      <div className="no-print border-t border-line bg-bg/90 backdrop-blur">
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
            placeholder="Ask about your portfolio, a stock or the market…"
            className={`max-h-40 min-h-[44px] flex-1 resize-none rounded-[16px] border bg-surface-1 px-3.5 py-2.5 text-sm text-text outline-none placeholder:text-subtle ${tooLong ? "border-loss" : "border-line focus:border-accent"}`}
          />
          {busy ? (
            <button type="button" onClick={() => stop()} className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-surface-3 text-text hover:bg-surface-3" aria-label="Stop">
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button type="submit" disabled={!input.trim() || tooLong} className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-accent text-accent-ink transition hover:brightness-110 disabled:opacity-40" aria-label="Send">
              <ArrowUp className="h-5 w-5" />
            </button>
          )}
        </form>
        <div className="pb-2 text-center text-[11px] text-subtle">
          {tooLong ? <span className="text-loss">{input.length} / {MAX_CHARS} characters: please shorten your question.</span> : "Nazar explains; you decide. Market data via Yahoo Finance, may be delayed."}
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
