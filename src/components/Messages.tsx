"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { UIMessage } from "ai";
import { ChevronRight, Database, ShieldCheck, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ToolView } from "./gen/ToolView";
import { FEEDBACK_REASONS, type FeedbackReason } from "@/lib/feedback-reasons";
import { TOOL_LABELS, followUps } from "@/lib/followups";
import { getModel } from "@/lib/models";
import { PRIVATE_TOOLS } from "@/lib/tool-names";
import { trackClient } from "@/lib/track-client";

type Meta = { model?: string; inputTokens?: number; outputTokens?: number; costUsd?: number; guarded?: boolean; latencyMs?: number; mode?: string };
export type Rating = "up" | "down";

interface Props {
  messages: UIMessage[];
  onPick?: (s: string) => void;
  /** Read-only (shared links): hides private tool output, feedback, cost and suggestions. */
  readOnly?: boolean;
  chatId?: string;
  ratings?: Record<string, Rating>;
  onRate?: (messageId: string, rating: Rating | null, reason?: FeedbackReason) => void;
  /** Show follow-up suggestions under the last answer (off while streaming). */
  showFollowUps?: boolean;
}

export function MessageList({ messages, onPick, readOnly = false, chatId, ratings = {}, onRate, showFollowUps = false }: Props) {
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const asked = messages.filter((m) => m.role === "user").map((m) => m.parts.map((p) => (p.type === "text" ? p.text : "")).join(" "));
  return (
    <>
      {messages.map((m) => {
        const meta = (m as any).metadata as Meta | undefined;
        const isLast = m.id === lastAssistant?.id;
        return (
          <div key={m.id} className={m.role === "user" ? "my-5 flex justify-end print-avoid-break" : "my-5"}>
            {m.role === "user" ? (
              <div className="user-bubble max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm text-accent-ink">
                {m.parts.map((p, i) => (p.type === "text" ? <span key={i} className="whitespace-pre-wrap">{p.text}</span> : null))}
              </div>
            ) : (
              <div>
                {m.parts.map((p: any, i) => {
                  if (p.type === "text") return <div key={i} className="prose-ask"><ReactMarkdown remarkPlugins={[remarkGfm]}>{p.text}</ReactMarkdown></div>;
                  if (typeof p.type === "string" && p.type.startsWith("tool-")) {
                    if (readOnly && PRIVATE_TOOLS.has(p.type.slice(5))) return null;
                    return <ToolView key={p.toolCallId ?? i} part={p} onPick={readOnly ? undefined : onPick} />;
                  }
                  return null;
                })}
                {!readOnly && meta?.guarded && (
                  <div className="no-print mt-1 flex items-center gap-1 text-[11px] text-subtle">
                    <ShieldCheck className="h-3 w-3" /> Outside Nazar&apos;s scope
                  </div>
                )}
                {!readOnly && !meta?.guarded && meta?.model && (
                  <AnswerFooter message={m} meta={meta} chatId={chatId} rating={ratings[m.id]} onRate={onRate} />
                )}
                {!readOnly && showFollowUps && isLast && !meta?.guarded && onPick && <FollowUps message={m} asked={asked} onPick={onPick} chatId={chatId} />}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/** Model/cost/latency line + "How this answer was built" + 👍/👎. */
function AnswerFooter({ message, meta, chatId, rating, onRate }: { message: UIMessage; meta: Meta; chatId?: string; rating?: Rating; onRate?: Props["onRate"] }) {
  const [open, setOpen] = useState(false);
  const [askReason, setAskReason] = useState(false);
  const calls = (message.parts as any[]).filter((p) => typeof p.type === "string" && p.type.startsWith("tool-"));
  const ok = calls.filter((p) => p.state === "output-available" && !(p.output && typeof p.output === "object" && "error" in p.output));
  const failed = calls.length - ok.length;
  const sources = [...new Set(ok.map((p) => TOOL_LABELS[p.type.slice(5)] ?? p.type.slice(5)))];
  const label = getModel(meta.model!)?.label ?? meta.model;
  const secs = meta.latencyMs != null ? `${(meta.latencyMs / 1000).toFixed(1)}s` : null;

  const rate = (r: Rating) => {
    const next = rating === r ? null : r;
    onRate?.(message.id, next);
    setAskReason(next === "down");
  };

  return (
    <div className="no-print mt-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-subtle">
        {calls.length > 0 ? (
          <button
            onClick={() => {
              if (!open) trackClient("sources_opened", { tools: calls.length }, chatId);
              setOpen(!open);
            }}
            className="flex items-center gap-1 hover:text-text"
            aria-expanded={open}
          >
            <ChevronRight className={`h-3 w-3 transition ${open ? "rotate-90" : ""}`} />
            <Database className="h-3 w-3" /> Based on {ok.length} live data {ok.length === 1 ? "call" : "calls"}
            {failed > 0 && <span className="text-warn">· {failed} failed</span>}
          </button>
        ) : (
          <span className="flex items-center gap-1"><Database className="h-3 w-3" /> No market data used (general knowledge)</span>
        )}
        <span>
          {label}
          {meta.mode && ` · ${meta.mode === "pro" ? "Pro" : "Simple"}`}
          {secs && ` · ${secs}`}
          {meta.costUsd != null && ` · $${meta.costUsd < 0.01 ? meta.costUsd.toFixed(4) : meta.costUsd.toFixed(3)}`}
        </span>
        {onRate && (
          <span className="ml-auto flex items-center gap-0.5">
            <button onClick={() => rate("up")} className={`rounded p-1 ${rating === "up" ? "text-accent" : "hover:text-text"}`} aria-label="Helpful" aria-pressed={rating === "up"}>
              <ThumbsUp className="h-3.5 w-3.5" fill={rating === "up" ? "currentColor" : "none"} />
            </button>
            <button onClick={() => rate("down")} className={`rounded p-1 ${rating === "down" ? "text-loss" : "hover:text-text"}`} aria-label="Not helpful" aria-pressed={rating === "down"}>
              <ThumbsDown className="h-3.5 w-3.5" fill={rating === "down" ? "currentColor" : "none"} />
            </button>
          </span>
        )}
      </div>
      {askReason && rating === "down" && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-subtle">What went wrong?</span>
          {(Object.keys(FEEDBACK_REASONS) as FeedbackReason[]).map((k) => (
            <button
              key={k}
              onClick={() => {
                onRate?.(message.id, "down", k);
                setAskReason(false);
              }}
              className="rounded-full border border-line px-2 py-0.5 text-muted hover:border-line-strong hover:text-text"
            >
              {FEEDBACK_REASONS[k]}
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="mt-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[11px] text-muted">
          <div className="mb-1 font-medium text-text">How this answer was built</div>
          <ol className="list-decimal space-y-0.5 pl-4">
            {calls.map((p, i) => {
              const name = p.type.slice(5);
              const input = p.input ?? {};
              const subject = input.symbol ?? input.symbols?.join(", ") ?? input.query ?? input.region ?? input.screen ?? "";
              const bad = !(p.state === "output-available" && !(p.output && "error" in p.output));
              return (
                <li key={p.toolCallId ?? i}>
                  {TOOL_LABELS[name] ?? name}
                  {subject && <span className="text-subtle"> · {String(subject)}</span>}
                  {bad && <span className="text-warn"> · failed</span>}
                </li>
              );
            })}
          </ol>
          <div className="mt-1.5 text-subtle">
            Source: {sources.length ? "Yahoo Finance" : "n/a"} (quotes can be delayed up to ~15 min) · Written by {label}, which is told to use only these results for numbers.
          </div>
        </div>
      )}
    </div>
  );
}

function FollowUps({ message, asked, onPick, chatId }: { message: UIMessage; asked: string[]; onPick: (s: string) => void; chatId?: string }) {
  const items = followUps(message, asked);
  if (!items.length) return null;
  return (
    <div className="no-print mt-3 flex flex-wrap gap-1.5">
      {items.map((q, i) => (
        <button
          key={q}
          onClick={() => {
            trackClient("suggestion_click", { position: i }, chatId);
            onPick(q);
          }}
          className="rounded-full border border-line bg-surface-2 px-3 py-1 text-xs text-text transition hover:border-accent hover:text-accent"
        >
          {q}
        </button>
      ))}
    </div>
  );
}
