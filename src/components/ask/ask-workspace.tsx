"use client";
import type { UIMessage } from "ai";
import { Check, Copy, FileDown, FileSpreadsheet, History, Link2, Plus, Share2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Chat } from "@/components/ask/chat";
import type { Rating } from "@/components/ask/messages";
import { Button } from "@/components/ui/button";
import type { AskContext } from "./ask-start";
import { Sheet } from "@/components/ui/sheet";
import { Segmented } from "@/components/ui/switch";
import { useHydrated, useStoredPref } from "@/lib/client-store";
import { cn } from "@/lib/cn";
import { isPrivateTool } from "@/lib/ask/registry";
import { trackClient } from "@/lib/events-client";

type ChatRow = { id: string; title: string; updatedAt: string };
type Mode = "simple" | "pro";
const MODES = ["simple", "pro"] as const;
const fetchChat = (id: string) =>
  fetch(`/api/chats/${id}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** The Ask tab: the research agent, with portfolio-aware answers. */
export type AskStart = { openId: string } | { newId: string; question: string | null };

export function AskWorkspace({ remaining, start, context }: { remaining: { remaining: number; limit: number } | null; start: AskStart; context: AskContext }) {
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [chatId, setChatId] = useState("newId" in start ? start.newId : "");
  const [initial, setInitial] = useState<UIMessage[] | null>("newId" in start ? [] : null);
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  const [shareId, setShareId] = useState<string | null>(null);
  const [mode, setMode] = useStoredPref<Mode>("nazar:mode", "simple", MODES);
  const [model] = useStoredPref<string>("nazar:model", "auto");
  const [historyOpen, setHistoryOpen] = useState(false);
  const hydrated = useHydrated(); // "now" in the reader's timezone exists only in the browser
  const [shareOpen, setShareOpen] = useState(false);
  const [prompt] = useState<{ text: string; nonce: number } | null>("newId" in start && start.question ? { text: start.question, nonce: 1 } : null);
  const msgs = useRef<UIMessage[]>([]);
  const onMessages = useCallback((m: UIMessage[]) => {
    msgs.current = m;
  }, []);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/chats");
    if (r.ok) setChats((await r.json()).chats);
  }, []);
  const showChat = useCallback((id: string, j: { messages?: UIMessage[]; feedback?: Record<string, Rating>; shareId?: string | null }) => {
    setInitial(j.messages ?? []);
    setRatings(j.feedback ?? {});
    setShareId(j.shareId ?? null);
    setChatId(id);
    history.replaceState(null, "", `/ask?c=${id}`);
  }, []);
  const open = useCallback(
    (id: string) => {
      setHistoryOpen(false);
      void fetchChat(id).then((j) => j && showChat(id, j));
    },
    [showChat],
  );
  const fresh = useCallback(() => {
    setHistoryOpen(false);
    setInitial([]);
    setRatings({});
    setShareId(null);
    setChatId(newId());
    history.replaceState(null, "", "/ask");
  }, []);

  useEffect(() => {
    fetch("/api/chats")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setChats(j.chats))
      .catch(() => {});
    if ("openId" in start) void fetchChat(start.openId).then((j) => j && showChat(start.openId, j));
    // Drop ?q= so a reload doesn't ask again. Only when there is one: rewriting the URL for no reason
    // can cancel a navigation the user started while the page was still loading.
    else if (location.pathname === "/ask" && location.search) history.replaceState(null, "", "/ask");
    // Runs once on mount: `start` describes the first load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title = chats.find((c) => c.id === chatId)?.title ?? "New question";
  const hasMessages = (initial?.length ?? 0) > 0 || chats.some((c) => c.id === chatId);

  const exportExcel = async () => {
    const parts = msgs.current.flatMap((m) =>
      (m.parts as { type: string; state?: string; output?: unknown }[])
        .filter((p) => p.type.startsWith("tool-") && p.state === "output-available" && p.output && typeof p.output === "object" && !("error" in (p.output as object)))
        .map((p) => ({ toolName: p.type.slice(5), data: p.output }))
        .filter((p) => p.toolName !== "searchTicker" && !isPrivateTool(p.toolName)),
    );
    if (!parts.length) return toast("Nothing to export yet: this conversation has no data results.");
    trackClient("excel_download", { scope: "chat", sheets: parts.length }, chatId);
    const { downloadChatExcel } = await import("@/lib/excel");
    await downloadChatExcel(parts as { toolName: string; data: any }[], title);
  };

  const today = hydrated ? new Date().toDateString() : "";
  const groups = [
    { label: "Today", rows: chats.filter((c) => hydrated && new Date(c.updatedAt).toDateString() === today) },
    { label: hydrated ? "Earlier" : "", rows: chats.filter((c) => !hydrated || new Date(c.updatedAt).toDateString() !== today) },
  ].filter((g) => g.rows.length);
  const historyList = (
    <div>
      <button onClick={fresh} className="mb-4 flex h-11 w-full items-center justify-center gap-2 rounded-[14px] border border-dashed border-line-strong text-sm font-medium text-text transition-colors hover:border-accent hover:text-accent">
        <Plus className="h-4 w-4" /> New conversation
      </button>
      {chats.length === 0 && <p className="px-2 py-2 text-sm leading-6 text-subtle">Your conversations are kept here so you can come back to them.</p>}
      {groups.map((g) => (
        <div key={g.label} className="mb-3">
          {g.label && <div className="t-overline mb-1 px-2">{g.label}</div>}
          <ul className="space-y-0.5">
            {g.rows.map((c) => (
              <li key={c.id} className={cn("group flex items-center rounded-[12px] transition-colors", c.id === chatId ? "bg-accent-soft" : "hover:bg-surface-2")}>
                <button onClick={() => open(c.id)} aria-current={c.id === chatId ? "true" : undefined} className={cn("min-w-0 flex-1 truncate px-3 py-2 text-left text-sm", c.id === chatId ? "font-medium text-accent" : "text-muted group-hover:text-text")}>
                  {c.title}
                </button>
                <button
                  onClick={async () => {
                    await fetch(`/api/chats/${c.id}`, { method: "DELETE" });
                    if (c.id === chatId) fresh();
                    refresh();
                  }}
                  className="mr-1 rounded-full p-1.5 text-subtle opacity-100 hover:text-loss lg:opacity-0 lg:group-hover:opacity-100 lg:focus:opacity-100"
                  aria-label={`Delete "${c.title}"`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-13.5rem)] gap-5 lg:h-[calc(100dvh-7rem)]">
      <aside className="no-print hidden w-64 shrink-0 overflow-y-auto rounded-[var(--radius-card)] border border-line bg-surface-1 p-3 lg:block">{historyList}</aside>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface-1 print-expand">
        <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <button onClick={() => setHistoryOpen(true)} className="rounded-full p-2 text-muted hover:bg-surface-2 lg:hidden" aria-label="Your conversations">
              <History className="h-5 w-5" />
            </button>
            <span className="hidden min-w-0 max-w-[260px] truncate text-sm font-medium text-text md:block">{hasMessages ? title : "New conversation"}</span>
            <Segmented
              label="Answer style"
              value={mode}
              onChange={(m) => {
                setMode(m);
                trackClient("mode_change", { mode: m });
              }}
              options={[
                { value: "simple", label: "Simple" },
                { value: "pro", label: "Pro" },
              ]}
              size="sm"
            />
          </div>
          <div className="flex items-center gap-1">
            {hasMessages && (
              <Button variant="ghost" size="sm" onClick={fresh} title="Start a new conversation">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">New</span>
              </Button>
            )}
            {hasMessages && (
              <>
                <Button variant="ghost" size="sm" onClick={exportExcel} title="Download every analysis in this conversation as one Excel workbook">
                  <FileSpreadsheet className="h-4 w-4" />
                  <span className="hidden sm:inline">Excel</span>
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShareOpen(true)}>
                  <Share2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Share</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    trackClient("export_pdf", {}, chatId);
                    window.print();
                  }}
                >
                  <FileDown className="h-4 w-4" />
                  <span className="hidden sm:inline">PDF</span>
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="print-only px-4 pb-2">
          <div className="t-title-2">{title}</div>
          <div className="t-caption">Nazar research note{hydrated ? ` · ${new Date().toLocaleString()}` : ""} · We explain; you decide. Not investment advice.</div>
        </div>
        <div className="min-h-0 flex-1 print-expand">
          {chatId && initial && (
            <Chat
              key={chatId}
              chatId={chatId}
              initialMessages={initial}
              initialRatings={ratings}
              model={model}
              mode={mode}
              onMessages={onMessages}
              context={context}
              remaining={remaining}
              prompt={prompt}
              onFinished={() => {
                // The answer may finish after the user has moved to another page.
                if (location.pathname === "/ask") history.replaceState(null, "", `/ask?c=${chatId}`);
                refresh();
              }}
            />
          )}
        </div>
      </div>
      <Sheet open={historyOpen} onClose={() => setHistoryOpen(false)} title="Conversations">
        {historyList}
      </Sheet>
      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} chatId={chatId} shareId={shareId} onChange={setShareId} />
    </div>
  );
}

function ShareSheet({ open, onClose, chatId, shareId, onChange }: { open: boolean; onClose: () => void; chatId: string; shareId: string | null; onChange: (s: string | null) => void }) {
  const [copied, setCopied] = useState(false);
  const url = shareId && typeof window !== "undefined" ? `${location.origin}/s/${shareId}` : "";
  return (
    <Sheet open={open} onClose={onClose} title="Share this conversation" description="Anyone with the link sees a read-only copy. Your portfolio and Watching list are never included.">
      {shareId ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input readOnly value={url} onFocus={(e) => e.target.select()} className="h-11 min-w-0 flex-1 rounded-[14px] border border-line bg-surface-2 px-3 text-sm text-text" aria-label="Share link" />
            <Button
              onClick={async () => {
                await navigator.clipboard.writeText(url).catch(() => {});
                setCopied(true);
                trackClient("share_link_copied", {}, chatId);
                setTimeout(() => setCopied(false), 1500);
              }}
              aria-label="Copy link"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <Button
            variant="danger"
            size="sm"
            onClick={async () => {
              await fetch(`/api/chats/${chatId}/share`, { method: "DELETE" });
              onChange(null);
            }}
          >
            Stop sharing
          </Button>
        </div>
      ) : (
        <Button
          className="w-full"
          onClick={async () => {
            const r = await fetch(`/api/chats/${chatId}/share`, { method: "POST" });
            const j = await r.json();
            if (!r.ok) return toast.error(j.error ?? "Couldn't create a link.");
            onChange(j.shareId);
          }}
        >
          <Link2 className="h-4 w-4" /> Create a public link
        </Button>
      )}
    </Sheet>
  );
}
