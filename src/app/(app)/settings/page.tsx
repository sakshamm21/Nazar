import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/settings-view";
import { effectiveSettings } from "@/lib/alerts/thresholds";
import { requirePageUser } from "@/lib/current-user";
import { mailConfigured } from "@/lib/email/mailer";
import { getSettings, getThresholds, listThresholdChanges } from "@/lib/repo/alerts";
import { listTargets } from "@/lib/repo/targets";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requirePageUser();
  const [settings, thresholds, changes, targets] = await Promise.all([getSettings(user.id), getThresholds(user.id), listThresholdChanges(user.id), listTargets(user.id)]);
  const eff = effectiveSettings(settings.sensitivity, thresholds);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="t-title-1 text-text">Settings</h1>
      <SettingsView
        user={{ name: user.name, email: user.email, isDemo: user.isDemo, isTestAccount: user.isTestAccount, emailVerified: !!user.emailVerifiedAt }}
        settings={{ sensitivity: settings.sensitivity, quietMode: settings.quietMode, emailDigest: settings.emailDigest }}
        effective={{ stockMove: eff.stockMove, portfolioMove: eff.portfolioMove, concentration: eff.concentration }}
        changes={changes.map((c) => ({ id: c.id, alertType: c.alertType, oldValue: c.oldValue, newValue: c.newValue, muted: c.muted, messageEn: c.messageEn, createdAt: c.createdAt.toISOString(), undoneAt: c.undoneAt?.toISOString() ?? null, evidence: c.evidence }))}
        targets={targets.map((t) => ({ id: t.id, symbol: t.symbol, direction: t.direction, target: t.target, triggeredAt: t.triggeredAt?.toISOString() ?? null }))}
        emailConfigured={mailConfigured()}
      />
    </div>
  );
}
