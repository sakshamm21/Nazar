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
import { inr } from "@/lib/format";
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
};

type Action = "more" | "less" | "edit";
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
            {manual ? "Save" : action === "more" ? "Add purchase" : action === "less" ? "Record sale" : "Save"}
          </Button>
        </div>
      }
    >
      {manual && draft ? (
        <ManualFields draft={draft} onChange={setDraft} idPrefix="edit" />
      ) : (
        <div className="space-y-4">
          <Segmented<Action> label="What changed" value={action} onChange={pick} options={[{ value: "more", label: "Bought more" }, { value: "less", label: "Sold some" }, { value: "edit", label: "Correct it" }]} />
          <div className="grid grid-cols-2 gap-3">
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
