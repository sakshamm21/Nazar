"use client";
import { Check, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { apiCall } from "@/lib/api-client";
import { cn } from "@/lib/cn";

export type Step = { id: string; label: string; href: string; done: boolean };

/** The first few things worth doing in Nazar. Each ticks itself from what the account has done. */
export function StartChecklist({ steps }: { steps: Step[] }) {
  const router = useRouter();
  const done = steps.filter((s) => s.done).length;
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="t-overline">Getting started · {done} of {steps.length}</div>
          <h2 className="t-title-2 mt-1 text-text">Make Nazar yours</h2>
        </div>
        <button
          aria-label="Hide getting started"
          onClick={async () => {
            await apiCall("/api/settings", "PATCH", { prefs: { checklistDismissed: true } }).catch(() => null);
            router.refresh();
          }}
          className="rounded-full p-1.5 text-subtle hover:bg-surface-2 hover:text-text"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2">
        {steps.map((s, i) => (
          <li key={s.id}>
            <Link href={s.href} className={cn("flex items-center gap-3 rounded-[12px] border border-line px-3 py-2.5 text-sm transition-colors hover:border-line-strong", s.done && "opacity-60")}>
              <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold", s.done ? "bg-gain-soft text-gain" : "bg-accent-soft text-accent")}>{s.done ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
              <span className={cn("text-text", s.done && "line-through decoration-subtle")}>{s.label}</span>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
