import { and, desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportView } from "@/components/reports/report-view";
import { requirePageUser } from "@/lib/current-user";
import { getDb, schema } from "@/lib/db";
import type { WeeklyContent } from "@/lib/reports/weekly";

export const metadata: Metadata = { title: "Weekly report" };

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const db = await getDb();
  const [row] = await db.select().from(schema.reports).where(and(eq(schema.reports.id, id), eq(schema.reports.userId, user.id))).limit(1);
  if (!row) notFound();
  const [p] = await db.select().from(schema.portfolios).where(eq(schema.portfolios.id, row.portfolioId)).limit(1);
  const [rec] = await db.select().from(schema.recipients).where(eq(schema.recipients.portfolioId, row.portfolioId)).limit(1);
  const others = await db.select({ id: schema.reports.id, weekEnd: schema.reports.weekEnd }).from(schema.reports).where(eq(schema.reports.portfolioId, row.portfolioId)).orderBy(desc(schema.reports.weekEnd)).limit(8);
  const c = row.content as unknown as WeeklyContent;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/home" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>
      <div>
        <div className="t-overline">{p?.ownerLabel ? `${p.ownerLabel}'s portfolio` : p?.name} · weekly report</div>
        <h1 className="t-title-1 mt-1 text-text">Sunday report</h1>
      </div>
      <ReportView en={c.en} hi={c.hi} defaultLang={p?.language ?? "en"} recipient={rec?.email ?? null} />
      {others.length > 1 && (
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="text-subtle">Other weeks:</span>
          {others
            .filter((o) => o.id !== row.id)
            .map((o) => (
              <Link key={o.id} href={`/reports/${o.id}`} className="font-medium text-accent">
                week ending {o.weekEnd}
              </Link>
            ))}
        </div>
      )}
    </div>
  );
}
