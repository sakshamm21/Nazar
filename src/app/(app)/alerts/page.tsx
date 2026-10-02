import type { Metadata } from "next";
import Link from "next/link";
import { AlertsFeed } from "@/components/alerts/alerts-feed";
import { requirePageUser } from "@/lib/current-user";
import { getSettings } from "@/lib/repo/alerts";
import { alertsFor } from "@/lib/views/alerts";

export const metadata: Metadata = { title: "Alerts" };

const SENS = { major: "Major only", balanced: "Balanced", everything: "Everything" } as const;

export default async function AlertsPage() {
  const user = await requirePageUser();
  const [{ alerts, portfolios }, settings] = await Promise.all([alertsFor(user.id), getSettings(user.id)]);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="t-title-1 text-text">Alerts</h1>
          <p className="mt-1 text-sm text-muted">
            Only what matters, with the likely reason and your ₹ impact. Sensitivity: <span className="text-text">{SENS[settings.sensitivity]}</span>.{" "}
            <Link href="/settings" className="font-medium text-accent">
              Change
            </Link>
          </p>
        </div>
      </div>
      <AlertsFeed alerts={alerts} portfolios={portfolios} />
    </div>
  );
}
