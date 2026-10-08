"use client";
import { ArrowDownUp, Eye, Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { ordinal } from "@/lib/portfolio/sip";
import { Delta } from "@/components/ui/delta";
import { Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { apiCall } from "@/lib/api-client";
import { absPct, inr } from "@/lib/format";
import { ASSET_META, GROUP_COLOR, GROUP_ORDER, groupOf, isManualClass, shortCode, type AssetGroup } from "@/lib/instruments/asset-classes";
import { AssetIcon } from "./asset-ui";
import { AssetBuilder } from "./asset-builder";
import { PortfolioList, type PortfolioSummary } from "./portfolio-list";
import { HoldingSheet, type HoldingRow } from "./holding-sheet";

export type Row = HoldingRow & { category: string | null; changePct: number | null; value: number; invested: number; pnl: number | null; pnlPct: number | null; weight: number; source: string };
type Watch = { symbol: string; name: string; price: number | null; changePct: number | null };
type Totals = { value: number };
type SortKey = "value" | "pnlPct" | "changePct" | "name";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "value", label: "Largest first" },
  { value: "pnlPct", label: "Best return first" },
  { value: "changePct", label: "Today's movers first" },
  { value: "name", label: "Name (A to Z)" },
];
const units = (x: number) => x.toLocaleString("en-IN", { maximumFractionDigits: x < 1 ? 6 : 3 });

/** The changing side of Portfolio: your portfolios, what each holds, and what you only watch. */
export function PortfolioManager({ portfolios, activeId, rows, totals, watching, isDemo, max }: { portfolios: PortfolioSummary[]; activeId: string | null; rows: Row[]; totals: Totals; watching: Watch[]; isDemo: boolean; max: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const [builder, setBuilder] = useState<null | "all" | "manual">(params.get("add") === "1" ? "all" : null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [sort, setSort] = useState<SortKey>("value");
  const [filter, setFilter] = useState("");
  const active = portfolios.find((p) => p.id === activeId) ?? null;

  const groups = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = f ? rows.filter((r) => `${r.name} ${r.symbol} ${r.category ?? ""}`.toLowerCase().includes(f)) : rows;
    const by = { value: (r: Row) => -r.value, pnlPct: (r: Row) => -(r.pnlPct ?? -Infinity), changePct: (r: Row) => -Math.abs(r.changePct ?? 0), name: () => 0 }[sort];
    const sorted = [...list].sort((a, b) => by(a) - by(b) || a.name.localeCompare(b.name));
    const m = new Map<AssetGroup, Row[]>();
    for (const r of sorted) m.set(groupOf(r.assetClass), [...(m.get(groupOf(r.assetClass)) ?? []), r]);
    return GROUP_ORDER.filter((g) => m.has(g))
      .map((g) => ({ group: g, rows: m.get(g)!, value: m.get(g)!.reduce((a, r) => a + r.value, 0) }))
      .sort((a, b) => b.value - a.value);
  }, [rows, sort, filter]);

  /** Removes a holding and offers an undo that puts back exactly what was there. */
  const remove = async (r: HoldingRow) => {
    try {
      await apiCall(`/api/holdings/${r.id}`, "DELETE");
    } catch (e) {
      return void toast.error((e as Error).message);
    }
    router.refresh();
    toast(`${r.name} removed`, {
      action: {
        label: "Undo",
        onClick: async () => {
          try {
            if (isManualClass(r.assetClass)) await apiCall(`/api/portfolios/${activeId}/assets`, "POST", { assetClass: r.assetClass, name: r.name, invested: r.avgPrice, value: r.details?.value ?? r.avgPrice, valueAsOf: r.details?.valueAsOf ?? r.buyDate ?? new Date().toISOString().slice(0, 10), ratePct: r.details?.ratePct ?? null, startDate: r.buyDate, maturityDate: r.details?.maturityDate ?? null });
            else await apiCall(`/api/portfolios/${activeId}/holdings`, "POST", { mode: "replace", holdings: [{ symbol: r.symbol, quantity: r.quantity, avgPrice: r.avgPrice, buyDate: r.buyDate, rawName: r.name, source: "manual" }] });
            router.refresh();
          } catch (e) {
            toast.error((e as Error).message);
          }
        },
      },
    });
  };

  return (
    <div className="space-y-6 lg:space-y-7">
      <PortfolioList portfolios={portfolios} activeId={activeId} max={max} />

      {rows.length === 0 && <EmptyPortfolio onSearch={() => setBuilder("all")} onManual={() => setBuilder("manual")} />}

      {active && rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="t-title-2 text-text">What {active.name} holds</h2>
              <p className="mt-0.5 text-sm text-muted">
                <span className="num">{rows.length}</span> holdings worth <span className="num text-text">{inr(totals.value)}</span>. Tap the pencil to change one.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setBuilder("all")}>
                <Plus className="h-4 w-4" /> Add assets
              </Button>
              <ButtonLink href="/portfolio/import" variant="secondary">
                <Upload className="h-4 w-4" /> Import
              </ButtonLink>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {rows.length > 6 && (
              <div className="relative min-w-0 flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
                <Input aria-label="Find a holding" placeholder="Find a holding" className="h-10 pl-9 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)} />
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              <ArrowDownUp className="h-4 w-4 text-subtle" aria-hidden />
              <Select aria-label="Sort holdings" className="h-10 w-auto text-sm" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {groups.map((g) => (
            <Card key={g.group} className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5 sm:px-6">
                <h2 className="flex items-center gap-2.5 text-[15px] font-semibold text-text">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: GROUP_COLOR[g.group] }} aria-hidden />
                  {g.group}
                  <span className="text-[13px] font-normal text-subtle">{g.rows.length}</span>
                </h2>
                <div className="num text-sm text-muted">
                  <span className="font-medium text-text">{inr(g.value)}</span> · {absPct(totals.value ? g.value / totals.value : 0, 0)}
                </div>
              </div>
              <ul className="divide-y divide-line">
                {g.rows.map((r) => (
                  <HoldingItem key={r.id} r={r} onEdit={() => setEditing(r)} onRemove={() => remove(r)} />
                ))}
              </ul>
            </Card>
          ))}
          {groups.length === 0 && <p className="px-1 text-sm text-muted">No holding matches “{filter.trim()}”.</p>}
          {isDemo && <p className="t-caption">Demo account: it is shared, and what you change here is undone when it is put back tonight.</p>}
        </>
      )}

      <WatchingCard watching={watching} />

      <AssetBuilder open={!!builder} initialTab={builder ?? "all"} onClose={() => setBuilder(null)} portfolioId={activeId} held={rows.map((r) => ({ symbol: r.symbol, quantity: r.quantity, avgPrice: r.avgPrice }))} />
      <HoldingSheet row={editing} portfolioId={activeId} onClose={() => setEditing(null)} onRemove={remove} />
    </div>
  );
}

function HoldingItem({ r, onEdit, onRemove }: { r: Row; onEdit: () => void; onRemove: () => void }) {
  const manual = isManualClass(r.assetClass);
  const meta = ASSET_META[r.assetClass];
  const sub = manual ? [meta.label, r.details?.ratePct ? `${r.details.ratePct}% a year` : null, r.details?.maturityDate ? `matures ${r.details.maturityDate}` : null] : [r.assetClass === "mf" || r.assetClass === "gold" ? null : shortCode(r.symbol), r.category ?? (r.assetClass === "us" || r.assetClass === "crypto" ? meta.label : null)];
  const title = <span className="block truncate font-medium text-text">{r.name}</span>;
  return (
    <li className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
      <AssetIcon assetClass={r.assetClass} />
      <div className="min-w-0 flex-1">
        {manual ? title : (
          <Link href={`/stock/${encodeURIComponent(r.symbol)}`} className="block hover:underline">
            {title}
          </Link>
        )}
        <div className="truncate text-[12px] text-subtle">{sub.filter(Boolean).join(" · ")}</div>
        <div className="num mt-0.5 text-[12px] text-subtle">
          {manual ? `Invested ${inr(r.invested)}` : `${units(r.quantity)} ${meta.unit} × ${inr(r.avgPrice, { decimals: 2 })}`}
          {!manual && r.price != null && <span className="hidden sm:inline"> · now {inr(r.price, { decimals: 2 })}</span>}
        </div>
        {r.sip && (
          <div className="mt-1">
            <Chip tone={r.sip.active ? "accent" : undefined}>{r.sip.active ? `SIP ${inr(r.sip.amount)} · ${ordinal(r.sip.dayOfMonth)}` : "SIP paused"}</Chip>
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <div className="num text-[15px] font-medium text-text">{inr(r.value)}</div>
        <div className="mt-0.5">{r.pnl != null ? <Delta amount={r.pnl} pct={r.pnlPct} size="sm" compact showArrow={false} /> : <Chip>price on its way</Chip>}</div>
        {r.changePct != null && Math.abs(r.changePct) >= 0.0005 && (
          <div className="mt-0.5 hidden items-baseline justify-end gap-1 sm:flex">
            <Delta pct={r.changePct} size="sm" /> <span className="text-[12px] text-subtle">today</span>
          </div>
        )}
      </div>
      <div className="-mr-2 flex shrink-0 flex-col sm:flex-row">
        <button onClick={onEdit} aria-label={`Change ${r.name}`} className="rounded-full p-2 text-subtle hover:bg-surface-2 hover:text-text">
          <Pencil className="h-4 w-4" />
        </button>
        <button onClick={onRemove} aria-label={`Remove ${r.name}`} className="rounded-full p-2 text-subtle hover:bg-loss-soft hover:text-loss">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

function EmptyPortfolio({ onSearch, onManual }: { onSearch: () => void; onManual: () => void }) {
  const tile = "flex h-full w-full flex-col items-start gap-3 rounded-[16px] border border-line bg-surface-2/60 p-5 text-left transition-colors hover:bg-surface-2";
  return (
    <Card className="p-5 sm:p-6">
      <CardHeader overline="Start here" title="Build your portfolio" />
      <p className="mt-1 text-sm text-muted">Add what you own in any order. You can mix all three ways, and change anything later.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <button className={tile} onClick={onSearch}>
          <AssetIcon assetClass="stock" />
          <span>
            <span className="block font-medium text-text">Search and add</span>
            <span className="mt-1 block text-sm text-muted">Stocks, mutual funds, ETFs, REITs, gold and silver. Prices update on their own.</span>
          </span>
        </button>
        <Link className={tile} href="/portfolio/import">
          <AssetIcon assetClass="etf" />
          <span>
            <span className="block font-medium text-text">Import a broker file</span>
            <span className="mt-1 block text-sm text-muted">A holdings file from Zerodha, Groww or Upstox, or any spreadsheet.</span>
          </span>
        </Link>
        <button className={tile} onClick={onManual}>
          <AssetIcon assetClass="fd" />
          <span>
            <span className="block font-medium text-text">Deposits, PF and more</span>
            <span className="mt-1 block text-sm text-muted">FDs, PPF, EPF, NPS, bonds, property and cash, at the value you enter.</span>
          </span>
        </button>
      </div>
    </Card>
  );
}

function TickerSearch({ onPick }: { onPick: (r: { symbol: string; name: string }) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ symbol: string; name: string; assetClass: Row["assetClass"]; sub: string | null }[]>([]);
  const shown = q.trim().length < 2 ? [] : results;
  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(async () => {
      const j = await apiCall(`/api/search?q=${encodeURIComponent(q.trim())}`, "GET").catch(() => ({ results: [] }));
      setResults(j.results);
    }, 180);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div>
      <Input autoFocus aria-label="Search" placeholder="Search by name or symbol, e.g. Infosys" value={q} onChange={(e) => setQ(e.target.value)} />
      {shown.length > 0 && (
        <ul className="mt-2 max-h-64 overflow-y-auto rounded-[14px] border border-line" role="listbox">
          {shown.map((r) => (
            <li key={r.symbol}>
              <button type="button" role="option" aria-selected={false} onClick={() => onPick(r)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm hover:bg-surface-2">
                <AssetIcon assetClass={r.assetClass} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-text">{r.name}</span>
                  <span className="block truncate text-[12px] text-subtle">{r.sub ?? shortCode(r.symbol)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WatchingCard({ watching }: { watching: Watch[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Card className="p-5 sm:p-6">
      <CardHeader
        overline="Watching"
        title="Not yours (yet), but on your radar"
        right={
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            <Eye className="h-4 w-4" /> Watch
          </Button>
        }
      />
      {watching.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Keep an eye on a stock or fund without adding a quantity. Nazar includes it in its nightly check.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {watching.map((w) => (
            <li key={w.symbol} className="flex items-center justify-between gap-3 py-3">
              <Link href={`/stock/${encodeURIComponent(w.symbol)}`} className="min-w-0">
                <span className="block truncate font-medium text-text">{w.name}</span>
                <span className="font-mono text-[12px] text-subtle">{shortCode(w.symbol)}</span>
              </Link>
              <span className="flex items-center gap-3">
                <span className="text-right">
                  <span className="num block text-sm text-text">{w.price != null ? inr(w.price, { decimals: 2 }) : <Chip>price on its way</Chip>}</span>
                  {w.changePct != null && <Delta pct={w.changePct} size="sm" />}
                </span>
                <button
                  aria-label={`Stop watching ${w.name}`}
                  className="rounded-full p-2 text-subtle hover:bg-surface-2 hover:text-text"
                  onClick={async () => {
                    await apiCall("/api/watching", "DELETE", { symbols: [w.symbol] });
                    router.refresh();
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="Watch a stock or fund">
        <TickerSearch
          onPick={async (r) => {
            await apiCall("/api/watching", "POST", { symbols: [r.symbol] });
            toast(`Watching ${r.name}`);
            setOpen(false);
            router.refresh();
          }}
        />
      </Sheet>
    </Card>
  );
}
