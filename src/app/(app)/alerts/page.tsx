import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Pulse } from "@/components/alerts/pulse";
import { PortfolioSwitcher } from "@/components/home/portfolio-switcher";
import { requirePageUser, selectedPortfolioId } from "@/lib/current-user";
import { getSettings } from "@/lib/repo/alerts";
import { alertsFor } from "@/lib/views/alerts";
import { buildPortfolioView } from "@/lib/views/portfolio";

export const metadata: Metadata = { title: "Alerts and analysis" };

const SENS = { major: "Major only", balanced: "Balanced", everything: "Everything" } as const;

export default async function AlertsPage() {
  const user = await requirePageUser();
  const [{ alerts, portfolios }, settings, view] = await Promise.all([alertsFor(user.id), getSettings(user.id), buildPortfolioView(user, await selectedPortfolioId())]);
  const active = view.active;
  return (
    <div className="nz-stagger mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="t-title-1 text-text">
          What moved, and <span className="t-accent nz-grad">why</span>
        </h1>
        <p className="mt-1 text-sm text-muted">
          The analysis reads your whole portfolio over any period. Alerts flag single events as they happen (sensitivity: <span className="text-text">{SENS[settings.sensitivity]}</span>,{" "}
          <Link href="/settings" className="font-medium text-accent">
            change
          </Link>
          ).
        </p>
      </div>
      {!view.empty && <PortfolioSwitcher portfolios={view.portfolios.map((p) => ({ id: p.id, name: p.name, ownerLabel: p.ownerLabel, language: p.language }))} activeId={active?.id ?? null} />}
      <Suspense>
        <Pulse perf={view.empty ? null : view.performance} name={active ? (active.ownerLabel ? `${active.ownerLabel}'s portfolio` : active.name) : ""} alerts={alerts} portfolios={portfolios} activeId={active?.id ?? null} />
      </Suspense>
    </div>
  );
}
