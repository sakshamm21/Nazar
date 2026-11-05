"use client";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { Segmented } from "@/components/ui/switch";
import { apiCall } from "@/lib/api-client";
import { dayLabel, inr } from "@/lib/format";
import { SIP_MAX_DAY, SIP_MIN_AMOUNT, SIP_MIN_DAY, dueOnOrAfter, instalmentsSince, ordinal } from "@/lib/portfolio/sip";
import { ASSET_META, isManualClass, type AssetClass, type ManualDetails } from "@/lib/instruments/asset-classes";
import { ManualFields, manualPayload, today, type ManualDraft } from "./manual-form";

export type HoldingRow = {
  id: string;
  symbol: string;
  name: string;
  assetClass: AssetClass;
  quantity: number;
  avgPrice: number;
  buyDate: string | null;
  price: number | null;
  details: ManualDetails | null;
  /** The monthly SIP on this holding, if one is set. */
  sip?: SipRow | null;
  /** Purchases still held, each with its own date and price. */
  lots?: number;
  /** Where the holding came from: "manual", or the broker file or statement it was imported from. */
  source?: string;
};

export type SipRow = { amount: number; dayOfMonth: number; startDate: string | null; endDate: string | null; active: boolean; nextDue: string; instalments: number; invested: number };

type Action = "more" | "less" | "edit" | "sip" | "income" | "history";
type IncomeKind = "dividend" | "interest" | "other";
const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/,/g, "")));
const units = (x: number) => x.toLocaleString("en-IN", { maximumFractionDigits: x < 1 ? 6 : 3 });

/** Change one holding: buy more, sell some, correct it, or remove it. Manual assets get their own form. */
export function HoldingSheet({ row, portfolioId, onClose, onRemove }: { row: HoldingRow | null; portfolioId: string | null; onClose: () => void; onRemove: (r: HoldingRow) => void }) {
  const router = useRouter();
  const [action, setAction] = useState<Action>("more");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState("");
  const [draft, setDraft] = useState<ManualDraft | null>(null);
  const [sipAmount, setSipAmount] = useState("");
  const [sipDay, setSipDay] = useState("");
  const [sipEnd, setSipEnd] = useState("");
  const [sipStart, setSipStart] = useState("");
  const [incomeKind, setIncomeKind] = useState<IncomeKind>("dividend");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Load the row's values when a (different) holding is opened; kept while the sheet animates closed.
  const [loaded, setLoaded] = useState<HoldingRow | null>(null);
  if (row && row !== loaded) {
    setLoaded(row);
    setAction("more");
    setQty("");
    setPrice("");
    setDate("");
    setError(null);
    setSipAmount(row.sip ? String(row.sip.amount) : "");
    setSipDay(row.sip ? String(row.sip.dayOfMonth) : "");
    setSipEnd(row.sip?.endDate ?? "");
    setSipStart("");
    setDraft(
      isManualClass(row.assetClass)
        ? { assetClass: row.assetClass, name: row.name, invested: String(row.avgPrice), value: String(row.details?.value ?? row.avgPrice), valueAsOf: row.details?.valueAsOf ?? today(), ratePct: row.details?.ratePct != null ? String(row.details.ratePct) : "", startDate: row.buyDate ?? "", maturityDate: row.details?.maturityDate ?? "" }
        : null,
    );
  }
  const r = row ?? loaded;
  if (!r) return null;
  const manual = isManualClass(r.assetClass);
  const meta = ASSET_META[r.assetClass];
  const unit = meta.unit || "units";

  const pick = (a: Action) => {
    setAction(a);
    setError(null);
    setQty(a === "edit" ? String(r.quantity) : "");
    setPrice(a === "edit" ? String(r.avgPrice) : a === "less" && r.price != null ? r.price.toFixed(2) : "");
    setDate(a === "edit" ? (r.buyDate ?? "") : a === "less" || a === "income" ? today() : "");
  };

  const q = num(qty), p = num(price);
  const preview =
    action === "more" && q > 0 && p > 0
      ? `After this: ${units(r.quantity + q)} ${unit} at an average of ${inr((r.quantity * r.avgPrice + q * p) / (r.quantity + q), { decimals: 2 })}.`
      : action === "less" && q > 0 && q < r.quantity
        ? `After this: ${units(r.quantity - q)} ${unit} left.${p > 0 ? ` The sale brings in ${inr(q * p)}.` : ""} The oldest purchases are sold first.`
        : action === "less" && q > r.quantity
          ? `This holding has ${units(r.quantity)} ${unit}.`
          : action === "less" && q === r.quantity
            ? `That is all of it, so ${r.name} leaves this portfolio. The sale is kept in your gains.`
            : null;
  const restates = action === "edit" && ((r.lots ?? 1) > 1 || (r.sip?.instalments ?? 0) > 0);

  const save = async () => {
    setError(null);
    try {
      if (manual) {
        const body = manualPayload(draft!);
        if (!body.ok) return setError(body.error);
        setBusy(true);
        await apiCall(`/api/holdings/${r.id}`, "PATCH", { manual: body.body });
      } else if (action === "sip") {
        const amount = num(sipAmount), day = num(sipDay);
        if (!(amount >= SIP_MIN_AMOUNT)) return setError(`Enter the monthly amount, at least ${inr(SIP_MIN_AMOUNT)}.`);
        if (!Number.isInteger(day) || day < SIP_MIN_DAY || day > SIP_MAX_DAY) return setError(`Enter the day of the month it is debited, from ${SIP_MIN_DAY} to ${SIP_MAX_DAY}.`);
        setBusy(true);
        const j = await apiCall<{ added: number; skipped?: number }>(`/api/holdings/${r.id}/sip`, "PUT", { amount, dayOfMonth: day, startDate: r.sip ? undefined : sipStart || null, endDate: sipEnd || null, active: true });
        const gaps = j.skipped ? ` ${j.skipped} month${j.skipped === 1 ? " had" : "s had"} no price and ${j.skipped === 1 ? "was" : "were"} left out.` : "";
        toast(j.added > 0 ? `${inr(amount)} a month into ${r.name}. ${j.added} instalment${j.added === 1 ? "" : "s"} since ${dayLabel(sipStart, "en")} added.${gaps}` : `${inr(amount)} a month into ${r.name}, on the ${ordinal(day)}.${gaps}`);
        onClose();
        router.refresh();
        return;
      } else if (action === "more") {
        if (!(q > 0) || !(p > 0)) return setError(`Enter the ${unit} you bought and the price.`);
        setBusy(true);
        await apiCall(`/api/portfolios/${portfolioId}/holdings`, "POST", { mode: "add", holdings: [{ symbol: r.symbol, quantity: q, avgPrice: p, buyDate: date || null, source: "manual" }] });
      } else if (action === "history") {
        onClose();
        return;
      } else if (action === "income") {
        if (!(q > 0)) return setError("Enter the amount received.");
        if (!date) return setError("Enter the day it was paid.");
        setBusy(true);
        await apiCall(`/api/holdings/${r.id}/income`, "POST", { amount: q, date, kind: incomeKind });
        toast(`${inr(q)} ${incomeKind === "dividend" ? "dividend" : incomeKind === "interest" ? "interest" : "income"} from ${r.name} recorded`);
        onClose();
        router.refresh();
        return;
      } else if (action === "less") {
        if (!(q > 0)) return setError(`Enter the ${unit} you sold.`);
        if (q > r.quantity) return setError(`This holding has ${units(r.quantity)} ${unit}.`);
        if (!(p > 0)) return setError("Enter the price you sold at.");
        if (!date) return setError("Enter the day of the sale.");
        setBusy(true);
        const j = await apiCall<{ removed: boolean }>(`/api/holdings/${r.id}/sales`, "POST", { units: q, price: p, date });
        toast(j.removed ? `Sale of ${r.name} recorded. It has left this portfolio.` : `Sale of ${units(q)} ${unit} of ${r.name} recorded`);
        onClose();
        router.refresh();
        return;
      } else {
        if (!(q > 0) || !(p > 0)) return setError("Quantity and average price must be more than 0.");
        setBusy(true);
        await apiCall(`/api/holdings/${r.id}`, "PATCH", { quantity: q, avgPrice: p, buyDate: date || null });
      }
      toast(`${r.name} updated`);
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
      open={!!row}
      onClose={onClose}
      wide={manual}
      title={r.name}
      description={manual ? meta.label : `${units(r.quantity)} ${unit} at an average of ${inr(r.avgPrice, { decimals: 2 })}`}
      footer={
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" className="text-loss hover:bg-loss-soft hover:text-loss" onClick={() => { onClose(); onRemove(r); }}>
            <Trash2 className="h-4 w-4" /> Remove
          </Button>
          <Button loading={busy} onClick={save}>
            {manual ? "Save" : action === "history" ? "Done" : action === "income" ? "Record income" : action === "more" ? "Add purchase" : action === "less" ? "Record sale" : action === "sip" ? (r.sip ? (r.sip.active ? "Save SIP" : "Resume SIP") : "Start SIP") : "Save"}
          </Button>
        </div>
      }
    >
      {manual && draft ? (
        <ManualFields draft={draft} onChange={setDraft} idPrefix="edit" />
      ) : (
        <div className="space-y-4">
          <Segmented<Action> label="What changed" value={action} onChange={pick} options={[{ value: "more", label: "Bought more" }, { value: "less", label: "Sold some" }, { value: "edit", label: "Correct it" }, { value: "sip", label: r.sip ? "Monthly SIP ✓" : "Monthly SIP" }, { value: "income", label: "Income" }, { value: "history", label: "History" }]} />
          {action === "history" && <HistoryPanel id={r.id} unit={unit} onChanged={() => router.refresh()} />}
          {action === "income" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount received (₹)" htmlFor="ia">
                  <Input id="ia" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="2500" />
                </Field>
                <Field label="Paid on" htmlFor="id">
                  <Input id="id" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
              </div>
              <Segmented<IncomeKind> label="Kind of income" size="sm" value={incomeKind} onChange={setIncomeKind} options={[{ value: "dividend", label: "Dividend" }, { value: "interest", label: "Interest" }, { value: "other", label: "Other" }]} />
              <p className="t-caption">What landed in your bank. It counts in this holding&apos;s total return, and stays in your records after the holding is sold.</p>
            </div>
          )}
          {action === "sip" && <SipFields r={r} amount={sipAmount} day={sipDay} end={sipEnd} start={sipStart} onAmount={setSipAmount} onDay={setSipDay} onEnd={setSipEnd} onStart={setSipStart} busy={busy} setBusy={setBusy} onError={setError} onDone={() => { onClose(); router.refresh(); }} />}
          <div className={action === "sip" || action === "income" || action === "history" ? "hidden" : "grid grid-cols-2 gap-3"}>
            <Field label={action === "more" ? `${unit[0].toUpperCase()}${unit.slice(1)} bought` : action === "less" ? `${unit[0].toUpperCase()}${unit.slice(1)} sold` : `${unit[0].toUpperCase()}${unit.slice(1)} held`} htmlFor="hq">
              <Input id="hq" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder={action === "less" ? String(r.quantity) : "10"} />
            </Field>
            <Field label={action === "more" ? "Price paid (₹)" : action === "less" ? "Price sold at (₹)" : `${meta.priceLabel} (₹)`} htmlFor="hp">
              <Input id="hp" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={r.price ? r.price.toFixed(2) : ""} />
            </Field>
          </div>
          {action === "less" && (
            <Field label="Sold on" htmlFor="hsd">
              <Input id="hsd" type="date" max={today()} min={r.buyDate ?? undefined} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          )}
          {action === "less" && r.quantity > 0 && qty.trim() === "" && (
            <button onClick={() => setQty(String(r.quantity))} className="text-[13px] font-medium text-accent">
              Sold all {units(r.quantity)} {unit}
            </button>
          )}
          {action === "more" && r.price != null && price.trim() === "" && (
            <button onClick={() => setPrice(r.price!.toFixed(2))} className="text-[13px] font-medium text-accent">
              Use the latest price, {inr(r.price, { decimals: 2 })}
            </button>
          )}
          {action === "edit" && (
            <Field label="First bought on (optional)" htmlFor="hd" hint="Used for your yearly return (XIRR) and the Nifty comparison.">
              <Input id="hd" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          )}
          {restates && (
            <p className="rounded-[12px] bg-loss-soft px-3.5 py-2.5 text-sm text-text">
              Correcting this replaces its {r.lots && r.lots > 1 ? `${r.lots} purchases` : "purchases"}{r.sip?.instalments ? `, including the SIP instalments,` : ""} with one. To record a sale, use Sold some.
            </p>
          )}
          {preview && <p className="num rounded-[12px] bg-surface-2 px-3.5 py-2.5 text-sm text-text">{preview}</p>}
        </div>
      )}
      <div className="mt-4">
        <FormAlert message={error} />
      </div>
    </Sheet>
  );
}

/**
 * The monthly SIP on a holding. Nazar cannot see the debit, so it says plainly what it will do:
 * add the instalment it expects on each due date, and let an import put right whatever differs.
 */
function SipFields({ r, amount, day, end, start, onAmount, onDay, onEnd, onStart, busy, setBusy, onDone, onError }: { r: HoldingRow; amount: string; day: string; end: string; start: string; onAmount: (v: string) => void; onDay: (v: string) => void; onEnd: (v: string) => void; onStart: (v: string) => void; busy: boolean; setBusy: (b: boolean) => void; onDone: () => void; onError: (m: string | null) => void }) {
  const sip = r.sip ?? null;
  const d = num(day);
  const dayOk = Number.isInteger(d) && d >= SIP_MIN_DAY && d <= SIP_MAX_DAY;
  const first = dayOk ? (sip && sip.active && sip.dayOfMonth === d ? sip.nextDue : dueOnOrAfter(d, today())) : null;
  // A start date in the past: how many instalments that is, and the rupees in them, said before anything is saved.
  const past = !sip && dayOk && start && start <= today() ? instalmentsSince(d, start, today()) : 0;
  const a = num(amount);
  const change = async (method: "PUT" | "DELETE", body?: unknown, undo = false) => {
    onError(null);
    setBusy(true);
    try {
      const j = await apiCall<{ removedInstalments?: number }>(`/api/holdings/${r.id}/sip${undo ? "?undo=1" : ""}`, method, body);
      toast(method === "DELETE" ? (undo && j.removedInstalments ? `SIP into ${r.name} stopped, and its ${j.removedInstalments} instalment${j.removedInstalments === 1 ? "" : "s"} taken out` : `SIP into ${r.name} stopped`) : `SIP into ${r.name} paused`);
      onDone();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      {sip && (
        <p className="num rounded-[12px] bg-surface-2 px-3.5 py-2.5 text-sm text-text">
          {sip.active ? `${inr(sip.amount)} on the ${ordinal(sip.dayOfMonth)} of each month. Next: ${dayLabel(sip.nextDue, "en")}.` : `Paused: ${inr(sip.amount)} on the ${ordinal(sip.dayOfMonth)}. Nothing is being added.`}
          {sip.startDate ? ` Started ${dayLabel(sip.startDate, "en")}.` : ""}
          {sip.instalments > 0 ? ` Nazar has added ${sip.instalments} instalment${sip.instalments === 1 ? "" : "s"}, ${inr(sip.invested)} in all.` : ""}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount each month (₹)" htmlFor="sa">
          <Input id="sa" inputMode="decimal" value={amount} onChange={(e) => onAmount(e.target.value)} placeholder="5000" />
        </Field>
        <Field label="Day of the month" htmlFor="sd" hint={`${SIP_MIN_DAY} to ${SIP_MAX_DAY}`}>
          <Input id="sd" inputMode="numeric" value={day} onChange={(e) => onDay(e.target.value)} placeholder="5" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {!sip && (
          <Field label="Started on (optional)" htmlFor="ss" hint="If it began earlier">
            <Input id="ss" type="date" max={today()} value={start} onChange={(e) => onStart(e.target.value)} />
          </Field>
        )}
        <Field label="Ends on (optional)" htmlFor="se">
          <Input id="se" type="date" min={today()} value={end} onChange={(e) => onEnd(e.target.value)} />
        </Field>
      </div>
      {past > 0 ? (
        <p className="num rounded-[12px] bg-accent-soft px-3.5 py-2.5 text-sm text-text">
          Nazar will add {past} instalment{past === 1 ? "" : "s"} since {dayLabel(start, "en")}{a > 0 ? `, ${inr(a * past)} in all` : ""}, each at the price of its own day. They are added on top of the {units(r.quantity)} {ASSET_META[r.assetClass].unit || "units"} this holding has now, so enter only what you held before the SIP.
          {r.source && r.source !== "manual" ? " This holding came from a broker file or statement, which already counts the units these instalments bought: adding them here would count them twice." : ""}
        </p>
      ) : (
        first && <p className="num rounded-[12px] bg-surface-2 px-3.5 py-2.5 text-sm text-text">First instalment Nazar will add: {dayLabel(first, "en")}.{!sip && " With no start date, the units you have today are taken to include every instalment so far."}</p>
      )}
      <p className="t-caption">Nazar cannot see your bank, so on each due date it adds the instalment at that day’s price. If one did not go through, pause the SIP or use “Correct it”. Importing a statement replaces these with what was actually bought.</p>
      {sip && (
        <div className="flex gap-2">
          {sip.active && (
            <Button variant="secondary" disabled={busy} onClick={() => change("PUT", { amount: sip.amount, dayOfMonth: sip.dayOfMonth, endDate: sip.endDate, active: false })}>
              Pause
            </Button>
          )}
          <Button variant="ghost" className="text-loss hover:bg-loss-soft hover:text-loss" disabled={busy} onClick={() => change("DELETE")}>
            Stop SIP
          </Button>
        </div>
      )}
      {sip && sip.instalments > 0 && (
        <button type="button" disabled={busy} onClick={() => change("DELETE", undefined, true)} className="text-left text-[13px] font-medium text-loss hover:underline">
          Stop, and take out the {sip.instalments} instalment{sip.instalments === 1 ? "" : "s"} Nazar added
        </button>
      )}
    </div>
  );
}

type History = { lots: { id: string; date: string; quantity: number; remaining: number; price: number; sip: boolean }[]; sales: { id: string; date: string; units: number; price: number; cost: number }[]; income: { id: string; date: string; kind: string; amount: number }[] };

/** Every purchase (and how much of it is still held), every sale and every payout, newest first. */
function HistoryPanel({ id, unit, onChanged }: { id: string; unit: string; onChanged: () => void }) {
  const [h, setH] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    apiCall<History>(`/api/holdings/${id}/history`, "GET").then(setH).catch((e) => setError((e as Error).message));
  }, [id]);
  useEffect(load, [load]);
  const remove = async (url: string, what: string) => {
    try {
      await apiCall(url, "DELETE");
      toast(`${what} removed`);
      load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (error) return <FormAlert message={error} />;
  if (!h) return <p className="text-sm text-muted">Loading…</p>;
  const live = h.lots.filter((l) => l.remaining > 0).length;
  type Entry = { key: string; date: string; text: string; amount: number; sub: string; onDelete?: () => void };
  const entries: Entry[] = [
    ...h.lots.map((l) => ({
      key: `l${l.id}`,
      date: l.date,
      text: `${l.sip ? "SIP instalment" : "Bought"} ${units(l.quantity)} ${unit} at ${inr(l.price, { decimals: 2 })}`,
      amount: -l.quantity * l.price,
      sub: l.remaining <= 0 ? "all sold since" : l.remaining < l.quantity ? `${units(l.remaining)} still held` : "still held",
      onDelete: l.remaining > 0 && live > 1 ? () => remove(`/api/holdings/${id}/lots/${l.id}`, "Purchase") : undefined,
    })),
    ...h.sales.map((x) => ({ key: `s${x.id}`, date: x.date, text: `Sold ${units(x.units)} ${unit} at ${inr(x.price, { decimals: 2 })}`, amount: x.units * x.price, sub: `${x.units * x.price - x.cost >= 0 ? "gain" : "loss"} of ${inr(Math.abs(Math.round(x.units * x.price - x.cost)))}` })),
    ...h.income.map((x) => ({ key: `i${x.id}`, date: x.date, text: x.kind === "dividend" ? "Dividend" : x.kind === "interest" ? "Interest" : "Income", amount: x.amount, sub: "paid out", onDelete: () => remove(`/api/income/${x.id}`, "Income") })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!entries.length) return <p className="text-sm text-muted">Nothing recorded yet.</p>;
  return (
    <ul className="divide-y divide-line rounded-[12px] border border-line">
      {entries.map((e) => (
        <li key={e.key} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
          <span className="min-w-0">
            <span className="block text-sm text-text">{e.text}</span>
            <span className="block text-[12px] text-subtle">
              {dayLabel(e.date, "en")} · {e.sub}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <span className={`num text-sm ${e.amount >= 0 ? "text-gain" : "text-muted"}`}>{e.amount >= 0 ? "+" : "−"}{inr(Math.abs(Math.round(e.amount)))}</span>
            {e.onDelete && (
              <button onClick={e.onDelete} aria-label={`Remove: ${e.text}`} className="rounded-full p-1.5 text-subtle hover:bg-loss-soft hover:text-loss">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
