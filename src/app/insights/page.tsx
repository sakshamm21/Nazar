import type { Metadata } from "next";
import { InsightsView } from "@/components/insights/insights-view";
import { InsightsKeyForm } from "@/components/insights/insights-key-form";
import { adminEmails } from "@/lib/auth/service";
import { currentUser } from "@/lib/current-user";
import { getInsights, insightsKeyMatches, insightsKeyCookie } from "@/lib/insights";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Product insights", robots: { index: false, follow: false } };

/**
 * Owner-only analytics. In production: signed in with an ADMIN_EMAILS address (or an is_admin
 * user). A shareable read-only link is still possible, but the key travels in a cookie set by
 * POST /api/insights/key rather than in the URL, so it never reaches browser history, Referer
 * headers or access logs. Open in development.
 */
export default async function InsightsPage() {
  const u = await currentUser();
  const byAccount = process.env.NODE_ENV !== "production" || (u && (u.isAdmin || adminEmails().includes(u.email)));
  const byKey = !!(process.env.INSIGHTS_KEY && insightsKeyMatches(await insightsKeyCookie()));
  if (!byAccount && !byKey) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <InsightsKeyForm />
      </div>
    );
  }
  return <InsightsView data={await getInsights()} />;
}
