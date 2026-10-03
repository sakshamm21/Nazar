"use client";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowUp, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { IrisLoader } from "@/components/rings/iris";
import type { FeedbackReason } from "@/lib/ask/feedback-reasons";
import { AskStart, type AskContext } from "./ask-start";
import { MessageList, type Rating } from "./messages";

const MAX_CHARS = 2000;

export function Chat({
  chatId,
  initialMessages,
  model,
  mode,
  initialRatings,
  onFinished,
  prompt,
  onMessages,
  context,
  remaining,
}: {
  chatId: string;
  initialMessages: UIMessage[];
  model: string;
  mode: "simple" | "pro";
  initialRatings?: Record<string, Rating>;
  onFinished: () => void;
  /** Lets the parent read the live conversation (for the whole-chat Excel export). */
  onMessages?: (m: UIMessage[]) => void;
  /** What the examples on the start screen are built from. */
  context: AskContext;
  /** Questions left today when this conversation was opened (counted down as the user asks). */
  remaining?: { remaining: number; limit: number } | null;
  /** A question to send on load (e.g. "Ask about this stock" links to /ask?q=…). */
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
    // Only follow a conversation: the start screen should open at its top.
    if (messages.length) bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
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
  const asked = messages.filter((m) => m.role === "user").length - initialMessages.filter((m) => m.role === "user").length;
  const left = remaining ? Math.max(0, remaining.remaining - asked) : null;

  return (
    <div className="flex h-full flex-col print-expand">
      <div className="flex-1 overflow-y-auto print-expand">
        <div className="mx-auto max-w-3xl px-4 pb-8 pt-6">
          {messages.length === 0 && <AskStart context={context} mode={mode} onPick={send} />}

          <MessageList messages={messages} onPick={send} chatId={chatId} ratings={ratings} onRate={rate} showFollowUps={!busy} />

          {status === "submitted" && (
            <div className="no-print my-5 flex items-center gap-2 text-sm text-muted">
              <IrisLoader size={18} label="Thinking" />
              Reading your question and choosing what to look up…
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

      <div className="no-print border-t border-line bg-surface-1">
        <div className="mx-auto max-w-3xl px-3 pt-3 sm:px-4">
        <form
          className={`flex items-end gap-2 rounded-[26px] border bg-surface-2 p-1.5 pl-4 transition-colors focus-within:border-accent ${tooLong ? "border-loss" : "border-line"}`}
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
            aria-label="Your question"
            placeholder={messages.length ? "Ask a follow-up…" : "Ask about your portfolio, a company, a fund or the market…"}
            className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-[15px] text-text outline-none placeholder:text-subtle"
          />
          {busy ? (
            <button type="button" onClick={() => stop()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-3 text-text hover:brightness-110" aria-label="Stop">
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button type="submit" disabled={!input.trim() || tooLong} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition hover:brightness-110 disabled:opacity-40" aria-label="Send">
              <ArrowUp className="h-5 w-5" />
            </button>
          )}
        </form>
        </div>
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-0.5 px-5 pb-2.5 pt-1.5 text-[11px] text-subtle">
          {tooLong ? (
            <span className="text-loss">{input.length} / {MAX_CHARS} characters: please shorten your question.</span>
          ) : (
            <>
              <span>Enter to send · Shift + Enter for a new line{left != null ? ` · ${left} of ${remaining!.limit} questions left today` : ""}</span>
              <span>Nazar explains; you decide. Data via Yahoo Finance, may be delayed.</span>
            </>
          )}
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
