"use client";
import { FileSpreadsheet, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { TOOL_CATALOG, TOOL_COUNT } from "@/lib/tool-catalog";
import { trackClient } from "@/lib/track-client";

/** "What can Stock AI do?" — every capability, what it's for, and a one-click example. */
export function ToolsCatalog({ open, onClose, onTry }: { open: boolean; onClose: () => void; onTry: (prompt: string) => void }) {
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);
  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return TOOL_CATALOG;
    return TOOL_CATALOG.map((g) => ({ ...g, items: g.items.filter((i) => `${i.name} ${i.description} ${i.example}`.toLowerCase().includes(s)) })).filter((g) => g.items.length);
  }, [q]);
  if (!open) return null;
  const models = TOOL_CATALOG.flatMap((g) => g.items).filter((i) => i.excel === "model").length;
  return (
    <div className="no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-3 sm:p-8" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="tools-title" className="w-full max-w-5xl rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 p-5">
          <div>
            <h2 id="tools-title" className="text-lg font-semibold text-zinc-100">What Stock AI can do</h2>
            <p className="mt-1 text-sm text-zinc-400">
              {TOOL_COUNT} research tools the AI agent picks from automatically. Just ask in plain English, Hindi or Hinglish. Every result can be downloaded as Excel;{" "}
              <span className="text-emerald-300">{models} are live models</span> with editable inputs and formulas.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="border-b border-zinc-800 px-5 py-3">
          <label className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
            <Search className="h-4 w-4 text-zinc-500" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tools, e.g. valuation, SIP, risk" className="flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600" />
          </label>
        </div>
        <div className="grid gap-6 p-5 md:grid-cols-2">
          {groups.map((g) => (
            <section key={g.id}>
              <h3 className="text-sm font-semibold text-zinc-100">{g.name}</h3>
              <p className="mb-2 text-xs text-zinc-500">{g.blurb}</p>
              <ul className="space-y-2">
                {g.items.map((i) => (
                  <li key={i.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-zinc-100">{i.name}</span>
                      {i.excel && (
                        <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${i.excel === "model" ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-800 text-zinc-400"}`}>
                          <FileSpreadsheet className="h-3 w-3" /> {i.excel === "model" ? "Excel model" : "Excel data"}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-zinc-400">{i.description}</p>
                    <button
                      onClick={() => {
                        trackClient("catalog_example", { item: i.id });
                        onTry(i.example);
                      }}
                      className="mt-2 w-full rounded-lg border border-zinc-800 px-2.5 py-1.5 text-left text-xs text-zinc-300 transition hover:border-emerald-500/50 hover:text-emerald-200"
                    >
                      Try: “{i.example}”
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {!groups.length && <div className="text-sm text-zinc-500">No tools match “{q}”.</div>}
        </div>
        <div className="border-t border-zinc-800 px-5 py-3 text-[11px] text-zinc-500">
          Excel models: blue cells are inputs you can change; black cells are formulas that recalculate. Data from Yahoo Finance, may be delayed. Not investment advice.
        </div>
      </div>
    </div>
  );
}
