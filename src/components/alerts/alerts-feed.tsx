"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { QuietRings } from "@/components/rings/quiet-rings";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/switch";
import { dayLabel } from "@/lib/format";
import { AlertCard, type AlertDTO } from "./alert-card";

/**
 * The inbox. Mobile: the newest alerts as swipeable story cards (native scroll-snap), then the
 * feed. Desktop: a calm feed grouped by day. Opening the inbox marks everything read.
 */
export function AlertsFeed({ alerts, portfolios }: { alerts: AlertDTO[]; portfolios: { id: string; label: string }[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>("all");
  const [days, setDays] = useState(25);
  useEffect(() => {
    if (!alerts.some((a) => !a.readAt)) return;
    const t = setTimeout(() => {
      void fetch("/api/alerts/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: "all" }) }).then(() => router.refresh());
    }, 2500);
    return () => clearTimeout(t);
  }, [alerts, router]);

  const shown = useMemo(() => (filter === "all" ? alerts : filter === "sim" ? alerts.filter((a) => a.isSimulated) : alerts.filter((a) => a.portfolio?.id === filter || (!a.portfolio && filter === "account"))), [alerts, filter]);
  const stories = shown.filter((a) => !a.readAt).slice(0, 8);
  const groups = useMemo(() => {
    const m = new Map<string, AlertDTO[]>();
    for (const a of shown) m.set(a.tradeDate, [...(m.get(a.tradeDate) ?? []), a]);
    return [...m.entries()];
  }, [shown]);
  const visible = groups.slice(0, days);

  const options = [{ value: "all", label: "All" }, ...portfolios.map((p) => ({ value: p.id, label: p.label })), ...(alerts.some((a) => a.isSimulated) ? [{ value: "sim", label: "Simulated" }] : [])];

  if (!alerts.length)
    return (
      <Card className="p-2">
        <QuietRings title="All quiet so far." body="When something important happens to your stocks, Nazar explains it here, with the likely reason and what it means for you in rupees." />
      </Card>
    );

  return (
    <div className="space-y-6">
      {options.length > 2 && <Segmented label="Filter alerts" value={filter} onChange={setFilter} options={options} size="sm" />}

      {stories.length > 0 && (
        <section aria-label="New alerts" className="sm:hidden">
          <div className="t-overline mb-2">New · swipe</div>
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
            {stories.map((a) => (
              <Card key={a.id} className="w-[86vw] max-w-[360px] shrink-0 snap-center">
                <AlertCard a={a} variant="story" />
              </Card>
            ))}
          </div>
        </section>
      )}

      {visible.map(([date, list]) => (
        <section key={date} aria-label={dayLabel(date, "en")}>
          <h2 className="t-overline mb-2">{dayLabel(date, "en")}</h2>
          <div className="space-y-3">
            {list.map((a) => (
              <Card key={a.id} className={`p-5 sm:p-6 ${a.readAt ? "" : "border-line-strong"}`}>
                <AlertCard a={a} />
              </Card>
            ))}
          </div>
        </section>
      ))}
      {groups.length > visible.length && (
        <div className="flex justify-center">
          <button onClick={() => setDays((d) => d + 25)} className="rounded-full border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-text">
            Show older alerts
          </button>
        </div>
      )}

    </div>
  );
}
