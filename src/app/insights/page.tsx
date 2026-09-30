import type { Metadata } from "next";
import { InsightsView } from "@/components/InsightsView";
import { getInsights } from "@/lib/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Product insights · Stock AI", robots: { index: false, follow: false } };

/**
 * Owner-only product analytics. Open in development; in production visit /insights?key=$INSIGHTS_KEY.
 */
export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams;
  const required = process.env.INSIGHTS_KEY;
  if (process.env.NODE_ENV === "production" && (!required || key !== required)) {
    return <div className="flex h-dvh items-center justify-center text-sm text-zinc-500">Not authorised. Set INSIGHTS_KEY and open /insights?key=…</div>;
  }
  return <InsightsView data={await getInsights()} />;
}
