import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PortfolioSettings } from "@/components/portfolio/portfolio-settings";
import { requirePageUser } from "@/lib/current-user";
import { getDb, schema } from "@/lib/db";
import { mailConfigured } from "@/lib/email/mailer";
import { requirePortfolio } from "@/lib/repo/portfolios";

export const metadata: Metadata = { title: "Portfolio settings" };

export default async function PortfolioSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const p = await requirePortfolio(user.id, id).catch(() => notFound());
  const db = await getDb();
  const [r] = await db.select().from(schema.recipients).where(eq(schema.recipients.portfolioId, p.id)).limit(1);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/portfolio" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Portfolio
      </Link>
      <h1 className="t-title-1 text-text">{p.ownerLabel ? `${p.ownerLabel}'s portfolio` : p.name}</h1>
      <PortfolioSettings
        p={{ id: p.id, name: p.name, ownerLabel: p.ownerLabel, language: p.language, alertsEnabled: p.alertsEnabled }}
        recipient={r ? { email: r.email, confirmed: !!r.confirmedAt, unsubscribed: !!r.unsubscribedAt } : null}
        isDemo={user.isDemo || user.isTestAccount}
        emailConfigured={mailConfigured()}
      />
    </div>
  );
}
