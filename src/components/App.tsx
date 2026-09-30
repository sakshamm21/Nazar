"use client";
import type { UIMessage } from "ai";
import {
  Bell, BellRing, Check, ChevronDown, Copy, FileDown, FileSpreadsheet, Fingerprint, Wrench, GraduationCap, Link2, LineChart, Menu, MessageSquare, Plus, Share2, ShieldAlert, Sparkles, Star, Trash2, TrendingUp, X,
} from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionsContext } from "./actions";
import { Chat } from "./Chat";
import { ToolsCatalog } from "./ToolsCatalog";
import type { Rating } from "./Messages";
import { getFingerprint } from "@/lib/fingerprint";
import { fmt, pct, upDown } from "@/lib/format";
import { AUTO_MODEL, type ModelInfo } from "@/lib/models";
import { trackClient } from "@/lib/track-client";

type ChatRow = { id: string; title: string; updatedAt: string };
type Status = { openai: boolean; database: string };
type WatchItem = { symbol: string; name: string; currency: string | null; price: number | null; changePercent: number | null };
type AlertRow = { id: string; symbol: string; direction: "above" | "below"; target: number; currency: string | null; triggeredAt: string | null; triggeredPrice: number | null };
type Account = { user: { name: string; email: string | null; image: string | null; linked: string[] }; providers: { id: string; name: string }[]; limits: { remaining: number; limit: number } | null };
type Toast = { id: string; text: string };
type Mode = "simple" | "pro";
const CONSENT_KEY = "stockai:consent:v1";

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

async function json<T>(r: Response): Promise<T> {
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `Request failed (${r.status})`);
  return j as T;
}

export function App() {
  const { status } = useSession();
  const [authError, setAuthError] = useState<string | null>(null);
  const tried = useRef(false);

  useEffect(() => {
    if (status !== "unauthenticated" || tried.current) return;
    tried.current = true;
    (async () => {
      const fingerprint = await getFingerprint();
      const res = await signIn("fingerprint", { fingerprint, redirect: false });
      if (res?.error) setAuthError("Could not create a device session. Check the server logs / DATABASE_URL.");
      else window.location.reload();
    })();
  }, [status]);

  if (status !== "authenticated") {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 text-zinc-400">
        <Fingerprint className="h-8 w-8 animate-pulse text-emerald-400" />
        <div className="text-sm">{authError ?? "Recognising your device…"}</div>
        {authError && (
          <button className="text-xs text-emerald-400 underline" onClick={() => window.location.reload()}>
            Retry
          </button>
        )}
      </div>
    );
  }
  return <Workspace />;
}

function Workspace() {
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [usage, setUsage] = useState({ costUsd: 0, tokens: 0 });
  const [chatId, setChatId] = useState<string>("");
  const [initial, setInitial] = useState<UIMessage[] | null>(null);
  const [initialRatings, setInitialRatings] = useState<Record<string, Rating>>({});
  const [mode, setMode] = useState<Mode>("simple");
  const [consented, setConsented] = useState(true);
  const [shareId, setShareId] = useState<string | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [appStatus, setAppStatus] = useState<Status | null>(null);
  const [model, setModel] = useState<string>(AUTO_MODEL);
  const [drawer, setDrawer] = useState(false);
  const [tab, setTab] = useState<"history" | "watchlist" | "alerts">("history");
  const [account, setAccount] = useState<Account | null>(null);
  const [watch, setWatch] = useState<WatchItem[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [prompt, setPrompt] = useState<{ text: string; nonce: number } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [toolsOpen, setToolsOpen] = useState(false);
  const msgsRef = useRef<UIMessage[]>([]);
  const onMessages = useCallback((m: UIMessage[]) => {
    msgsRef.current = m;
  }, []);

  const toast = useCallback((text: string) => {
    const id = newId();
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 8000);
  }, []);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/chats");
    if (r.ok) {
      const j = await r.json();
      setChats(j.chats);
      setUsage(j.usage);
    }
    fetch("/api/account").then((r) => (r.ok ? r.json() : null)).then((a) => a && setAccount(a));
  }, []);
  const loadWatch = useCallback(() => fetch("/api/watchlist").then((r) => (r.ok ? r.json() : null)).then((j) => j && setWatch(j.items)), []);
  const loadAlerts = useCallback(() => fetch("/api/alerts").then((r) => (r.ok ? r.json() : null)).then((j) => j && setAlerts(j.alerts)), []);

  const open = useCallback(async (id: string) => {
    setDrawer(false);
    const r = await fetch(`/api/chats/${id}`);
    if (!r.ok) {
      setInitial([]);
      setChatId(newId());
      history.replaceState(null, "", "/");
      return;
    }
    const j = await r.json();
    setInitial(j.messages ?? []);
    setInitialRatings(j.feedback ?? {});
    setShareId(j.shareId ?? null);
    setChatId(id);
    history.replaceState(null, "", `?c=${id}`);
  }, []);

  const fresh = useCallback(() => {
    setDrawer(false);
    setInitial([]);
    setInitialRatings({});
    setShareId(null);
    setChatId(newId());
    history.replaceState(null, "", "/");
  }, []);

  useEffect(() => {
    refresh();
    loadWatch();
    loadAlerts();
    fetch("/api/models").then(async (r) => {
      const j = await r.json();
      setModels(j.models);
      setAppStatus(j.status);
    });
    try {
      const saved = localStorage.getItem("stockai:model");
      if (saved) setModel(saved);
      const savedMode = localStorage.getItem("stockai:mode");
      if (savedMode === "pro" || savedMode === "simple") setMode(savedMode);
      setConsented(localStorage.getItem(CONSENT_KEY) === "1");
    } catch {
      setConsented(false);
    }
    trackClient("app_open");
    const c = new URLSearchParams(location.search).get("c");
    if (c) open(c);
    else fresh();
  }, [refresh, open, fresh, loadWatch, loadAlerts]);

  // Price alerts: poll while the app is open (and on load, to surface alerts the cron job caught).
  const hasActive = alerts.some((a) => !a.triggeredAt);
  useEffect(() => {
    const check = async () => {
      const r = await fetch("/api/alerts/check").catch(() => null);
      if (!r?.ok) return;
      const { fresh: fired } = (await r.json()) as { fresh: AlertRow[] };
      if (!fired.length) return;
      for (const a of fired) {
        const text = `${a.symbol} ${a.direction === "above" ? "rose above" : "fell below"} ${fmt(a.target, "currency", a.currency ?? "USD")} (now ${fmt(a.triggeredPrice, "currency", a.currency ?? "USD")})`;
        toast(`🔔 ${text}`);
        try {
          if ("Notification" in window && Notification.permission === "granted") new Notification("Stock AI price alert", { body: text });
        } catch {}
      }
      loadAlerts();
    };
    check();
    if (!hasActive) return;
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, [hasActive, loadAlerts, toast]);

  const pickModel = (id: string) => {
    setModel(id);
    try {
      localStorage.setItem("stockai:model", id);
    } catch {}
  };

  const pickMode = (m: Mode) => {
    setMode(m);
    trackClient("mode_change", { mode: m });
    try {
      localStorage.setItem("stockai:mode", m);
    } catch {}
  };

  const exportPdf = () => {
    trackClient("export_pdf", {}, chatId);
    window.print();
  };

  const openTools = useCallback(() => {
    setToolsOpen(true);
    trackClient("tools_opened");
  }, []);

  /** Every successful (non-private) tool result in this chat → one workbook. */
  const exportExcel = async () => {
    const parts = msgsRef.current.flatMap((m) =>
      (m.parts as { type: string; state?: string; output?: unknown }[])
        .filter((p) => p.type.startsWith("tool-") && p.state === "output-available" && p.output && typeof p.output === "object" && !("error" in (p.output as object)))
        .map((p) => ({ toolName: p.type.slice(5), data: p.output }))
        .filter((p) => !["searchTicker", "getWatchlist", "addToWatchlist", "removeFromWatchlist", "createPriceAlert", "listPriceAlerts", "deletePriceAlerts"].includes(p.toolName)),
    );
    if (!parts.length) return toast("Nothing to export yet: this chat has no data results.");
    trackClient("excel_download", { scope: "chat", sheets: parts.length }, chatId);
    const { downloadChatExcel } = await import("@/lib/excel");
    await downloadChatExcel(parts, title);
  };

  const accept = () => {
    setConsented(true);
    trackClient("disclaimer_accepted");
    try {
      localStorage.setItem(CONSENT_KEY, "1");
    } catch {}
  };

  const remove = async (id: string) => {
    await fetch(`/api/chats/${id}`, { method: "DELETE" });
    if (id === chatId) fresh();
    refresh();
  };

  const ask = (text: string) => {
    setDrawer(false);
    setPrompt({ text, nonce: Date.now() });
  };

  const watched = useMemo(() => new Set(watch.map((w) => w.symbol)), [watch]);
  const toggleWatch = useCallback(
    async (symbol: string) => {
      try {
        const j = await json<{ items: WatchItem[]; notFound?: string[]; full?: boolean }>(
          await fetch("/api/watchlist", { method: watched.has(symbol) ? "DELETE" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ symbols: [symbol] }) }),
        );
        setWatch(j.items);
        if (j.notFound?.length) toast(`Couldn't find ${j.notFound.join(", ")}. Indian stocks need .NS or .BO (e.g. TCS.NS).`);
        else if (j.full) toast("Your watchlist is full (50 stocks).");
      } catch (e) {
        toast((e as Error).message);
      }
    },
    [watched, toast],
  );

  const addWatch = useCallback(
    async (symbol: string) => {
      if (watched.has(symbol)) return toast(`${symbol} is already in your watchlist.`);
      try {
        const j = await json<{ items: WatchItem[]; notFound?: string[]; full?: boolean }>(
          await fetch("/api/watchlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ symbols: [symbol] }) }),
        );
        setWatch(j.items);
        if (j.notFound?.length) toast(`Couldn't find ${j.notFound.join(", ")}. Indian stocks need .NS or .BO (e.g. TCS.NS).`);
        else if (j.full) toast("Your watchlist is full (50 stocks).");
      } catch (e) {
        toast((e as Error).message);
      }
    },
    [watched, toast],
  );

  const actions = useMemo(() => ({ watch: toggleWatch, watched }), [toggleWatch, watched]);
  const title = chats.find((c) => c.id === chatId)?.title ?? "New research";
  const hasMessages = (initial?.length ?? 0) > 0 || chats.some((c) => c.id === chatId);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-zinc-950">
          <TrendingUp className="h-4.5 w-4.5" />
        </div>
        <div>
          <div className="text-sm font-semibold">Stock AI</div>
          <div className="text-[11px] text-zinc-500">Equity research copilot</div>
        </div>
      </div>
      <div className="px-3">
        <button onClick={fresh} className="flex w-full items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900">
          <Plus className="h-4 w-4" /> New research
        </button>
      </div>
      <div className="mx-3 mt-3 grid grid-cols-3 rounded-lg bg-zinc-900 p-0.5 text-xs">
        {([["history", "History"], ["watchlist", "Watchlist"], ["alerts", "Alerts"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-md py-1.5 ${tab === k ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}>
            {l}
            {k === "alerts" && hasActive && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400 align-middle" />}
          </button>
        ))}
      </div>
      <div className="mt-2 flex-1 overflow-y-auto px-2">
        {tab === "history" && (
          <>
            {chats.map((c) => (
              <div key={c.id} className={`group flex items-center rounded-lg ${c.id === chatId ? "bg-zinc-800/80" : "hover:bg-zinc-900"}`}>
                <button onClick={() => open(c.id)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm text-zinc-300">
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                  <span className="truncate">{c.title}</span>
                </button>
                <button onClick={() => remove(c.id)} className="mr-1 rounded p-1 text-zinc-500 hover:text-rose-400 md:hidden md:group-hover:block" aria-label="Delete chat">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {chats.length === 0 && <div className="px-2 py-2 text-xs text-zinc-600">No conversations yet.</div>}
          </>
        )}
        {tab === "watchlist" && <WatchlistPanel items={watch} onAsk={ask} onRemove={toggleWatch} onAdd={addWatch} />}
        {tab === "alerts" && <AlertsPanel alerts={alerts} onChange={setAlerts} toast={toast} />}
      </div>
      <AccountFooter account={account} usage={usage} status={appStatus} />
    </div>
  );

  return (
    <ActionsContext.Provider value={actions}>
      <div className="flex h-dvh print-expand">
        <aside className="no-print hidden w-64 shrink-0 border-r border-zinc-800/80 bg-zinc-950 md:block">{sidebar}</aside>
        {drawer && (
          <div className="no-print fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 border-r border-zinc-800 bg-zinc-950">{sidebar}</aside>
          </div>
        )}
        <main className="flex min-w-0 flex-1 flex-col print-expand">
          <header className="no-print flex items-center justify-between gap-2 border-b border-zinc-800/80 px-3 py-2">
            <button className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-900 md:hidden" onClick={() => setDrawer(true)} aria-label="Menu">
              {drawer ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="hidden min-w-0 flex-1 truncate text-sm text-zinc-500 md:block">{title}</div>
            <div className="flex items-center gap-1.5">
              <button onClick={openTools} className="flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900" title="See every tool and analysis Stock AI can run">
                <Wrench className="h-4 w-4" /> <span className="hidden sm:inline">Tools</span>
              </button>
              {hasMessages && (
                <>
                  <button onClick={exportExcel} className="flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900" title="Download every analysis in this chat as one Excel workbook (models keep live formulas)">
                    <FileSpreadsheet className="h-4 w-4" /> <span className="hidden sm:inline">Excel</span>
                  </button>
                  <SharePopover chatId={chatId} shareId={shareId} onChange={setShareId} toast={toast} />
                  <button onClick={exportPdf} className="flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900" title="Export as PDF (choose “Save as PDF” in the print dialog)">
                    <FileDown className="h-4 w-4" /> <span className="hidden sm:inline">PDF</span>
                  </button>
                </>
              )}
              <ModeToggle value={mode} onChange={pickMode} />
              <ModelPicker models={models} value={model} onChange={pickModel} />
            </div>
          </header>
          <div className="print-only mb-4 border-b border-zinc-700 pb-3">
            <div className="text-lg font-semibold">{title}</div>
            <div className="text-xs text-zinc-400">Stock AI research note · {new Date().toLocaleString()} · Market data via Yahoo Finance, may be delayed. Not investment advice.</div>
          </div>
          {appStatus && !appStatus.openai && (
            <div className="no-print border-b border-amber-900/50 bg-amber-950/30 px-4 py-2 text-center text-xs text-amber-300">
              OPENAI_API_KEY is not configured. Add it to <code>.env.local</code> (or Vercel env vars) and restart.
            </div>
          )}
          <div className="min-h-0 flex-1 print-expand">
            {chatId && initial && (
              <Chat
                key={chatId}
                chatId={chatId}
                initialMessages={initial}
                initialRatings={initialRatings}
                model={model}
                mode={mode}
                onMessages={onMessages}
                onOpenTools={openTools}
                prompt={prompt}
                onFinished={() => {
                  history.replaceState(null, "", `?c=${chatId}`);
                  refresh();
                  loadWatch();
                  loadAlerts();
                }}
              />
            )}
          </div>
        </main>
        {!consented && <Disclaimer onAccept={accept} />}
        <ToolsCatalog open={toolsOpen} onClose={() => setToolsOpen(false)} onTry={(p) => { setToolsOpen(false); ask(p); }} />
        <div className="no-print pointer-events-none fixed bottom-20 right-4 z-50 flex max-w-sm flex-col gap-2">
          {toasts.map((t) => (
            <div key={t.id} className="pointer-events-auto rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 shadow-xl">{t.text}</div>
          ))}
        </div>
      </div>
    </ActionsContext.Provider>
  );
}

/* ---------------- Sidebar panels ---------------- */

function WatchlistPanel({ items, onAsk, onRemove, onAdd }: { items: WatchItem[]; onAsk: (t: string) => void; onRemove: (s: string) => void; onAdd: (s: string) => void }) {
  const [sym, setSym] = useState("");
  return (
    <div className="px-1">
      <form
        className="mb-2 flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          const s = sym.trim().toUpperCase();
          if (s) onAdd(s);
          setSym("");
        }}
      >
        <input value={sym} onChange={(e) => setSym(e.target.value)} placeholder="Add ticker, e.g. TCS.NS" maxLength={20} className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/60" />
        <button className="rounded-md bg-emerald-500 px-2 text-zinc-950 hover:bg-emerald-400" aria-label="Add to watchlist">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </form>
      {items.map((w) => (
        <div key={w.symbol} className="group flex items-center rounded-lg hover:bg-zinc-900">
          <button onClick={() => onAsk(`Analyze ${w.symbol}`)} className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2 py-1.5 text-left">
            <span className="min-w-0">
              <span className="block font-mono text-xs font-semibold text-zinc-200">{w.symbol}</span>
              <span className="block truncate text-[10px] text-zinc-500">{w.name}</span>
            </span>
            <span className="text-right">
              <span className="block text-xs tabular-nums text-zinc-200">{fmt(w.price, "currency", w.currency ?? "USD")}</span>
              <span className={`block text-[10px] tabular-nums ${upDown(w.changePercent)}`}>{pct(w.changePercent, true)}</span>
            </span>
          </button>
          <button onClick={() => onRemove(w.symbol)} className="mr-1 rounded p-1 text-zinc-600 hover:text-rose-400 md:hidden md:group-hover:block" aria-label={`Remove ${w.symbol}`}>
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      {items.length === 0 && (
        <div className="px-2 py-2 text-xs leading-relaxed text-zinc-600">
          <Star className="mb-1 h-3.5 w-3.5" />
          Track stocks here. Add a ticker above, tap ★ on a quote card, or ask “add Infosys to my watchlist”.
        </div>
      )}
      {items.length > 0 && (
        <button onClick={() => onAsk("Give me a quick update on the stocks in my watchlist: what moved and why?")} className="mt-2 w-full rounded-md border border-zinc-800 px-2 py-1.5 text-xs text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200">
          Summarise my watchlist
        </button>
      )}
    </div>
  );
}

function AlertsPanel({ alerts, onChange, toast }: { alerts: AlertRow[]; onChange: (a: AlertRow[]) => void; toast: (t: string) => void }) {
  const [symbol, setSymbol] = useState("");
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const j = await json<{ alerts: AlertRow[]; warning?: string }>(
        await fetch("/api/alerts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ symbol: symbol.trim(), direction, target: Number(target) }) }),
      );
      onChange(j.alerts);
      setSymbol("");
      setTarget("");
      if (j.warning) toast(j.warning);
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const del = async (id: string) => {
    const j = await json<{ alerts: AlertRow[] }>(await fetch("/api/alerts", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: [id] }) }));
    onChange(j.alerts);
  };
  return (
    <div className="px-1">
      <form onSubmit={create} className="mb-2 space-y-1">
        <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="Ticker, e.g. RELIANCE.NS" maxLength={20} required className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/60" />
        <div className="flex gap-1">
          <select value={direction} onChange={(e) => setDirection(e.target.value as "above" | "below")} className="rounded-md border border-zinc-800 bg-zinc-900 px-1.5 py-1.5 text-xs text-zinc-200 outline-none">
            <option value="above">rises above</option>
            <option value="below">falls below</option>
          </select>
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Price" inputMode="decimal" type="number" step="any" min="0" required className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500/60" />
          <button disabled={busy} className="rounded-md bg-emerald-500 px-2 text-zinc-950 hover:bg-emerald-400 disabled:opacity-50" aria-label="Create alert">
            <Bell className="h-3.5 w-3.5" />
          </button>
        </div>
      </form>
      {alerts.map((a) => (
        <div key={a.id} className="group flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-900">
          <div className="min-w-0 text-xs">
            <div className="flex items-center gap-1">
              {a.triggeredAt ? <BellRing className="h-3 w-3 text-amber-400" /> : <Bell className="h-3 w-3 text-zinc-500" />}
              <span className="font-mono font-semibold text-zinc-200">{a.symbol}</span>
            </div>
            <div className="text-[10px] text-zinc-500">
              {a.direction === "above" ? "above" : "below"} {fmt(a.target, "currency", a.currency ?? "USD")}
              {a.triggeredAt && <span className="text-amber-300"> · hit {fmt(a.triggeredPrice, "currency", a.currency ?? "USD")}</span>}
            </div>
          </div>
          <button onClick={() => del(a.id)} className="rounded p-1 text-zinc-600 hover:text-rose-400 md:hidden md:group-hover:block" aria-label="Delete alert">
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      {alerts.length === 0 && (
        <div className="px-2 py-2 text-xs leading-relaxed text-zinc-600">
          Get notified when a stock crosses a price. Alerts are checked every minute while Stock AI is open, and once a day in the background.
        </div>
      )}
    </div>
  );
}

function AccountFooter({ account, usage, status }: { account: Account | null; usage: { costUsd: number; tokens: number }; status: Status | null }) {
  const linked = (account?.user.linked.length ?? 0) > 0;
  const connect = async (provider: string) => {
    await fetch("/api/account/link", { method: "POST" });
    await signIn(provider, { callbackUrl: location.href });
  };
  return (
    <div className="border-t border-zinc-800/80 px-4 py-3 text-xs text-zinc-500">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          {account?.user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={account.user.image} alt="" className="h-4 w-4 rounded-full" />
          ) : (
            <Fingerprint className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          )}
          <span className="truncate" title={account?.user.email ?? "Recognised by device fingerprint"}>{account?.user.name ?? "…"}</span>
        </span>
        {linked && (
          <button onClick={() => signOut({ redirect: false }).then(() => location.reload())} className="shrink-0 hover:text-zinc-300">
            Sign out
          </button>
        )}
      </div>
      {!linked && account && account.providers.length > 0 && (
        <div className="mt-2 space-y-1">
          <div className="text-[11px] text-zinc-600">Sign in to sync your research across devices:</div>
          <div className="flex gap-1">
            {account.providers.map((p) => (
              <button key={p.id} onClick={() => connect(p.id)} className="flex-1 rounded-md border border-zinc-800 px-2 py-1 text-zinc-300 hover:bg-zinc-900">
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {account?.limits && (
        <div className="mt-1.5">
          <div className="flex justify-between"><span>Questions today</span><span className="tabular-nums">{account.limits.remaining} / {account.limits.limit} left</span></div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full bg-emerald-500" style={{ width: `${(account.limits.remaining / account.limits.limit) * 100}%` }} />
          </div>
        </div>
      )}
      <div className="mt-1.5 tabular-nums">Spend ${usage.costUsd.toFixed(4)} · {usage.tokens.toLocaleString()} tokens</div>
      {status && status.database !== "postgres" && <div className="mt-0.5 text-zinc-600">DB: {status.database}</div>}
    </div>
  );
}

function SharePopover({ chatId, shareId, onChange, toast }: { chatId: string; shareId: string | null; onChange: (s: string | null) => void; toast: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const url = shareId ? `${location.origin}/s/${shareId}` : "";
  const create = async () => {
    try {
      const j = await json<{ shareId: string }>(await fetch(`/api/chats/${chatId}/share`, { method: "POST" }));
      onChange(j.shareId);
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const revoke = async () => {
    await fetch(`/api/chats/${chatId}/share`, { method: "DELETE" });
    onChange(null);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("Couldn't copy. Select the link and copy it manually.");
    }
  };
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm hover:bg-zinc-900 ${shareId ? "border-emerald-700/60 text-emerald-300" : "border-zinc-800 text-zinc-300"}`}>
        <Share2 className="h-4 w-4" /> <span className="hidden sm:inline">Share</span>
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[320px] max-w-[calc(100vw-24px)] rounded-xl border border-zinc-800 bg-zinc-950 p-3 shadow-2xl">
          <div className="text-sm font-medium text-zinc-100">Share this research</div>
          <div className="mt-1 text-xs text-zinc-500">Anyone with the link can view a read-only copy. Your watchlist and alerts are never included.</div>
          {shareId ? (
            <>
              <div className="mt-3 flex gap-1">
                <input readOnly value={url} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300" />
                <button onClick={copy} className="rounded-md bg-emerald-500 px-2 text-zinc-950 hover:bg-emerald-400" aria-label="Copy link">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <button onClick={revoke} className="mt-2 text-xs text-rose-400 hover:underline">Stop sharing</button>
            </>
          ) : (
            <button onClick={create} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md bg-emerald-500 py-1.5 text-sm font-medium text-zinc-950 hover:bg-emerald-400">
              <Link2 className="h-4 w-4" /> Create public link
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ModeToggle({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="flex rounded-lg border border-zinc-800 p-0.5 text-xs" role="radiogroup" aria-label="Answer style">
      {([
        ["simple", "Simple", GraduationCap, "Plain-language answers that explain jargon (for newer investors)"],
        ["pro", "Pro", LineChart, "Dense, quantitative answers (for experienced investors)"],
      ] as const).map(([k, label, Icon, tip]) => (
        <button key={k} role="radio" aria-checked={value === k} title={tip} onClick={() => onChange(k)} className={`flex items-center gap-1 rounded-md px-2 py-1 ${value === k ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}>
          <Icon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

/** First-run disclaimer: research & education, not advice (SEBI context for Indian users). */
function Disclaimer({ onAccept }: { onAccept: () => void }) {
  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="disclaimer-title" className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-400" />
          <h2 id="disclaimer-title" className="text-base font-semibold text-zinc-100">Before you start</h2>
        </div>
        <ul className="mt-3 space-y-2 text-sm text-zinc-300">
          <li>• Stock AI is a <b>research and learning tool</b>. It is <b>not investment advice</b> and not a SEBI-registered investment adviser.</li>
          <li>• Market data comes from Yahoo Finance and <b>may be delayed or occasionally wrong</b>. Check important numbers before acting.</li>
          <li>• AI can make mistakes. Use the “Based on N live data calls” link under each answer to see what it looked at.</li>
          <li>• No sign-up needed: your device is recognised automatically. You can sign in later to sync across devices.</li>
        </ul>
        <button onClick={onAccept} autoFocus className="mt-5 w-full rounded-lg bg-emerald-500 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400">
          I understand, let&apos;s go
        </button>
      </div>
    </div>
  );
}

function ModelPicker({ models, value, onChange }: { models: ModelInfo[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const current = models.find((m) => m.id === value);
  const dots = (n: number) => "●".repeat(n) + "○".repeat(5 - n);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-900">
        {value === AUTO_MODEL || !current ? <><Sparkles className="h-3.5 w-3.5 text-emerald-400" /> Auto</> : current.label}
        <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[340px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
          <div className="border-b border-zinc-800 px-3 py-2 text-[11px] uppercase tracking-wide text-zinc-500">Cost · performance</div>
          <button onClick={() => { onChange(AUTO_MODEL); setOpen(false); }} className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-zinc-900">
            <Sparkles className="mt-0.5 h-4 w-4 text-emerald-400" />
            <div className="flex-1">
              <div className="text-sm text-zinc-100">Auto</div>
              <div className="text-xs text-zinc-500">Routes each question to the cheapest model that can handle it.</div>
            </div>
            {value === AUTO_MODEL && <Check className="h-4 w-4 text-emerald-400" />}
          </button>
          <div className="max-h-[60vh] overflow-y-auto">
            {models.map((m) => (
              <button key={m.id} onClick={() => { onChange(m.id); setOpen(false); }} className="flex w-full items-start gap-3 border-t border-zinc-900 px-3 py-2.5 text-left hover:bg-zinc-900">
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${m.tier === "economy" ? "bg-emerald-400" : m.tier === "balanced" ? "bg-sky-400" : "bg-violet-400"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-zinc-100">{m.label}</span>
                    <span className="text-[11px] tabular-nums text-zinc-500">${m.inputCost} / ${m.outputCost} per 1M</span>
                  </div>
                  <div className="text-xs text-zinc-500">{m.blurb}</div>
                  <div className="mt-0.5 flex gap-3 text-[10px] tracking-widest text-zinc-600">
                    <span>SPEED <span className="text-zinc-400">{dots(m.speed)}</span></span>
                    <span>QUALITY <span className="text-zinc-400">{dots(m.quality)}</span></span>
                  </div>
                </div>
                {value === m.id && <Check className="mt-0.5 h-4 w-4 text-emerald-400" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
