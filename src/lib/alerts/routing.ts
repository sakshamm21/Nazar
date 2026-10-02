/**
 * H6 routing — who gets an alert or report, in which language, through which channel.
 * Pure function, unit-tested:
 * - The account owner always gets everything in the in-app inbox.
 * - The owner also gets an email digest if they turned it on and their email is verified.
 *   Quiet mode limits owner emails to critical alerts.
 * - A portfolio's family recipient (e.g. Papa) gets alerts of severity critical/important and the
 *   weekly report, in that portfolio's language, once they have confirmed and not unsubscribed.
 * - Nothing goes out for a portfolio with alerts switched off (except the inbox entry).
 * - Simulated alerts never go to family recipients.
 */
import type { Severity } from "@/lib/db/schema";

export type RouteTarget = { channel: "inbox" } | { channel: "email"; email: string; language: "en" | "hi"; audience: "owner" | "family" };

export type RouteInput = {
  kind: "alert" | "report";
  severity?: Severity;
  simulated?: boolean;
  owner: { email: string; emailVerified: boolean; isDemo: boolean; emailDigest: boolean; quietMode: boolean; language: "en" | "hi" };
  portfolio: { alertsEnabled: boolean; language: "en" | "hi" };
  recipients: { email: string; confirmed: boolean; unsubscribed: boolean }[];
};

export function route(r: RouteInput): RouteTarget[] {
  const out: RouteTarget[] = [{ channel: "inbox" }];
  if (!r.portfolio.alertsEnabled && r.kind === "alert") return out;
  const ownerCanEmail = r.owner.emailVerified && !r.owner.isDemo && r.owner.emailDigest;
  if (ownerCanEmail) {
    const quietBlocks = r.kind === "alert" && r.owner.quietMode && r.severity !== "critical";
    if (!quietBlocks) out.push({ channel: "email", email: r.owner.email, language: r.owner.language, audience: "owner" });
  }
  if (r.simulated) return out;
  const major = r.kind === "report" || r.severity === "critical" || r.severity === "important";
  if (major)
    for (const rec of r.recipients) {
      if (!rec.confirmed || rec.unsubscribed) continue;
      if (rec.email.toLowerCase() === r.owner.email.toLowerCase()) continue;
      out.push({ channel: "email", email: rec.email, language: r.portfolio.language, audience: "family" });
    }
  return out;
}
