"use client";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
};

export type SipRow = { amount: number; dayOfMonth: number; startDate: string | null; endDate: string | null; active: boolean; nextDue: string; instalments: number; invested: number };

type Action = "more" | "less" | "edit" | "sip";
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
    setPrice(a === "edit" ? String(r.avgPrice) : "");
    setDate(a === "edit" ? (r.buyDate ?? "") : "");
  };

  const q = num(qty), p = num(price);
  const preview =
    action === "more" && q > 0 && p > 0
      ? `After this: ${units(r.quantity + q)} ${unit} at an average of ${inr((r.quantity * r.avgPrice + q * p) / (r.quantity + q), { decimals: 2 })}.`
      : action === "less" && q > 0 && q < r.quantity
        ? `After this: ${units(r.quantity - q)} ${unit}, still at an average of ${inr(r.avgPrice, { decimals: 2 })}.`
        : action === "less" && q >= r.quantity
          ? `That is all of it, so ${r.name} will be removed.`
          : null;

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
        const j = await apiCall<{ added: number }>(`/api/holdings/${r.id}/sip`, "PUT", { amount, dayOfMonth: day, startDate: r.sip ? undefined : sipStart || null, endDate: sipEnd || null, active: true });
        toast(j.added > 0 ? `${inr(amount)} a month into ${r.name}. ${j.added} instalment${j.added === 1 ? "" : "s"} since ${dayLabel(sipStart, "en")} added.` : `${inr(amount)} a month into ${r.name}, on the ${ordinal(day)}`);
        onClose();
        router.refresh();
        return;
      } else if (action === "more") {
        if (!(q > 0) || !(p > 0)) return setError(`Enter the ${unit} you bought and the price.`);
        setBusy(true);
        await apiCall(`/api/portfolios/${portfolioId}/holdings`, "POST", { mode: "add", holdings: [{ symbol: r.symbol, quantity: q, avgPrice: p, buyDate: date || null, source: "manual" }] });
      } else if (action === "less") {
        if (!(q > 0)) return setError(`Enter the ${unit} you sold.`);
        if (q >= r.quantity) {
          onClose();
          return onRemove(r);
        }
        setBusy(true);
        await apiCall(`/api/holdings/${r.id}`, "PATCH", { quantity: r.quantity - q });
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
            {manual ? "Save" : action === "more" ? "Add purchase" : action === "less" ? "Record sale" : action === "sip" ? (r.sip ? (r.sip.active ? "Save SIP" : "Resume SIP") : "Start SIP") : "Save"}
          </Button>
        </div>
      }
    >
      {manual && draft ? (
        <ManualFields draft={draft} onChange={setDraft} idPrefix="edit" />
      ) : (
        <div className="space-y-4">
          <Segmented<Action> label="What changed" value={action} onChange={pick} options={[{ value: "more", label: "Bought more" }, { value: "less", label: "Sold some" }, { value: "edit", label: "Correct it" }, { value: "sip", label: r.sip ? "Monthly SIP ✓" : "Monthly SIP" }]} />
          {action === "sip" && <SipFields r={r} amount={sipAmount} day={sipDay} end={sipEnd} start={sipStart} onAmount={setSipAmount} onDay={setSipDay} onEnd={setSipEnd} onStart={setSipStart} busy={busy} setBusy={setBusy} onError={setError} onDone={() => { onClose(); router.refresh(); }} />}
          <div className={action === "sip" ? "hidden" : "grid grid-cols-2 gap-3"}>
            <Field label={action === "more" ? `${unit[0].toUpperCase()}${unit.slice(1)} bought` : action === "less" ? `${unit[0].toUpperCase()}${unit.slice(1)} sold` : `${unit[0].toUpperCase()}${unit.slice(1)} held`} htmlFor="hq">
              <Input id="hq" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder={action === "less" ? String(r.quantity) : "10"} />
            </Field>
            {action !== "less" && (
              <Field label={action === "more" ? "Price paid (₹)" : `${meta.priceLabel} (₹)`} htmlFor="hp">
                <Input id="hp" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={r.price ? r.price.toFixed(2) : ""} />
              </Field>
            )}
          </div>
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
          {action === "less" && <p className="t-caption">Nazar keeps one position per holding, so a sale lowers the quantity and leaves the average price as it is.</p>}
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
