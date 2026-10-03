"use client";
import { ArrowLeft, Check, Plus, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { IrisLoader } from "@/components/rings/iris";
import { Button } from "@/components/ui/button";
import { FormAlert, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { apiCall } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { inr } from "@/lib/format";
import { ASSET_META, shortCode, type ManualClass, type MarketClass } from "@/lib/instruments/asset-classes";
import { AssetIcon, ClassBadge } from "./asset-ui";
import { MANUAL_KINDS, ManualFields, emptyDraft, manualPayload, today, type ManualDraft } from "./manual-form";

export type Hit = { symbol: string; name: string; assetClass: MarketClass; isin: string | null; sub: string | null };
export type Held = { symbol: string; quantity: number; avgPrice: number };

/** One picked instrument waiting to be added. `mode` "amount" is for funds: rupees in, units worked out. */
type Line = { hit: Hit; mode: "units" | "amount"; qty: string; price: string; invested: string; current: string; date: string; live: number | null | undefined };

const TABS: { id: "all" | MarketClass | "manual"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "stock", label: "Stocks" },
  { id: "mf", label: "Mutual funds" },
  { id: "etf", label: "ETFs" },
  { id: "reit", label: "REITs" },
  { id: "gold", label: "Gold & silver" },
  { id: "manual", label: "Deposits, PF & more" },
];

const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/,/g, "")));
const fmtUnits = (x: number) => x.toLocaleString("en-IN", { maximumFractionDigits: 3 });

/** Units and average price for a line, however it was entered; null until it is complete. */
function resolved(l: Line): { quantity: number; avgPrice: number } | null {
  if (l.mode === "units") {
    const quantity = num(l.qty), avgPrice = num(l.price);
    return quantity > 0 && avgPrice > 0 ? { quantity, avgPrice } : null;
  }
  // Amount mode: today's value ÷ today's NAV gives the units; what was paid ÷ units gives the average.
  const invested = num(l.invested), current = l.current.trim() === "" ? NaN : num(l.current);
  if (!(invested > 0) || !l.live) return null;
  const quantity = (current > 0 ? current : invested) / l.live;
  return quantity > 0 ? { quantity, avgPrice: invested / quantity } : null;
}

/**
 * The portfolio builder: search every asset class in one place, pick several, fill in what you
 * hold and add them together. Deposits, provident funds, property and cash have their own tab.
 */
export function AssetBuilder({ open, onClose, portfolioId, held, initialTab = "all" }: { open: boolean; onClose: () => void; portfolioId: string | null; held: Held[]; initialTab?: (typeof TABS)[number]["id"] }) {
  const router = useRouter();
  const [tab, setTab] = useState(initialTab);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [manual, setManual] = useState<ManualDraft | null>(null);
  const [manuals, setManuals] = useState<ManualDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  // Reset when the sheet is opened (also picks up the tab the opener asked for).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTab(initialTab);
      setQ("");
      setHits([]);
      setLines([]);
      setManual(null);
      setManuals([]);
      setError(null);
    }
  }

  useEffect(() => {
    if (tab === "manual" || q.trim().length < 2) return;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setSearching(true);
      const j = await apiCall<{ results: Hit[] }>(`/api/search?q=${encodeURIComponent(q.trim())}${tab === "all" ? "" : `&type=${tab}`}`).catch(() => ({ results: [] }));
      if (mine !== seq.current) return;
      setHits(j.results);
      setSearching(false);
    }, 160);
    return () => clearTimeout(t);
  }, [q, tab]);
  const shown = tab !== "manual" && q.trim().length >= 2 ? hits : [];

  const patch = (symbol: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.hit.symbol === symbol ? { ...l, ...p } : l)));
  const pick = (hit: Hit) => {
    if (lines.some((l) => l.hit.symbol === hit.symbol)) return setLines((ls) => ls.filter((l) => l.hit.symbol !== hit.symbol));
    setLines((ls) => [...ls, { hit, mode: hit.assetClass === "mf" ? "amount" : "units", qty: "", price: "", invested: "", current: "", date: "", live: undefined }]);
    setError(null);
    // The latest price pre-fills the form and turns a rupee amount into units.
    apiCall<{ price: number | null }>(`/api/price?symbol=${encodeURIComponent(hit.symbol)}`)
      .then((j) => patch(hit.symbol, { live: j.price }))
      .catch(() => patch(hit.symbol, { live: null }));
  };

  const ready = lines.map((l) => ({ l, r: resolved(l) }));
  const count = lines.length + manuals.length + (manual ? 1 : 0);
  const totalInvested = ready.reduce((a, x) => a + (x.r ? x.r.quantity * x.r.avgPrice : 0), 0) + [...manuals, ...(manual ? [manual] : [])].reduce((a, m) => a + (num(m.invested) || 0), 0);

  const submit = async () => {
    if (!portfolioId) return;
    const incomplete = ready.find((x) => !x.r);
    if (incomplete) return setError(incomplete.l.mode === "amount" && !incomplete.l.live ? `Nazar couldn't get today's NAV for ${incomplete.l.hit.name}. Switch it to "Units" and enter the units and average NAV.` : `Fill in ${incomplete.l.hit.name}, or remove it.`);
    const drafts = [...manuals, ...(manual ? [manual] : [])];
    const payloads = drafts.map(manualPayload);
    const bad = payloads.find((p) => !p.ok);
    if (bad && !bad.ok) return setError(bad.error);
    if (!ready.length && !payloads.length) return;
    setBusy(true);
    setError(null);
    try {
      if (ready.length)
        await apiCall(`/api/portfolios/${portfolioId}/holdings`, "POST", {
          mode: "add",
          holdings: ready.map(({ l, r }) => ({ symbol: l.hit.symbol, quantity: r!.quantity, avgPrice: r!.avgPrice, buyDate: l.date || null, isin: l.hit.isin, rawName: l.hit.name, source: "manual" })),
        });
      for (const p of payloads) if (p.ok) await apiCall(`/api/portfolios/${portfolioId}/assets`, "POST", p.body);
      toast(count === 1 ? `${lines[0]?.hit.name ?? drafts[0].name} added. Nazar is watching it now.` : `${count} holdings added. Nazar is watching them now.`);
      onClose();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      wide
      title="Add to your portfolio"
      description="Search stocks, mutual funds, ETFs, REITs and gold, or add deposits, PF, property and cash. Pick as many as you like."
      footer={
        count > 0 && (
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-muted">
              {count} selected{totalInvested > 0 && <> · <span className="num text-text">{inr(totalInvested)}</span> invested</>}
            </div>
            <Button loading={busy} onClick={submit}>
              Add {count === 1 ? "to portfolio" : `${count} to portfolio`}
            </Button>
          </div>
        )
      }
    >
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Asset type">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => { setTab(t.id); setManual(null); }} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors", tab === t.id ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:text-text")}>
            {t.label}
          </button>
        ))}
      </div>

      {tab !== "manual" ? (
        <div className="mt-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input autoFocus aria-label="Search" className="pl-10" placeholder={tab === "mf" ? "Fund name, e.g. Parag Parikh Flexi Cap" : tab === "gold" ? "Gold, silver or sovereign gold bond" : "Name or symbol, e.g. Infosys, Nifty BeES, HDFC Flexi Cap"} value={q} onChange={(e) => setQ(e.target.value)} />
            {searching && (
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
                <IrisLoader size={18} label="Searching" />
              </span>
            )}
          </div>
          {shown.length > 0 && (
            <ul className="mt-2 max-h-72 overflow-y-auto rounded-[14px] border border-line" role="listbox" aria-label="Results">
              {shown.map((h) => {
                const on = lines.some((l) => l.hit.symbol === h.symbol);
                return (
                  <li key={h.symbol} className="border-b border-line last:border-0">
                    <button type="button" role="option" aria-selected={on} onClick={() => pick(h)} className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2", on && "bg-accent-soft")}>
                      <AssetIcon assetClass={h.assetClass} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-text">{h.name}</span>
                        <span className="block truncate text-[12px] text-subtle">{[h.assetClass === "mf" || h.assetClass === "gold" ? null : shortCode(h.symbol), h.sub].filter(Boolean).join(" · ") || ASSET_META[h.assetClass].label}</span>
                      </span>
                      <ClassBadge assetClass={h.assetClass} />
                      <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full border", on ? "border-accent bg-accent text-accent-ink" : "border-line text-muted")}>{on ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {q.trim().length >= 2 && !searching && shown.length === 0 && <p className="mt-3 text-sm text-muted">Nothing found for “{q.trim()}”. Try the fund house or the NSE symbol. For a deposit, PF or property, use the “Deposits, PF &amp; more” tab.</p>}
          {q.trim().length < 2 && lines.length === 0 && <p className="mt-3 text-sm text-muted">Start typing to search {tab === "all" ? "about 11,000 stocks, funds, ETFs and more" : ASSET_META[tab].plural.toLowerCase()}.</p>}
        </div>
      ) : manual ? (
        <div className="mt-4">
          <button onClick={() => setManual(null)} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
            <ArrowLeft className="h-4 w-4" /> Choose a different type
          </button>
          <ManualFields draft={manual} onChange={setManual} idPrefix="new" />
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => {
              const p = manualPayload(manual);
              if (!p.ok) return setError(p.error);
              setManuals((m) => [...m, manual]);
              setManual(null);
              setError(null);
            }}
          >
            <Plus className="h-4 w-4" /> Save and add another
          </Button>
        </div>
      ) : (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {MANUAL_KINDS.map((k) => (
            <li key={k.assetClass}>
              <button onClick={() => { setManual(emptyDraft(k.assetClass as ManualClass)); setError(null); }} className="flex h-full w-full items-start gap-3 rounded-[14px] border border-line p-3.5 text-left transition-colors hover:bg-surface-2">
                <AssetIcon assetClass={k.assetClass} />
                <span>
                  <span className="block text-sm font-medium text-text">{k.title}</span>
                  <span className="mt-0.5 block text-[13px] text-muted">{k.blurb}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {(lines.length > 0 || manuals.length > 0) && (
        <div className="mt-5">
          <div className="t-overline">Selected</div>
          <ul className="mt-2 space-y-3">
            {lines.map((l) => (
              <LineEditor key={l.hit.symbol} line={l} held={held.find((h) => h.symbol === l.hit.symbol) ?? null} onChange={(p) => patch(l.hit.symbol, p)} onRemove={() => setLines((ls) => ls.filter((x) => x.hit.symbol !== l.hit.symbol))} />
            ))}
            {manuals.map((m, i) => (
              <li key={i} className="flex items-center gap-3 rounded-[14px] border border-line bg-surface-2 p-3">
                <AssetIcon assetClass={m.assetClass} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text">{m.name}</span>
                  <span className="num block text-[12px] text-subtle">{ASSET_META[m.assetClass].label} · {inr(num(m.value) || num(m.invested))}</span>
                </span>
                <button aria-label={`Remove ${m.name}`} onClick={() => setManuals((ms) => ms.filter((_, k) => k !== i))} className="rounded-full p-2 text-subtle hover:bg-surface-3 hover:text-text">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4">
        <FormAlert message={error} />
      </div>
    </Sheet>
  );
}

function LineEditor({ line: l, held, onChange, onRemove }: { line: Line; held: Held | null; onChange: (p: Partial<Line>) => void; onRemove: () => void }) {
  const meta = ASSET_META[l.hit.assetClass];
  const r = resolved(l);
  const id = (s: string) => `${l.hit.symbol}-${s}`;
  const small = "h-10 text-sm";
  return (
    <li className="rounded-[14px] border border-line bg-surface-2 p-3.5">
      <div className="flex items-start gap-3">
        <AssetIcon assetClass={l.hit.assetClass} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-text">{l.hit.name}</div>
          <div className="num text-[12px] text-subtle">
            {l.live === undefined ? "Getting the latest price…" : l.live == null ? "Latest price unavailable right now" : `${l.hit.assetClass === "mf" ? "NAV" : "Price"} ${inr(l.live, { decimals: 2 })}${l.hit.assetClass === "gold" ? " per gram (indicative)" : ""}`}
          </div>
        </div>
        <button aria-label={`Remove ${l.hit.name}`} onClick={onRemove} className="-mr-1 -mt-1 rounded-full p-2 text-subtle hover:bg-surface-3 hover:text-text">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {l.hit.assetClass === "mf" && (
        <div className="mt-3 inline-flex rounded-[10px] border border-line p-0.5 text-xs font-medium" role="radiogroup" aria-label="How to enter this fund">
          {(["amount", "units"] as const).map((m) => (
            <button key={m} role="radio" aria-checked={l.mode === m} onClick={() => onChange({ mode: m })} className={cn("rounded-[8px] px-2.5 py-1", l.mode === m ? "bg-surface-1 text-text shadow-[var(--shadow-card)]" : "text-muted")}>
              {m === "amount" ? "I know the amount" : "I know the units"}
            </button>
          ))}
        </div>
      )}

      {l.mode === "amount" ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Labelled label="Amount invested (₹)" htmlFor={id("inv")}>
            <Input id={id("inv")} className={small} inputMode="decimal" value={l.invested} onChange={(e) => onChange({ invested: e.target.value })} placeholder="50,000" />
          </Labelled>
          <Labelled label="Worth today (₹)" htmlFor={id("cur")}>
            <Input id={id("cur")} className={small} inputMode="decimal" value={l.current} onChange={(e) => onChange({ current: e.target.value })} placeholder="from your app" />
          </Labelled>
          <Labelled label="First invested (optional)" htmlFor={id("date")} className="col-span-2 sm:col-span-1">
            <Input id={id("date")} className={small} type="date" max={today()} value={l.date} onChange={(e) => onChange({ date: e.target.value })} />
          </Labelled>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Labelled label={meta.unit ? meta.unit[0].toUpperCase() + meta.unit.slice(1) : "Quantity"} htmlFor={id("qty")}>
            <Input id={id("qty")} className={small} inputMode="decimal" value={l.qty} onChange={(e) => onChange({ qty: e.target.value })} placeholder={l.hit.assetClass === "gold" ? "10" : "25"} />
          </Labelled>
          <Labelled label={`${meta.priceLabel} (₹)`} htmlFor={id("avg")}>
            <Input id={id("avg")} className={small} inputMode="decimal" value={l.price} onChange={(e) => onChange({ price: e.target.value })} placeholder={l.live ? l.live.toFixed(2) : "1450.50"} />
          </Labelled>
          <Labelled label="Bought on (optional)" htmlFor={id("date")} className="col-span-2 sm:col-span-1">
            <Input id={id("date")} className={small} type="date" max={today()} value={l.date} onChange={(e) => onChange({ date: e.target.value })} />
          </Labelled>
        </div>
      )}

      <div className="num mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-subtle">
        {l.mode === "units" && l.live != null && l.price.trim() === "" && (
          <button onClick={() => onChange({ price: l.live!.toFixed(2) })} className="font-medium text-accent">
            Use today&apos;s {l.hit.assetClass === "mf" ? "NAV" : "price"}
          </button>
        )}
        {r && (
          <span>
            {l.mode === "amount" ? `${fmtUnits(r.quantity)} units at an average NAV of ${inr(r.avgPrice, { decimals: 2 })}` : `Invested ${inr(r.quantity * r.avgPrice)}`}
            {l.live != null && l.mode === "units" ? ` · worth ${inr(r.quantity * l.live)} today` : ""}
          </span>
        )}
        {l.mode === "amount" && l.current.trim() === "" && l.invested.trim() !== "" && <span>Add what it is worth today for an exact unit count.</span>}
      </div>
      {held && r && (
        <p className="num mt-2 rounded-[10px] bg-accent-soft px-2.5 py-1.5 text-[12px] text-text">
          You already hold {fmtUnits(held.quantity)} {meta.unit}. This adds to it: {fmtUnits(held.quantity + r.quantity)} {meta.unit} at an average of {inr((held.quantity * held.avgPrice + r.quantity * r.avgPrice) / (held.quantity + r.quantity), { decimals: 2 })}.
        </p>
      )}
    </li>
  );
}

function Labelled({ label, htmlFor, children, className }: { label: string; htmlFor: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1 block text-[12px] font-medium text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}
