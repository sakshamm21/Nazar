"use client";
import type { UIMessage } from "ai";
import { Check, Copy, FileDown, FileSpreadsheet, History, Link2, Plus, Share2, Trash2, Wrench } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Chat } from "@/components/Chat";
import type { Rating } from "@/components/Messages";
import { Button, buttonClass } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Segmented } from "@/components/ui/switch";
import { useStoredPref } from "@/lib/client-store";
import { cn } from "@/lib/cn";
import { PRIVATE_TOOLS } from "@/lib/tool-names";
import { trackClient } from "@/lib/track-client";

type ChatRow = { id: string; title: string; updatedAt: string };
type Mode = "simple" | "pro";
const MODES = ["simple", "pro"] as const;
const fetchChat = (id: string) =>
  fetch(`/api/chats/${id}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** The Ask tab: v1's research agent, now one tab of Nazar, with portfolio-aware answers. */
export type AskStart = { openId: string } | { newId: string; question: string | null };

export function AskWorkspace({ remaining, start }: { remaining: { remaining: number; limit: number } | null; start: AskStart }) {
  const router = useRouter();
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [chatId, setChatId] = useState("newId" in start ? start.newId : "");
  const [initial, setInitial] = useState<UIMessage[] | null>("newId" in start ? [] : null);
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  const [shareId, setShareId] = useState<string | null>(null);
  const [mode, setMode] = useStoredPref<Mode>("nazar:mode", "simple", MODES);
  const [model] = useStoredPref<string>("nazar:model", "auto");
  const [historyOpen, setHistoryOpen] = useState(false);
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
    else history.replaceState(null, "", "/ask"); // drop ?q= so a reload doesn't ask again
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
        .filter((p) => p.toolName !== "searchTicker" && !PRIVATE_TOOLS.has(p.toolName)),
    );
    if (!parts.length) return toast("Nothing to export yet: this conversation has no data results.");
    trackClient("excel_download", { scope: "chat", sheets: parts.length }, chatId);
    const { downloadChatExcel } = await import("@/lib/excel");
    await downloadChatExcel(parts as { toolName: string; data: any }[], title);
  };

  const historyList = (
    <div className="space-y-1">
      <Button variant="secondary" size="sm" className="mb-2 w-full" onClick={fresh}>
        <Plus className="h-4 w-4" /> New question
      </Button>
      {chats.length === 0 && <p className="px-2 py-2 text-sm text-subtle">No questions yet.</p>}
      {chats.map((c) => (
        <div key={c.id} className={cn("group flex items-center rounded-[12px]", c.id === chatId ? "bg-surface-2" : "hover:bg-surface-2")}>
          <button onClick={() => open(c.id)} className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm text-text">
            {c.title}
          </button>
          <button
            onClick={async () => {
              await fetch(`/api/chats/${c.id}`, { method: "DELETE" });
              if (c.id === chatId) fresh();
              refresh();
            }}
            className="mr-1 rounded-full p-1.5 text-subtle opacity-100 hover:text-loss lg:opacity-0 lg:group-hover:opacity-100"
            aria-label={`Delete "${c.title}"`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-12.5rem)] gap-6 lg:h-[calc(100dvh-7rem)]">
      <aside className="no-print hidden w-60 shrink-0 overflow-y-auto lg:block">
        <div className="t-overline mb-2 px-1">Your questions</div>
        {historyList}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface-1 print-expand">
        <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setHistoryOpen(true)} className="rounded-[10px] p-2 text-muted hover:bg-surface-2 lg:hidden" aria-label="Question history">
              <History className="h-5 w-5" />
            </button>
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
          <div className="flex items-center gap-1.5">
            {remaining && <span className="num hidden text-[12px] text-subtle sm:inline">{remaining.remaining}/{remaining.limit} left today</span>}
            <Link href="/ask/research" className={buttonClass("ghost", "sm")} title="Research tools">
              <Wrench className="h-4 w-4" />
              <span className="hidden sm:inline">Tools</span>
            </Link>
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
          <div className="t-caption">Nazar research note · {new Date().toLocaleString()} · We explain; you decide. Not investment advice.</div>
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
              onOpenTools={() => router.push("/ask/research")}
              prompt={prompt}
              onFinished={() => {
                history.replaceState(null, "", `/ask?c=${chatId}`);
                refresh();
              }}
            />
          )}
        </div>
      </div>
      <Sheet open={historyOpen} onClose={() => setHistoryOpen(false)} title="Your questions">
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
    <Sheet open={open} onClose={onClose} title="Share this conversation" description="Anyone with the link sees a read-only copy. Your portfolio, Watching list and alerts are never included.">
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
