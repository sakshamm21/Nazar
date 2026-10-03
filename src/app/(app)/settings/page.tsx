import type { Metadata } from "next";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ProfileCard } from "@/components/settings/profile-card";
import { SettingsView } from "@/components/settings/settings-view";
import { istDate } from "@/lib/data/provider";
import { getDb, schema } from "@/lib/db";
import { loadPortfolioDay } from "@/lib/market/portfolio-day";
import { dateSources, latestTradeDate, sourcesFor } from "@/lib/market/store";
import { valuation } from "@/lib/portfolio/math";
import { listPortfolios, listWatching } from "@/lib/repo/portfolios";
import { effectiveSettings } from "@/lib/alerts/thresholds";
import { requirePageUser } from "@/lib/current-user";
import { mailConfigured } from "@/lib/email/mailer";
import { getSettings, getThresholds, listThresholdChanges } from "@/lib/repo/alerts";
import { listTargets } from "@/lib/repo/targets";

export const metadata: Metadata = { title: "You" };

export default async function SettingsPage() {
  const user = await requirePageUser();
  const [settings, thresholds, changes, targets] = await Promise.all([getSettings(user.id), getThresholds(user.id), listThresholdChanges(user.id), listTargets(user.id)]);
  const eff = effectiveSettings(settings.sensitivity, thresholds);

  // Profile numbers: everything the user tracks, across all their portfolios.
  const db = await getDb();
  const portfolios = await listPortfolios(user.id);
  const holdings = portfolios.length ? await db.select().from(schema.holdings).where(inArray(schema.holdings.portfolioId, portfolios.map((p) => p.id))) : [];
  const sources = sourcesFor(user);
  const date = (await latestTradeDate(db, dateSources(sources))) ?? istDate(new Date());
  // Each portfolio is valued on its own: the same stock can sit in two of them.
  let netWorth = 0;
  for (const p of portfolios) netWorth += valuation((await loadPortfolioDay(db, holdings.filter((h) => h.portfolioId === p.id), date, sources)).holdings).value;
  const [{ rated }] = await db.select({ rated: sql<number>`count(*)::int` }).from(schema.alertFeedback).where(and(eq(schema.alertFeedback.userId, user.id), eq(schema.alertFeedback.source, "app")));
  const watching = await listWatching(user.id);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <ProfileCard
        profile={{
          name: user.name,
          email: user.email,
          emailVerified: !!user.emailVerifiedAt,
          isTestAccount: user.isTestAccount,
          memberSince: user.createdAt.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" }),
          stats: { portfolios: portfolios.length, holdings: holdings.length, watching: watching.length, alertsRated: Number(rated), netWorth: holdings.length ? netWorth : null },
        }}
      />
      <SettingsView
        user={{ name: user.name, email: user.email, isDemo: user.isDemo || user.isTestAccount, isTestAccount: user.isTestAccount, emailVerified: !!user.emailVerifiedAt }}
        settings={{ sensitivity: settings.sensitivity, quietMode: settings.quietMode, emailDigest: settings.emailDigest }}
        effective={{ stockMove: eff.stockMove, portfolioMove: eff.portfolioMove, concentration: eff.concentration }}
        changes={changes.map((c) => ({ id: c.id, alertType: c.alertType, oldValue: c.oldValue, newValue: c.newValue, muted: c.muted, messageEn: c.messageEn, createdAt: c.createdAt.toISOString(), undoneAt: c.undoneAt?.toISOString() ?? null, evidence: c.evidence }))}
        targets={targets.map((t) => ({ id: t.id, symbol: t.symbol, direction: t.direction, target: t.target, triggeredAt: t.triggeredAt?.toISOString() ?? null }))}
        emailConfigured={mailConfigured()}
      />
    </div>
  );
}
