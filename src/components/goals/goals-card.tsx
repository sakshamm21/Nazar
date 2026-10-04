"use client";

import { CalendarClock, Check, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Field, FormAlert, Input } from "@/components/ui/field";
import { InfoTip } from "@/components/ui/info-tip";
import { Sheet } from "@/components/ui/sheet";
import { apiCall } from "@/lib/api-client";
import { dayLabel, inr } from "@/lib/format";
import { emptyDraft, goalPayload, progressDraft, progressPayload, today, type GoalDraft } from "@/lib/goals/draft";
import { MAX_GOALS } from "@/lib/goals/schema";
import type { GoalRow, GoalsView } from "@/lib/views/goals";

const MONTHS = (n: number) => (n < 1 ? "under a month" : n < 2 ? "about a month" : `${Math.round(n)} months`);

/**
 * The user's goals, and what each one requires from here. Everything shown is arithmetic on the
 * user's own figures: what is saved, what is added each month, and the day the money is needed.
 * No rate is assumed — growth appears only when the user has entered their own.
 */
export function GoalsCard({ view }: { view: GoalsView }) {
  const router = useRouter();
  const [editing, setEditing] = useState<GoalRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [progress, setProgress] = useState<GoalRow | null>(null);
  const [confirm, setConfirm] = useState<GoalRow | null>(null);
  const full = view.rows.length >= MAX_GOALS;

  const remove = async () => {
    if (!confirm) return;
    await apiCall(`/api/goals/${confirm.goal.id}`, "DELETE");
    setConfirm(null);
    router.refresh();
  };

  return (
    <Card className="p-5 sm:p-6">
      <CardHeader
        overline="Goals"
        title="What each one needs from here"
        right={
          <div className="flex items-center gap-1.5">
            <InfoTip k="goals" />
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)} disabled={full} title={full ? `You can track up to ${MAX_GOALS} goals.` : undefined}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        }
      />

      {view.rows.length === 0 ? (
        <p className="mt-3 text-sm leading-6 text-muted">
          Name an amount and the day you need it by. Nazar works out what a month would have to be and how today&apos;s pace compares, then updates as you record what has been put away.
        </p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-b border-line pb-4">
            <div>
              <dt className="text-[12px] text-subtle">Still to put away</dt>
              <dd className="num mt-0.5 text-[17px] font-medium text-text">{inr(view.toGo)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-subtle">Added each month</dt>
              <dd className="num mt-0.5 text-[17px] font-medium text-text">{inr(view.monthly)}</dd>
            </div>
          </dl>
          <ul className="mt-1 divide-y divide-line">
            {view.rows.map((row) => (
              <li key={row.goal.id} className="py-4">
                <GoalRowItem row={row} onEdit={() => setEditing(row)} onProgress={() => setProgress(row)} onDelete={() => setConfirm(row)} />
              </li>
            ))}
          </ul>
        </>
      )}

      <GoalSheet open={adding || !!editing} goal={editing?.goal ?? null} onClose={() => { setAdding(false); setEditing(null); }} />
      <ProgressSheet row={progress} onClose={() => setProgress(null)} />
      <Sheet
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={`Remove "${confirm?.goal.name}"?`}
        description="The figures recorded for it are removed too. Nothing in your portfolio changes."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={remove}>
              <Trash2 className="h-4 w-4" /> Remove
            </Button>
          </div>
        }
            >
              {confirm && (
                <p className="text-sm leading-6 text-muted">
                  {inr(confirm.goal.target)} by {dayLabel(confirm.goal.byDate, "en", false)}, with {inr(confirm.goal.saved)} saved. This cannot be undone.
                </p>
              )}
            </Sheet>
    </Card>
  );
}

function GoalRowItem({ row, onEdit, onProgress, onDelete }: { row: GoalRow; onEdit: () => void; onProgress: () => void; onDelete: () => void }) {
  const { projection: p, goal } = row;
  const met = p.status === "met";
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[15px] font-medium text-text">{goal.name}</span>
            <Chip tone={row.tone}>{row.status}</Chip>
          </div>
          <div className="mt-0.5 text-[12px] text-subtle">
            {inr(goal.target)} by {dayLabel(goal.byDate, "en", false)}
            {p.monthsLeft > 0 && !met && ` · ${MONTHS(p.monthsLeft)} away`}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onProgress} className="rounded-full p-2 text-subtle hover:bg-surface-2 hover:text-text" aria-label={`Record progress on ${goal.name}`} title="Record what has been put away">
            <Check className="h-4 w-4" />
          </button>
          <button onClick={onEdit} className="rounded-full p-2 text-subtle hover:bg-surface-2 hover:text-text" aria-label={`Edit ${goal.name}`}>
            <CalendarClock className="h-4 w-4" />
          </button>
          <button onClick={onDelete} className="rounded-full p-2 text-subtle hover:bg-loss-soft hover:text-loss" aria-label={`Remove ${goal.name}`}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(p.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${goal.name} progress`}>
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(p.progress * 100, goal.saved > 0 ? 2 : 0)}%` }} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
        <div>
          <dt className="text-[12px] text-subtle">Saved</dt>
          <dd className="num text-[14px] font-medium text-text">{inr(goal.saved)}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-subtle">Needs each month</dt>
          <dd className="num text-[14px] font-medium text-text">{Number.isFinite(p.requiredMonthly) ? inr(p.requiredMonthly) : "—"}</dd>
        </div>
        {!met && (
          <div>
            <dt className="text-[12px] text-subtle">{p.gap >= 0 ? "Above target by" : "Short by"}</dt>
            <dd className="num text-[14px] font-medium text-text">{inr(Math.abs(p.gap))}</dd>
          </div>
        )}
        {row.xirr != null && (
          <div>
            <dt className="text-[12px] text-subtle">Your return</dt>
            <dd className="num text-[14px] font-medium text-text">
              {row.xirr.toFixed(1)}% <span className="text-[11px] font-normal text-subtle">a year</span>
            </dd>
          </div>
        )}
      </dl>

      <p className="mt-3 text-[13px] leading-5 text-subtle">
        {met ? (
          "The target amount is already saved."
        ) : (
          <>
            {p.monthsLeft > 0 && <>At {inr(goal.monthly ?? 0)} a month this reaches {inr(p.projected)} by then. </>}
            {p.status === "no-plan" ? "Add what you are setting aside each month to see where it lands." : p.onTrackFor && p.onTrackFor !== goal.byDate ? <>At this pace the amount is reached by {dayLabel(p.onTrackFor, "en", false)}.</> : null}
          </>
        )}
      </p>
    </div>
  );
}

/** Adding or editing a goal: the same fields and the same rules, whether it is new or not. */
function GoalSheet({ open, goal, onClose }: { open: boolean; goal: GoalRow["goal"] | null; onClose: () => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState<GoalDraft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Reopening for another goal starts from that goal's figures, never from the last one's.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (open && loadedFor !== (goal?.id ?? "new")) {
    setLoadedFor(goal?.id ?? "new");
    setDraft(goal ? { name: goal.name, target: String(goal.target), byDate: goal.byDate, saved: String(goal.saved), savedAsOf: goal.savedAsOf ?? today(), monthly: goal.monthly == null ? "" : String(goal.monthly), ratePct: goal.ratePct == null ? "" : String(goal.ratePct) } : emptyDraft());
    setError(null);
  }

  const set = (patch: Partial<GoalDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = goalPayload(draft);
    if (!p.ok) return setError(p.error);
    setBusy(true);
    try {
      await apiCall(goal ? `/api/goals/${goal.id}` : "/api/goals", goal ? "PATCH" : "POST", p.body);
      setLoadedFor(null);
      onClose();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={goal ? "Change this goal" : "Track a goal"}
      description={goal ? "The target and the date stay as they are unless you change them here." : "An amount and the day you need it. Nazar works out the rest."}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="goal-form" loading={busy}>
            {goal ? "Save changes" : "Add goal"}
          </Button>
        </div>
      }
    >
      <form id="goal-form" onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Name" htmlFor="goal-name">
          <Input id="goal-name" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Child's education" maxLength={60} autoFocus />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount needed (₹)" htmlFor="goal-target">
            <Input id="goal-target" inputMode="decimal" value={draft.target} onChange={(e) => set({ target: e.target.value })} placeholder="25,00,000" />
          </Field>
          <Field label="Needed by" htmlFor="goal-date">
            <Input id="goal-date" type="date" value={draft.byDate} onChange={(e) => set({ byDate: e.target.value })} />
          </Field>
          <Field label="Already saved (₹)" htmlFor="goal-saved">
            <Input id="goal-saved" inputMode="decimal" value={draft.saved} onChange={(e) => set({ saved: e.target.value })} placeholder="1,50,000" />
          </Field>
          <Field label="Measured on" htmlFor="goal-asof">
            <Input id="goal-asof" type="date" max={today()} value={draft.savedAsOf} onChange={(e) => set({ savedAsOf: e.target.value })} />
          </Field>
          <Field label="Added each month (₹)" htmlFor="goal-monthly">
            <Input id="goal-monthly" inputMode="decimal" value={draft.monthly} onChange={(e) => set({ monthly: e.target.value })} placeholder="20,000" />
          </Field>
          <Field label="Yearly rate you expect (%, optional)" htmlFor="goal-rate" hint="Only used to show what growth would add. Left empty, nothing grows.">
            <Input id="goal-rate" inputMode="decimal" value={draft.ratePct} onChange={(e) => set({ ratePct: e.target.value })} placeholder="7" />
          </Field>
        </div>
        <FormAlert message={error} />
        <p className="t-caption">Nazar adds your figures up. It does not say what to put the money in, or when to begin.</p>
      </form>
    </Sheet>
  );
}

/** Recording progress: only the amount, and the day it was measured. */
function ProgressSheet({ row, onClose }: { row: GoalRow | null; onClose: () => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState<GoalDraft>(() => progressDraft(0, null));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (row && loadedFor !== row.goal.id) {
    setLoadedFor(row.goal.id);
    setDraft(progressDraft(row.goal.saved, row.goal.savedAsOf));
    setError(null);
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
      const p = progressPayload(draft);
    if (!p.ok) return setError(p.error);
    setBusy(true);
    try {
        await apiCall(`/api/goals/${row!.goal.id}/progress`, "POST", p.body);
      setLoadedFor(null);
      onClose();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={!!row}
      onClose={onClose}
      title="Record what is saved"
      description={row ? `${row.goal.name} needs ${inr(row.goal.target)} by ${dayLabel(row.goal.byDate, "en", false)}.` : undefined}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="goal-progress-form" loading={busy}>
            Save
          </Button>
        </div>
      }
    >
      <form id="goal-progress-form" onSubmit={save} className="space-y-4" noValidate>
        <Field label="Amount saved now (₹)" htmlFor="goal-progress-saved">
          <Input id="goal-progress-saved" inputMode="decimal" value={draft.saved} onChange={(e) => setDraft((d) => ({ ...d, saved: e.target.value }))} autoFocus />
        </Field>
        <Field label="Measured on" htmlFor="goal-progress-asof" hint="Progress is never credited to a day it did not happen on.">
          <Input id="goal-progress-asof" type="date" max={today()} value={draft.savedAsOf} onChange={(e) => setDraft((d) => ({ ...d, savedAsOf: e.target.value }))} />
        </Field>
        <FormAlert message={error} />
      </form>
    </Sheet>
  );
}