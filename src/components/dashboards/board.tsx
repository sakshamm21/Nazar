"use client";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { apiCall } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { dayLabel, inrCompact, signedPct } from "@/lib/format";
import type { DashboardWidget } from "@/lib/db/schema";
import type { Comparison } from "@/lib/dashboards/compare";

export type BoardCard = { widget: DashboardWidget; title: string; scope: string; benchmark: string; period: string; result: Comparison | null; reason: string | null };
type Option = { id: string; name: string };
type Options = { portfolios: Option[]; parts: Option[]; benchmarks: Option[]; periods: Option[] };

const withYear = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

/**
 * Dashboards: tabs along the top, a grid of comparisons below. "Edit" turns each card into its four
 * choices (what, from which portfolio, against what, over how long) and adds or removes cards.
 */
export function DashboardBoard({ dashboards, active, cards, options }: { dashboards: Option[]; active: { id: string; name: string; widgets: DashboardWidget[] }; cards: BoardCard[]; options: Options }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DashboardWidget[]>(active.widgets);
  const [name, setName] = useState(active.name);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  // A different dashboard opened: start from what it holds.
  const [loadedId, setLoadedId] = useState(active.id);
  if (loadedId !== active.id) {
    setLoadedId(active.id);
    setDraft(active.widgets);
    setName(active.name);
    setEditing(false);
  }

  const call = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast(done);
      router.refresh();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (await call(() => apiCall(`/api/dashboards/${active.id}`, "PATCH", { name, widgets: draft }), "Dashboard saved")) setEditing(false);
  };
  const create = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const j = await apiCall<{ dashboard: { id: string } }>("/api/dashboards", "POST", { name: newName });
      setCreating(false);
      setNewName("");
      router.push(`/dashboards?d=${j.dashboard.id}`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!window.confirm(`Delete "${active.name}"? Its comparisons go with it.`)) return;
    if (await call(() => apiCall(`/api/dashboards/${active.id}`, "DELETE"), `${active.name} deleted`)) router.push("/dashboards");
  };
  const add = () => setDraft((d) => [...d, { id: newId(), portfolio: options.portfolios[0]?.id ?? "all", part: "whole", benchmark: options.benchmarks[0].id, period: "1Y" }]);
  const change = (id: string, patch: Partial<DashboardWidget>) => setDraft((d) => d.map((w) => (w.id === id ? { ...w, ...patch } : w)));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="t-title-1 text-text">Dashboards</h1>
          <p className="mt-1 text-sm text-muted">What you own, or any part of it, against the market. Every line starts at 100, so you can read them side by side.</p>
        </div>
        {!editing ? (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => { setEditing(false); setDraft(active.widgets); setName(active.name); }}>
              Cancel
            </Button>
            <Button loading={busy} onClick={save}>
              <Check className="h-4 w-4" /> Save
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <div role="tablist" aria-label="Dashboards" className="-mx-1 flex gap-1 overflow-x-auto px-1">
          {dashboards.map((x) => (
            <Link key={x.id} role="tab" aria-selected={x.id === active.id} href={`/dashboards?d=${x.id}`} className={cn("shrink-0 rounded-[12px] px-3.5 py-2 text-sm font-medium", x.id === active.id ? "bg-accent-soft text-accent" : "text-muted hover:text-text")}>
              {x.name}
            </Link>
          ))}
        </div>
        {creating ? (
          <form onSubmit={(e) => { e.preventDefault(); create(); }} className="flex items-center gap-1.5">
            <Input aria-label="New dashboard name" autoFocus value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)} placeholder="Funds vs Nifty" className="h-9 w-44 text-sm" />
            <Button size="sm" loading={busy} type="submit">Create</Button>
            <button type="button" aria-label="Cancel" onClick={() => setCreating(false)} className="rounded-full p-1.5 text-subtle hover:text-text">
              <X className="h-4 w-4" />
            </button>
          </form>
        ) : (
          dashboards.length < 8 && (
            <button onClick={() => setCreating(true)} className="flex items-center gap-1 rounded-[12px] px-3 py-2 text-sm font-medium text-muted hover:text-text">
              <Plus className="h-4 w-4" /> New dashboard
            </button>
          )
        )}
      </div>

      {editing && (
        <Card className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[200px] flex-1">
            <Field label="Dashboard name" htmlFor="dash-name">
              <Input id="dash-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          {dashboards.length > 1 && (
            <Button variant="ghost" className="text-loss hover:bg-loss-soft hover:text-loss" onClick={remove}>
              <Trash2 className="h-4 w-4" /> Delete dashboard
            </Button>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {editing
          ? draft.map((w) => <WidgetEditor key={w.id} w={w} options={options} onChange={(p) => change(w.id, p)} onRemove={() => setDraft((d) => d.filter((x) => x.id !== w.id))} />)
          : cards.map((c) => <CompareCard key={c.widget.id} c={c} />)}
        {editing && draft.length < 12 && (
          <button onClick={add} className="grid min-h-[180px] place-items-center rounded-[22px] border border-dashed border-line-strong text-sm font-medium text-muted hover:text-text">
            <span className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> Add a comparison
            </span>
          </button>
        )}
        {!editing && !cards.length && (
          <Card className="p-6 text-sm text-muted md:col-span-2">
            This dashboard is empty. Press Edit to add a comparison: your whole portfolio, your funds or one stock, against the Nifty or a sector index.
          </Card>
        )}
      </div>
      <p className="t-caption">Worked out from your holdings today, priced on each past day. A comparison, not a forecast.</p>
    </div>
  );
}

function CompareCard({ c }: { c: BoardCard }) {
  const r = c.result;
  const gap = r && r.minePct != null && r.indexPct != null ? r.minePct - r.indexPct : null;
  return (
    <Card className="min-w-0 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="t-overline truncate">{c.scope} · {c.period}</div>
          <h2 className="mt-1 truncate text-[15px] font-semibold text-text">
            {c.title} <span className="font-normal text-muted">vs</span> {c.benchmark}
          </h2>
        </div>
        {r && <span className="num shrink-0 text-[13px] text-subtle">{inrCompact(r.value)}</span>}
      </div>
      {!r ? (
        <p className="mt-6 text-sm text-muted">{c.reason}</p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-3 gap-2">
            <Stat label="Yours" value={signedPct(r.minePct)} tone={r.minePct} />
            <Stat label={c.benchmark} value={signedPct(r.indexPct)} tone={r.indexPct} />
            <Stat label="Difference" value={gap == null ? "—" : `${gap >= 0 ? "+" : "−"}${Math.abs(gap * 100).toFixed(1)} pts`} tone={gap} />
          </dl>
          <div className="mt-3 h-36" aria-label={`${c.title} against ${c.benchmark}, rebased to 100`} role="img">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={r.points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <XAxis dataKey="date" hide />
                <YAxis hide domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--line)", borderRadius: 12, fontSize: 12 }}
                  labelFormatter={(d) => dayLabel(String(d), "en")}
                  formatter={(v, n) => [Number(v).toFixed(1), n === "mine" ? "Yours" : c.benchmark]}
                />
                <Line dataKey="index" stroke="var(--subtle)" strokeDasharray="4 4" dot={false} strokeWidth={1.5} isAnimationActive={false} connectNulls />
                <Line dataKey="mine" stroke="var(--accent)" dot={false} strokeWidth={2} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-[12px] text-subtle">
            {withYear(r.from)} to {withYear(r.to)} · {r.holdings} {r.holdings === 1 ? "holding" : "holdings"}
          </p>
        </>
      )}
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: number | null }) {
  return (
    <div className="min-w-0 rounded-[12px] bg-surface-2 px-2.5 py-2">
      <dt className="truncate text-[11px] text-subtle">{label}</dt>
      <dd className={cn("num text-[14px] font-medium", tone == null || Math.abs(tone) < 0.0005 ? "text-text" : tone > 0 ? "text-gain" : "text-loss")}>{value}</dd>
    </div>
  );
}

function WidgetEditor({ w, options, onChange, onRemove }: { w: DashboardWidget; options: Options; onChange: (p: Partial<DashboardWidget>) => void; onRemove: () => void }) {
  const pick = (label: string, key: keyof DashboardWidget, list: Option[]) => (
    <Field label={label} htmlFor={`${w.id}-${key}`}>
      <Select id={`${w.id}-${key}`} value={w[key]} onChange={(e) => onChange({ [key]: e.target.value } as Partial<DashboardWidget>)}>
        {!list.some((o) => o.id === w[key]) && <option value={w[key]}>(no longer available)</option>}
        {list.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </Select>
    </Field>
  );
  return (
    <Card className="min-w-0 space-y-3 p-5">
      <div className="flex items-center justify-between">
        <span className="t-overline">Comparison</span>
        <button onClick={onRemove} aria-label="Remove this comparison" className="rounded-full p-1.5 text-subtle hover:bg-loss-soft hover:text-loss">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {pick("What", "part", options.parts)}
        {options.portfolios.length > 1 && pick("From", "portfolio", options.portfolios)}
        {pick("Against", "benchmark", options.benchmarks)}
        {pick("Over", "period", options.periods)}
      </div>
    </Card>
  );
}
