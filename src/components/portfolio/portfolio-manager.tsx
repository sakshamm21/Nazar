"use client";
import { ArrowDownUp, Eye, Pencil, Plus, Search, Settings2, Trash2, Upload, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PortfolioSwitcher } from "@/components/home/portfolio-switcher";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Delta } from "@/components/ui/delta";
import { Field, FormAlert, Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { apiCall } from "@/lib/api-client";
import { absPct, inr, inrCompact } from "@/lib/format";
import { ASSET_META, GROUP_COLOR, GROUP_ORDER, groupOf, isManualClass, shortCode, type AssetGroup } from "@/lib/instruments/asset-classes";
import { AllocationBar, AssetIcon, type Slice } from "./asset-ui";
import { AssetBuilder } from "./asset-builder";
import { HoldingSheet, type HoldingRow } from "./holding-sheet";

type Pf = { id: string; name: string; ownerLabel: string | null; language: "en" | "hi" };
export type Row = HoldingRow & { category: string | null; changePct: number | null; value: number; invested: number; pnl: number | null; pnlPct: number | null; weight: number; source: string };
type Watch = { symbol: string; name: string; price: number | null; changePct: number | null };
type Totals = { value: number; invested: number; dayChange: number | null; dayChangePct: number | null };
type SortKey = "value" | "pnlPct" | "changePct" | "name";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "value", label: "Largest first" },
  { value: "pnlPct", label: "Best return first" },
  { value: "changePct", label: "Today's movers first" },
  { value: "name", label: "Name (A to Z)" },
];
const units = (x: number) => x.toLocaleString("en-IN", { maximumFractionDigits: 3 });

export function PortfolioManager({ portfolios, activeId, rows, totals, allocation, watching, isDemo }: { portfolios: Pf[]; activeId: string | null; rows: Row[]; totals: Totals; allocation: Slice[]; watching: Watch[]; isDemo: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [builder, setBuilder] = useState<null | "all" | "manual">(params.get("add") === "1" ? "all" : null);
  const [creating, setCreating] = useState<null | "self" | "family">(params.get("new") === "family" ? "family" : portfolios.length ? null : "self");
  const [editing, setEditing] = useState<Row | null>(null);
  const [sort, setSort] = useState<SortKey>("value");
  const [filter, setFilter] = useState("");
  const active = portfolios.find((p) => p.id === activeId) ?? null;

  // Deleting the last portfolio opens "create" straight away.
  const [count, setCount] = useState(portfolios.length);
  if (portfolios.length !== count) {
    setCount(portfolios.length);
    if (!portfolios.length) setCreating("self");
  }

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

  const pnl = totals.value - totals.invested;
  return (
    <div className="space-y-5 lg:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="t-title-1 text-text">Portfolio</h1>
          <p className="mt-1 text-sm text-muted">Everything you own in one place: stocks, funds, gold, deposits and more.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setCreating("family")}>
            <Users className="h-4 w-4" /> Family portfolio
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setCreating("self")}>
            <Plus className="h-4 w-4" /> New portfolio
          </Button>
        </div>
      </div>

      <PortfolioSwitcher portfolios={portfolios} activeId={activeId} />

      {active && rows.length === 0 && <EmptyPortfolio onSearch={() => setBuilder("all")} onManual={() => setBuilder("manual")} settingsHref={`/portfolio/${active.id}/settings`} />}

      {active && rows.length > 0 && (
        <>
          <Card className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="t-overline">{active.ownerLabel ? `${active.ownerLabel}'s portfolio · reports in ${active.language === "hi" ? "Hindi" : "English"}` : active.name}</div>
                <div className="num mt-1 font-[family-name:var(--font-display)] text-[34px] font-semibold leading-tight tracking-[-0.02em] text-text">{inr(totals.value)}</div>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  {totals.dayChange != null && (
                    <span className="flex items-baseline gap-1.5">
                      <Delta amount={totals.dayChange} pct={totals.dayChangePct} size="sm" /> <span className="text-[13px] text-subtle">today</span>
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setBuilder("all")}>
                  <Plus className="h-4 w-4" /> Add assets
                </Button>
                <ButtonLink href="/portfolio/import" variant="secondary">
                  <Upload className="h-4 w-4" /> Import
                </ButtonLink>
                <ButtonLink href={`/portfolio/${active.id}/settings`} variant="ghost" className="px-3">
                  <Settings2 className="h-4 w-4" /> <span className="sr-only sm:not-sr-only">Settings</span>
                </ButtonLink>
              </div>
            </div>
            <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
              <Stat label="Invested">
                <span className="num text-[15px] font-medium text-text">{inrCompact(totals.invested)}</span>
              </Stat>
              <Stat label="Total gain or loss">
                <Delta amount={pnl} pct={totals.invested ? pnl / totals.invested : null} compact showArrow={false} size="sm" />
              </Stat>
              <Stat label="Holdings">
                <span className="num text-[15px] font-medium text-text">{rows.length}</span>
                <span className="text-[12px] text-subtle"> in {allocation.length} {allocation.length === 1 ? "asset type" : "asset types"}</span>
              </Stat>
            </dl>
            <div className="mt-5 border-t border-line pt-4">
              <AllocationBar slices={allocation} format={inrCompact} />
            </div>
          </Card>

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
          {isDemo && <p className="t-caption">Test account: it is shared, and what you change here is undone when it is put back tonight.</p>}
        </>
      )}

      <WatchingCard watching={watching} />

      <AssetBuilder open={!!builder} initialTab={builder ?? "all"} onClose={() => setBuilder(null)} portfolioId={activeId} held={rows.map((r) => ({ symbol: r.symbol, quantity: r.quantity, avgPrice: r.avgPrice }))} />
      <HoldingSheet row={editing} portfolioId={activeId} onClose={() => setEditing(null)} onRemove={remove} />
      <CreatePortfolioSheet mode={creating} onClose={() => setCreating(null)} />
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-subtle">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function HoldingItem({ r, onEdit, onRemove }: { r: Row; onEdit: () => void; onRemove: () => void }) {
  const manual = isManualClass(r.assetClass);
  const meta = ASSET_META[r.assetClass];
  const sub = manual ? [meta.label, r.details?.ratePct ? `${r.details.ratePct}% a year` : null, r.details?.maturityDate ? `matures ${r.details.maturityDate}` : null] : [r.assetClass === "mf" || r.assetClass === "gold" ? null : shortCode(r.symbol), r.category];
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

function EmptyPortfolio({ onSearch, onManual, settingsHref }: { onSearch: () => void; onManual: () => void; settingsHref: string }) {
  const tile = "flex h-full w-full flex-col items-start gap-3 rounded-[16px] border border-line bg-surface-2/60 p-5 text-left transition-colors hover:bg-surface-2";
  return (
    <Card className="p-5 sm:p-6">
      <CardHeader
        overline="Start here"
        title="Build your portfolio"
        right={
          <Link href={settingsHref} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-text">
            <Settings2 className="h-4 w-4" /> Settings
          </Link>
        }
      />
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

function CreatePortfolioSheet({ mode, onClose }: { mode: null | "self" | "family"; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [language, setLanguage] = useState<"en" | "hi">("hi");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const family = mode === "family";
  return (
    <Sheet
      open={!!mode}
      onClose={onClose}
      title={family ? "Add a family portfolio" : "New portfolio"}
      description={family ? "Track a parent's or partner's money separately. Nazar can send them a weekly report and major alerts in their language." : "Most people need one. Create another to keep things separate."}
      footer={
        <Button
          className="w-full"
          loading={busy}
          onClick={async () => {
            if (family && !owner.trim()) return setError("Whose portfolio is it?");
            setBusy(true);
            try {
              const j = await apiCall("/api/portfolios", "POST", family ? { name: `${owner.trim()}'s portfolio`, ownerLabel: owner.trim(), language } : { name: name.trim() || "My portfolio", language: "en" });
              document.cookie = `nazar_pf=${j.portfolio.id}; Path=/; Max-Age=${60 * 60 * 24 * 180}; SameSite=Lax`;
              onClose();
              router.push(family ? `/portfolio/${j.portfolio.id}/settings?new=1` : "/portfolio");
              router.refresh();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Create
        </Button>
      }
    >
      <div className="space-y-4">
        {family ? (
          <>
            <Field label="Whose portfolio is it?" htmlFor="owner" hint={`Shown as "Papa's portfolio".`}>
              <Input id="owner" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Papa" />
            </Field>
            <Field label="Language for their reports and alerts" htmlFor="lang">
              <Select id="lang" value={language} onChange={(e) => setLanguage(e.target.value as "en" | "hi")}>
                <option value="hi">Simple Hindi (हिंदी)</option>
                <option value="en">English</option>
              </Select>
            </Field>
          </>
        ) : (
          <Field label="Name" htmlFor="pname">
            <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} placeholder="My portfolio" />
          </Field>
        )}
        <FormAlert message={error} />
      </div>
    </Sheet>
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
