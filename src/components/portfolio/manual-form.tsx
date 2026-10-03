"use client";
import { Field, Input } from "@/components/ui/field";
import { ASSET_META, manualValue, type ManualClass } from "@/lib/instruments/asset-classes";
import { inr } from "@/lib/format";

/** What the form holds while the user types (strings), for a deposit, PF balance, property, cash… */
export type ManualDraft = { assetClass: ManualClass; name: string; invested: string; value: string; valueAsOf: string; ratePct: string; startDate: string; maturityDate: string };

export const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

/** Per-kind wording and which optional fields make sense. */
export const MANUAL_KINDS: { assetClass: ManualClass; title: string; blurb: string; namePlaceholder: string; rate: boolean; maturity: boolean; investedLabel: string; valueLabel: string; defaultRate?: string }[] = [
  { assetClass: "fd", title: "Fixed or recurring deposit", blurb: "Grows at the bank's rate, compounded quarterly.", namePlaceholder: "SBI FD", rate: true, maturity: true, investedLabel: "Amount deposited (₹)", valueLabel: "Value on that date (₹)" },
  { assetClass: "ppf", title: "PPF", blurb: "Your balance, growing at the PPF rate.", namePlaceholder: "PPF account", rate: true, maturity: false, investedLabel: "Total you have put in (₹)", valueLabel: "Current balance (₹)", defaultRate: "7.1" },
  { assetClass: "epf", title: "EPF", blurb: "Your provident fund balance from the passbook.", namePlaceholder: "EPF", rate: true, maturity: false, investedLabel: "Total contributed (₹)", valueLabel: "Current balance (₹)", defaultRate: "8.25" },
  { assetClass: "nps", title: "NPS", blurb: "Your pension account's current value.", namePlaceholder: "NPS Tier 1", rate: false, maturity: false, investedLabel: "Total contributed (₹)", valueLabel: "Current value (₹)" },
  { assetClass: "bond", title: "Bond or debenture", blurb: "Government or company bonds held to maturity.", namePlaceholder: "REC 54EC bond", rate: true, maturity: true, investedLabel: "Amount invested (₹)", valueLabel: "Value on that date (₹)" },
  { assetClass: "property", title: "Property", blurb: "A home, flat or land, at your own estimate.", namePlaceholder: "Flat in Pune", rate: false, maturity: false, investedLabel: "What you paid (₹)", valueLabel: "What it is worth now (₹)" },
  { assetClass: "cash", title: "Cash and savings", blurb: "Bank balance or cash you count as part of this portfolio.", namePlaceholder: "HDFC savings account", rate: true, maturity: false, investedLabel: "Amount (₹)", valueLabel: "Balance (₹)" },
  { assetClass: "other", title: "Anything else", blurb: "Unlisted shares, a loan you gave, a chit fund, art.", namePlaceholder: "Unlisted shares of X", rate: true, maturity: false, investedLabel: "Amount invested (₹)", valueLabel: "Current value (₹)" },
];
export const kindOf = (c: ManualClass) => MANUAL_KINDS.find((k) => k.assetClass === c)!;

export const emptyDraft = (assetClass: ManualClass): ManualDraft => ({ assetClass, name: "", invested: "", value: "", valueAsOf: today(), ratePct: kindOf(assetClass).defaultRate ?? "", startDate: "", maturityDate: "" });

const n = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/,/g, "")));

/** The API payload for a draft, or the first thing that is missing. */
export function manualPayload(d: ManualDraft): { ok: true; body: { assetClass: ManualClass; name: string; invested: number; value: number; valueAsOf: string; ratePct: number | null; startDate: string | null; maturityDate: string | null } } | { ok: false; error: string } {
  const invested = n(d.invested);
  const value = d.value.trim() === "" ? invested : n(d.value);
  if (!d.name.trim()) return { ok: false, error: "Give it a name so you can recognise it." };
  if (!(invested > 0)) return { ok: false, error: `Enter ${kindOf(d.assetClass).investedLabel.replace(" (₹)", "").toLowerCase()}.` };
  if (!(value > 0)) return { ok: false, error: "Enter its value." };
  const rate = d.ratePct.trim() === "" ? null : n(d.ratePct);
  if (rate != null && !(rate >= 0 && rate <= 40)) return { ok: false, error: "The interest rate should be between 0 and 40%." };
  return { ok: true, body: { assetClass: d.assetClass, name: d.name.trim(), invested, value, valueAsOf: d.valueAsOf || today(), ratePct: rate, startDate: d.startDate || null, maturityDate: d.maturityDate || null } };
}

/** The fields for one manual asset; used when adding and when editing. */
export function ManualFields({ draft, onChange, idPrefix }: { draft: ManualDraft; onChange: (d: ManualDraft) => void; idPrefix: string }) {
  const k = kindOf(draft.assetClass);
  const set = (patch: Partial<ManualDraft>) => onChange({ ...draft, ...patch });
  const p = manualPayload(draft);
  const now = p.ok ? manualValue(draft.assetClass, { value: p.body.value, valueAsOf: p.body.valueAsOf, ratePct: p.body.ratePct, maturityDate: p.body.maturityDate }, p.body.invested, today()) : null;
  const id = (s: string) => `${idPrefix}-${s}`;
  return (
    <div className="space-y-4">
      <Field label="Name" htmlFor={id("name")}>
        <Input id={id("name")} value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder={k.namePlaceholder} maxLength={80} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={k.investedLabel} htmlFor={id("invested")}>
          <Input id={id("invested")} inputMode="decimal" value={draft.invested} onChange={(e) => set({ invested: e.target.value })} placeholder="2,00,000" />
        </Field>
        <Field label={k.valueLabel} htmlFor={id("value")} hint="Leave empty if it is the same.">
          <Input id={id("value")} inputMode="decimal" value={draft.value} onChange={(e) => set({ value: e.target.value })} placeholder={draft.invested || "2,00,000"} />
        </Field>
        <Field label="Value as of" htmlFor={id("asof")}>
          <Input id={id("asof")} type="date" max={today()} value={draft.valueAsOf} onChange={(e) => set({ valueAsOf: e.target.value })} />
        </Field>
        {k.rate && (
          <Field label="Interest rate (% a year, optional)" htmlFor={id("rate")} hint="Nazar grows the value at this rate every day.">
            <Input id={id("rate")} inputMode="decimal" value={draft.ratePct} onChange={(e) => set({ ratePct: e.target.value })} placeholder="7.1" />
          </Field>
        )}
        <Field label="Started on (optional)" htmlFor={id("start")} hint="Used for your yearly return (XIRR).">
          <Input id={id("start")} type="date" max={today()} value={draft.startDate} onChange={(e) => set({ startDate: e.target.value })} />
        </Field>
        {k.maturity && (
          <Field label="Matures on (optional)" htmlFor={id("maturity")} hint="Interest stops adding after this date.">
            <Input id={id("maturity")} type="date" value={draft.maturityDate} onChange={(e) => set({ maturityDate: e.target.value })} />
          </Field>
        )}
      </div>
      {now != null && p.ok && Math.abs(now - p.body.value) >= 1 && (
        <p className="rounded-[12px] bg-surface-2 px-3.5 py-2.5 text-sm text-muted">
          Worth about <span className="num font-medium text-text">{inr(now)}</span> today, at {p.body.ratePct}% a year since {p.body.valueAsOf}.
        </p>
      )}
      <p className="t-caption">{ASSET_META[draft.assetClass].label} has no public price, so Nazar uses what you enter here. Update it whenever it changes.</p>
    </div>
  );
}
