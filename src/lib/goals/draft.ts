/**
 * What the goals form holds while the user types (strings), and the payload it sends. Kept out of the
 * component so the same rules can be tested, and so the form and the API can never disagree.
 */
export type GoalDraft = {
  name: string;
  target: string;
  byDate: string;
  saved: string;
  savedAsOf: string;
  monthly: string;
  ratePct: string;
};

/** India is a day ahead or behind UTC; the calendar date the user is actually looking at. */
export const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

/** A date two years out, rounded up to the end of the month — the usual shape of a goal. */
export function defaultByDate(): string {
  const d = new Date(Date.now() + 5.5 * 3600_000);
  d.setUTCMonth(d.getUTCMonth() + 24);
  return d.toISOString().slice(0, 10);
}

export const emptyDraft = (): GoalDraft => ({ name: "", target: "", byDate: defaultByDate(), saved: "", savedAsOf: today(), monthly: "", ratePct: "" });

export type GoalPayload = { name: string; target: number; byDate: string; saved: number; savedAsOf: string; monthly: number | null; ratePct: number | null };

const n = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/,/g, "")));

/** The API payload for a draft, or the first thing that is missing. */
export function goalPayload(d: GoalDraft): { ok: true; body: GoalPayload } | { ok: false; error: string } {
  const target = n(d.target);
  const saved = d.saved.trim() === "" ? 0 : n(d.saved);
  if (!d.name.trim()) return { ok: false, error: "Give the goal a name so you can recognise it." };
  if (!(target > 0)) return { ok: false, error: "Enter the amount you need." };
  if (!d.byDate) return { ok: false, error: "Choose the date the money is needed." };
  if (!(Number.isFinite(saved) && saved >= 0)) return { ok: false, error: "What is saved cannot be negative." };
  const monthly = d.monthly.trim() === "" ? null : n(d.monthly);
  if (monthly != null && !(Number.isFinite(monthly) && monthly >= 0)) return { ok: false, error: "The monthly amount cannot be negative." };
  const ratePct = d.ratePct.trim() === "" ? null : n(d.ratePct);
  if (ratePct != null && !(Number.isFinite(ratePct) && ratePct >= 0 && ratePct <= 40)) return { ok: false, error: "The yearly rate should be between 0 and 40%." };
  return { ok: true, body: { name: d.name.trim().slice(0, 60), target, byDate: d.byDate, saved, savedAsOf: d.savedAsOf || today(), monthly, ratePct } };
}

/** How often the amount added each month is recorded, from when the user says it started. */
export const RECORDING: { value: string; label: string; hint: string }[] = [
  { value: "yearly", label: "Once a year", hint: "Record 12 instalments a year." },
  { value: "monthly", label: "Every month", hint: "Record each month's instalment." },
];

/** Only a monthly plan has dated instalments, so only it can be given a money-weighted return. */
export const needsRecording = (monthly: number | null) => (monthly ?? 0) > 0;

/** The two numbers progress touches, as a draft, so the progress sheet reuses the same rules. */
export const progressDraft = (saved: number, savedAsOf: string | null): GoalDraft => ({ ...emptyDraft(), saved: saved ? String(saved) : "", savedAsOf: savedAsOf ?? today() });