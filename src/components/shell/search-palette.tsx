"use client";
import { Eye, Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { addHref } from "@/components/stock/stock-actions";
import { apiCall } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { ASSET_META, type MarketClass } from "@/lib/instruments/asset-classes";

type Hit = { symbol: string; name: string; assetClass: MarketClass; sub: string | null };

/**
 * One search for anything Nazar knows: stocks, funds, ETFs, REITs, gold. Opens with ⌘K or Ctrl+K
 * anywhere, or from the search button. Enter opens the page; each result can also be added to a
 * portfolio or watched straight from here.
 */
export function SearchPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const mine = ++seq.current;
    const t = setTimeout(() => {
      apiCall<{ results: Hit[] }>(`/api/search?q=${encodeURIComponent(q.trim())}`)
        .then((j) => {
          if (mine !== seq.current) return;
          setHits(j.results.slice(0, 8));
          setSel(0);
        })
        .catch(() => undefined);
    }, 140);
    return () => clearTimeout(t);
  }, [q]);

  if (!open) return null;
  const shown = q.trim().length >= 2 ? hits : [];
  const close = () => {
    onOpenChange(false);
    setQ("");
    setHits([]);
  };
  const go = (href: string) => {
    close();
    router.push(href);
  };
  const watch = async (h: Hit) => {
    try {
      await apiCall("/api/watching", "POST", { symbols: [h.symbol] });
      toast(`Watching ${h.name}`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-modal="true" aria-label="Search" className="w-full max-w-lg overflow-hidden rounded-[20px] border border-line bg-surface-1 shadow-[var(--shadow-pop)]">
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
          <input
            ref={input}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              else if (e.key === "ArrowDown") setSel((s) => Math.min(s + 1, shown.length - 1));
              else if (e.key === "ArrowUp") setSel((s) => Math.max(s - 1, 0));
              else if (e.key === "Enter" && shown[sel]) go(`/stock/${encodeURIComponent(shown[sel].symbol)}`);
            }}
            placeholder="A stock, fund, ETF or gold"
            aria-label="Search for a stock, fund, ETF or gold"
            className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-subtle"
          />
          <button onClick={close} aria-label="Close search" className="rounded-full p-1.5 text-subtle hover:text-text">
            <X className="h-4 w-4" />
          </button>
        </div>
        {shown.length > 0 ? (
          <ul role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto py-1">
            {shown.map((h, i) => (
              <li key={h.symbol} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} className={cn("flex items-center gap-2 px-2", i === sel && "bg-surface-2")}>
                <button onClick={() => go(`/stock/${encodeURIComponent(h.symbol)}`)} className="min-w-0 flex-1 px-2 py-2.5 text-left">
                  <span className="block truncate text-sm font-medium text-text">{h.name}</span>
                  <span className="block truncate text-[12px] text-subtle">{h.sub ?? ASSET_META[h.assetClass].label}</span>
                </button>
                <button onClick={() => go(addHref(h))} aria-label={`Add ${h.name} to a portfolio`} title="Add to a portfolio" className="rounded-full p-2 text-muted hover:bg-accent-soft hover:text-accent">
                  <Plus className="h-4 w-4" />
                </button>
                <button onClick={() => watch(h)} aria-label={`Watch ${h.name}`} title="Watch" className="rounded-full p-2 text-muted hover:bg-surface-3 hover:text-text">
                  <Eye className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-4 text-sm text-muted">{q.trim().length >= 2 ? "Nothing found yet." : "Type a name or a ticker. Enter opens its page; + adds it to a portfolio."}</p>
        )}
      </div>
    </div>
  );
}
