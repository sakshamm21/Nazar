import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCard } from "@/components/alerts/alert-card";
import { PriceChart } from "@/components/charts/price-chart";
import { Card, CardHeader } from "@/components/ui/card";
import { requirePageUser } from "@/lib/current-user";
import { getDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { priceHistory, shiftDate, sourcesFor } from "@/lib/market/store";
import { getAlert, markRead } from "@/lib/repo/alerts";
import { alertsFor } from "@/lib/views/alerts";

export const metadata: Metadata = { title: "Alert" };

export default async function AlertPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const row = await getAlert(user.id, id).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  await markRead(user.id, [row.id]);
  const { dto } = await alertsFor(user.id, { limit: 1 });
  const a = dto(row);
  const db = await getDb();
  const hist = row.symbol ? await priceHistory(db, [row.symbol], sourcesFor(user), shiftDate(row.tradeDate, -45), row.tradeDate) : null;
  const points = [...(hist?.get(row.symbol ?? "") ?? new Map()).entries()].map(([date, value]) => ({ date, value }));
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/alerts" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Alerts
      </Link>
      <Card className="p-5 sm:p-7">
        <AlertCard a={a} variant="detail" />
      </Card>
      {points.length > 5 && (
        <Card className="p-5 sm:p-6">
          <CardHeader overline="Context" title="The six weeks before this alert" />
          <div className="mt-3">
            <PriceChart points={points} />
          </div>
        </Card>
      )}
    </div>
  );
}
