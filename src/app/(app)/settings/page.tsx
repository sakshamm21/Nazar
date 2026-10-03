import type { Metadata } from "next";
import { inArray } from "drizzle-orm";
import { Preferences } from "@/components/settings/preferences";
import { ProfileCard } from "@/components/settings/profile-card";
import { requirePageUser } from "@/lib/current-user";
import { istDate } from "@/lib/data/provider";
import { getDb, schema } from "@/lib/db";
import { loadPortfolioDay } from "@/lib/market/portfolio-day";
import { latestTradeDate, sourcesFor } from "@/lib/market/store";
import { valuation } from "@/lib/portfolio/math";
import { listPortfolios, listWatching } from "@/lib/repo/portfolios";

export const metadata: Metadata = { title: "You" };

export default async function SettingsPage() {
  const user = await requirePageUser();
  // Profile numbers: everything the user tracks, across all their portfolios.
  const db = await getDb();
  const portfolios = await listPortfolios(user.id);
  const holdings = portfolios.length ? await db.select().from(schema.holdings).where(inArray(schema.holdings.portfolioId, portfolios.map((p) => p.id))) : [];
  const sources = sourcesFor(user);
  const date = (await latestTradeDate(db, sources)) ?? istDate(new Date());
  // Each portfolio is valued on its own: the same stock can sit in two of them.
  let netWorth = 0;
  for (const p of portfolios) netWorth += valuation((await loadPortfolioDay(db, holdings.filter((h) => h.portfolioId === p.id), date, sources)).holdings).value;
  const watching = await listWatching(user.id);

  return (
    <div className="nz-stagger mx-auto max-w-3xl space-y-5">
      <ProfileCard
        profile={{
          name: user.name,
          email: user.email,
          emailVerified: !!user.emailVerifiedAt,
          isTestAccount: user.isTestAccount,
          memberSince: user.createdAt.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" }),
          stats: { portfolios: portfolios.length, holdings: holdings.length, watching: watching.length, netWorth: holdings.length ? netWorth : null },
        }}
      />
      <Preferences />
      <p className="t-caption px-1">Nazar only emails you to confirm your address or reset your password. It explains; you decide. It is not a SEBI-registered investment adviser.</p>
    </div>
  );
}
