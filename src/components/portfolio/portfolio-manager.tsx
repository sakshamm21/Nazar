"use client";
import { Eye, Pencil, Plus, Settings2, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { QuietRings } from "@/components/rings/quiet-rings";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Delta } from "@/components/ui/delta";
import { Field, FormAlert, Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { Segmented } from "@/components/ui/switch";
import { inr } from "@/lib/format";

type Pf = { id: string; name: string; ownerLabel: string | null; language: "en" | "hi" };
type Row = { id: string; symbol: string; name: string; quantity: number; avgPrice: number; buyDate: string | null; price: number | null; value: number; pnl: number | null; pnlPct: number | null; source: string };
type Watch = { symbol: string; name: string; price: number | null; changePct: number | null };

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? "Something went wrong.");
  return j;
}

export function PortfolioManager({ portfolios, activeId, rows, watching, isDemo }: { portfolios: Pf[]; activeId: string | null; rows: Row[]; watching: Watch[]; isDemo: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [adding, setAdding] = useState(params.get("add") === "1");
  const [creating, setCreating] = useState<null | "self" | "family">(params.get("new") === "family" ? "family" : portfolios.length ? null : "self");
  const [editing, setEditing] = useState<Row | null>(null);
  const active = portfolios.find((p) => p.id === activeId) ?? null;

  // Deleting the last portfolio opens "create" straight away.
  const [count, setCount] = useState(portfolios.length);
  if (portfolios.length !== count) {
    setCount(portfolios.length);
    if (!portfolios.length) setCreating("self");
  }

  const select = (id: string) => {
    document.cookie = `nazar_pf=${id}; Path=/; Max-Age=${60 * 60 * 24 * 180}; SameSite=Lax`;
    router.refresh();
  };

  return (
    <div className="space-y-5 lg:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="t-title-1 text-text">Portfolio</h1>
          <p className="mt-1 text-sm text-muted">Your holdings, the stocks you&apos;re just watching, and family portfolios.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setCreating("family")}>
            <Plus className="h-4 w-4" /> Family portfolio
          </Button>
          <Button variant="secondary" onClick={() => setCreating("self")} className="hidden sm:inline-flex">
            <Plus className="h-4 w-4" /> Portfolio
          </Button>
        </div>
      </div>

      {portfolios.length > 1 && <Segmented label="Portfolio" value={activeId ?? ""} onChange={select} options={portfolios.map((p) => ({ value: p.id, label: p.ownerLabel ? `${p.ownerLabel}'s` : p.name }))} />}

      {active && (
        <Card className="p-5 sm:p-6">
          <CardHeader
            overline={active.ownerLabel ? `Family · reports in ${active.language === "hi" ? "Hindi" : "English"}` : "Holdings"}
            title={active.ownerLabel ? `${active.ownerLabel}'s portfolio` : active.name}
            right={
              <Link href={`/portfolio/${active.id}/settings`} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-text">
                <Settings2 className="h-4 w-4" /> Settings
              </Link>
            }
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink href="/portfolio/import">
              <Upload className="h-4 w-4" /> Import from broker
            </ButtonLink>
            <Button variant="secondary" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Add a stock
            </Button>
          </div>
          {rows.length === 0 ? (
            <QuietRings compact title="No holdings yet" body="Import your holdings file from Zerodha, Groww or Upstox, or add stocks one by one." />
          ) : (
            <>
              {/* Phones: one stacked row per holding, no sideways scrolling. */}
              <ul className="mt-5 divide-y divide-line md:hidden">
                {rows.map((r) => (
                  <li key={r.id} className="flex items-start gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/stock/${encodeURIComponent(r.symbol)}`} className="block truncate font-medium text-text hover:underline">
                        {r.name}
                      </Link>
                      <div className="num mt-0.5 text-[12px] text-subtle">
                        {r.quantity.toLocaleString("en-IN")} × {inr(r.avgPrice, { decimals: 2 })}
                        {r.price != null ? ` · ${inr(r.value)}` : ""}
                      </div>
                      <div className="mt-1 text-sm">{r.pnl != null ? <Delta amount={r.pnl} pct={r.pnlPct} size="sm" compact showArrow={false} /> : <span className="t-caption">Prices tonight</span>}</div>
                    </div>
                    <div className="-mr-2 flex shrink-0">
                      <button onClick={() => setEditing(r)} aria-label={`Edit ${r.name}`} className="rounded-full p-2 text-subtle hover:bg-surface-2 hover:text-text">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        aria-label={`Remove ${r.name}`}
                        className="rounded-full p-2 text-subtle hover:bg-loss-soft hover:text-loss"
                        onClick={async () => {
                          if (!confirm(`Remove ${r.name} from this portfolio?`)) return;
                          await call(`/api/holdings/${r.id}`, "DELETE");
                          toast(`${r.name} removed`);
                          router.refresh();
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            <div className="mt-5 hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[12px] text-subtle">
                    <th className="py-2 pr-3 font-medium">Stock</th>
                    <th className="py-2 pr-3 text-right font-medium">Qty</th>
                    <th className="py-2 pr-3 text-right font-medium">Avg price</th>
                    <th className="py-2 pr-3 text-right font-medium">Value</th>
                    <th className="py-2 pr-3 text-right font-medium">P&amp;L</th>
                    <th className="py-2 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="py-3 pr-3">
                        <Link href={`/stock/${encodeURIComponent(r.symbol)}`} className="font-medium text-text hover:underline">
                          {r.name}
                        </Link>
                        <div className="font-mono text-[12px] text-subtle">
                          {r.symbol.replace(/\.NS$/, "")}
                          {r.buyDate ? ` · since ${r.buyDate}` : ""}
                        </div>
                      </td>
                      <td className="num py-3 pr-3 text-right text-text">{r.quantity.toLocaleString("en-IN")}</td>
                      <td className="num py-3 pr-3 text-right text-text">{inr(r.avgPrice, { decimals: 2 })}</td>
                      <td className="num py-3 pr-3 text-right text-text">{r.price != null ? inr(r.value) : "—"}</td>
                      <td className="py-3 pr-3 text-right">{r.pnl != null ? <Delta amount={r.pnl} pct={r.pnlPct} size="sm" compact showArrow={false} /> : <span className="t-caption">tonight</span>}</td>
                      <td className="py-3 text-right whitespace-nowrap">
                        <button onClick={() => setEditing(r)} aria-label={`Edit ${r.name}`} className="rounded-full p-2 text-subtle hover:bg-surface-2 hover:text-text">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          aria-label={`Remove ${r.name}`}
                          className="rounded-full p-2 text-subtle hover:bg-loss-soft hover:text-loss"
                          onClick={async () => {
                            if (!confirm(`Remove ${r.name} from this portfolio?`)) return;
                            await call(`/api/holdings/${r.id}`, "DELETE");
                            toast(`${r.name} removed`);
                            router.refresh();
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
          {isDemo && <p className="t-caption mt-4">Demo account: changes here only affect your private demo copy.</p>}
        </Card>
      )}

      <WatchingCard watching={watching} />

      <AddHoldingSheet open={adding} onClose={() => setAdding(false)} portfolioId={activeId} />
      <EditHoldingSheet row={editing} onClose={() => setEditing(null)} />
      <CreatePortfolioSheet mode={creating} onClose={() => setCreating(null)} />
    </div>
  );
}

function TickerSearch({ onPick }: { onPick: (r: { symbol: string; name: string; isin: string }) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ symbol: string; name: string; isin: string }[]>([]);
  const shown = q.trim().length < 2 ? [] : results;
  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(async () => {
      const j = await call(`/api/search?q=${encodeURIComponent(q.trim())}`, "GET").catch(() => ({ results: [] }));
      setResults(j.results);
    }, 180);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div>
      <Input autoFocus aria-label="Search NSE stocks" placeholder="Search by name or NSE symbol, e.g. Infosys" value={q} onChange={(e) => setQ(e.target.value)} />
      {shown.length > 0 && (
        <ul className="mt-2 max-h-64 overflow-y-auto rounded-[14px] border border-line" role="listbox">
          {shown.map((r) => (
            <li key={r.symbol}>
              <button type="button" role="option" aria-selected={false} onClick={() => onPick(r)} className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm hover:bg-surface-2">
                <span className="text-text">{r.name}</span>
                <span className="font-mono text-[12px] text-subtle">{r.symbol.replace(/\.NS$/, "")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddHoldingSheet({ open, onClose, portfolioId }: { open: boolean; onClose: () => void; portfolioId: string | null }) {
  const router = useRouter();
  const [picked, setPicked] = useState<{ symbol: string; name: string; isin: string } | null>(null);
  const [qty, setQty] = useState("");
  const [avg, setAvg] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reset = () => {
    setPicked(null);
    setQty("");
    setAvg("");
    setDate("");
    setError(null);
  };
  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Add a stock"
      description="Nazar looks it up tonight, or right away if it's new to Nazar."
      footer={
        picked && (
          <Button
            className="w-full"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await call(`/api/portfolios/${portfolioId}/holdings`, "POST", { holdings: [{ symbol: picked.symbol, quantity: Number(qty), avgPrice: Number(avg), buyDate: date || null, isin: picked.isin, rawName: picked.name, source: "manual" }] });
                toast(`${picked.name} added. Nazar is watching it now.`);
                reset();
                onClose();
                router.refresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Add to portfolio
          </Button>
        )
      }
    >
      {!picked ? (
        <TickerSearch onPick={setPicked} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-[14px] border border-line bg-surface-2 px-3.5 py-3">
            <span>
              <span className="block font-medium text-text">{picked.name}</span>
              <span className="font-mono text-[12px] text-subtle">{picked.symbol}</span>
            </span>
            <button onClick={() => setPicked(null)} aria-label="Choose a different stock" className="rounded-full p-1.5 text-subtle hover:text-text">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity" htmlFor="qty">
              <Input id="qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="25" />
            </Field>
            <Field label="Average price (₹)" htmlFor="avg">
              <Input id="avg" inputMode="decimal" value={avg} onChange={(e) => setAvg(e.target.value)} placeholder="1450.50" />
            </Field>
          </div>
          <Field label="Bought on (optional)" htmlFor="date" hint="Used for your XIRR and the Nifty comparison.">
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <FormAlert message={error} />
        </div>
      )}
    </Sheet>
  );
}

function EditHoldingSheet({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const router = useRouter();
  const [qty, setQty] = useState("");
  const [avg, setAvg] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Load the row's values when a (different) holding is opened; kept while the sheet animates closed.
  const [loaded, setLoaded] = useState<Row | null>(null);
  if (row && row !== loaded) {
    setLoaded(row);
    setQty(String(row.quantity));
    setAvg(String(row.avgPrice));
    setDate(row.buyDate ?? "");
    setError(null);
  }
  return (
    <Sheet
      open={!!row}
      onClose={onClose}
      title={row ? `Edit ${row.name}` : ""}
      footer={
        <Button
          className="w-full"
          onClick={async () => {
            try {
              await call(`/api/holdings/${row!.id}`, "PATCH", { quantity: Number(qty), avgPrice: Number(avg), buyDate: date || null });
              onClose();
              router.refresh();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Save
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity" htmlFor="eqty">
            <Input id="eqty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="Average price (₹)" htmlFor="eavg">
            <Input id="eavg" inputMode="decimal" value={avg} onChange={(e) => setAvg(e.target.value)} />
          </Field>
        </div>
        <Field label="Bought on (optional)" htmlFor="edate">
          <Input id="edate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <FormAlert message={error} />
      </div>
    </Sheet>
  );
}

function CreatePortfolioSheet({ mode, onClose }: { mode: null | "self" | "family"; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [language, setLanguage] = useState<"en" | "hi">("hi");
  const [error, setError] = useState<string | null>(null);
  const family = mode === "family";
  return (
    <Sheet
      open={!!mode}
      onClose={onClose}
      title={family ? "Add a family portfolio" : "New portfolio"}
      description={family ? "Track a parent's or partner's stocks separately. Nazar can send them a weekly report and major alerts in their language." : "Most people need one. Create another to keep things separate."}
      footer={
        <Button
          className="w-full"
          onClick={async () => {
            try {
              const j = await call("/api/portfolios", "POST", family ? { name: `${owner.trim()}'s portfolio`, ownerLabel: owner.trim(), language } : { name: name.trim() || "My portfolio", language: "en" });
              document.cookie = `nazar_pf=${j.portfolio.id}; Path=/; Max-Age=${60 * 60 * 24 * 180}; SameSite=Lax`;
              onClose();
              router.push(family ? `/portfolio/${j.portfolio.id}/settings?new=1` : "/portfolio/import");
              router.refresh();
            } catch (e) {
              setError((e as Error).message);
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
        title="Stocks you don't own (yet)"
        right={
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            <Eye className="h-4 w-4" /> Watch a stock
          </Button>
        }
      />
      {watching.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Keep an eye on stocks without adding a quantity. Nazar includes them in its nightly check.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {watching.map((w) => (
            <li key={w.symbol} className="flex items-center justify-between gap-3 py-3">
              <Link href={`/stock/${encodeURIComponent(w.symbol)}`} className="min-w-0">
                <span className="block truncate font-medium text-text">{w.name}</span>
                <span className="font-mono text-[12px] text-subtle">{w.symbol.replace(/\.NS$/, "")}</span>
              </Link>
              <span className="flex items-center gap-3">
                <span className="text-right">
                  <span className="num block text-sm text-text">{w.price != null ? inr(w.price, { decimals: 2 }) : <Chip>tonight</Chip>}</span>
                  {w.changePct != null && <Delta pct={w.changePct} size="sm" />}
                </span>
                <button
                  aria-label={`Stop watching ${w.name}`}
                  className="rounded-full p-2 text-subtle hover:bg-surface-2 hover:text-text"
                  onClick={async () => {
                    await call("/api/watching", "DELETE", { symbols: [w.symbol] });
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
      <Sheet open={open} onClose={() => setOpen(false)} title="Watch a stock">
        <TickerSearch
          onPick={async (r) => {
            await call("/api/watching", "POST", { symbols: [r.symbol] });
            toast(`Watching ${r.name}`);
            setOpen(false);
            router.refresh();
          }}
        />
      </Sheet>
    </Card>
  );
}
