"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import type { Performance } from "@/lib/portfolio/performance";
import type { AlertDTO } from "./alert-card";
import { AlertsFeed } from "./alerts-feed";
import { Analyzer } from "./analyzer";

type Tab = "analysis" | "alerts";

/** The Alerts page: the analyzer (what, why, how) and the alert inbox, as two tabs. */
export function Pulse({ perf, name, alerts, portfolios, activeId }: { perf: Performance | null; name: string; alerts: AlertDTO[]; portfolios: { id: string; label: string }[]; activeId: string | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const asked = params.get("tab");
  const tab: Tab = !perf || asked === "alerts" ? "alerts" : "analysis";
  const go = (t: Tab) => router.replace(t === "alerts" ? "/alerts?tab=alerts" : "/alerts", { scroll: false });
  const unread = alerts.filter((a) => !a.readAt).length;
  const tabs: { id: Tab; label: string }[] = [
    { id: "analysis", label: "Analysis" },
    { id: "alerts", label: "Alerts" },
  ];
  return (
    <div className="space-y-5">
      {perf && (
        <div role="tablist" aria-label="View" className="flex gap-6 border-b border-line">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => go(t.id)} className={cn("-mb-px flex items-center gap-2 border-b-2 pb-2.5 text-[15px] font-semibold transition-colors", tab === t.id ? "border-text text-text" : "border-transparent text-muted hover:text-text")}>
              {t.label}
              {t.id === "alerts" && unread > 0 && <span className="num rounded-full bg-cta px-1.5 text-[11px] font-semibold text-cta-ink">{unread}</span>}
            </button>
          ))}
        </div>
      )}
      {tab === "analysis" && perf ? (
        <Analyzer perf={perf} name={name} alertDates={alerts.filter((a) => !a.isSimulated && (!activeId || a.portfolio?.id === activeId)).map((a) => a.tradeDate)} onSeeAlerts={() => go("alerts")} />
      ) : (
        <AlertsFeed alerts={alerts} portfolios={portfolios} />
      )}
    </div>
  );
}
