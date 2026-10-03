import type { Metadata } from "next";
import { InsightsView } from "@/components/insights/insights-view";
import { adminEmails } from "@/lib/auth/service";
import { currentUser } from "@/lib/current-user";
import { getInsights } from "@/lib/insights";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Product insights", robots: { index: false, follow: false } };

/**
 * Owner-only analytics. In production: signed in with an ADMIN_EMAILS address (or an is_admin user),
 * or the private link /insights?key=$INSIGHTS_KEY for sharing a read-only view. Open in development.
 */
export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams;
  const u = await currentUser();
  const allowed = process.env.NODE_ENV !== "production" || (u && (u.isAdmin || adminEmails().includes(u.email))) || (process.env.INSIGHTS_KEY && key === process.env.INSIGHTS_KEY);
  if (!allowed) return <div className="flex min-h-dvh items-center justify-center px-4 text-center text-sm text-muted">This page is only for Nazar&apos;s admins.</div>;
  return <InsightsView data={await getInsights()} />;
}
