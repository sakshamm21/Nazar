import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/rings/nazar-mark";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { verifyLink, type LinkPayload } from "@/lib/auth/links";
import { getDb, schema } from "@/lib/db";
import { track } from "@/lib/analytics";

export const metadata: Metadata = { title: "Nazar", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * One-click links from emails: rate an alert, confirm a family recipient, unsubscribe. The page asks
 * for one button press (a POST) so link scanners in mail clients can't trigger actions by accident.
 */
async function act(p: LinkPayload): Promise<{ hi: boolean; title: string; body: string }> {
  const db = await getDb();
  if (p.a === "rate") {
    const [a] = await db.select().from(schema.alertEvents).where(and(eq(schema.alertEvents.id, p.alert), eq(schema.alertEvents.userId, p.user))).limit(1);
    if (!a) return { hi: false, title: "This alert no longer exists", body: "Nothing to rate." };
    await db.insert(schema.alertFeedback).values({ alertId: a.id, userId: p.user, rating: p.r, source: "email" }).onConflictDoUpdate({ target: [schema.alertFeedback.alertId, schema.alertFeedback.userId], set: { rating: p.r, source: "email", createdAt: new Date() } });
    track(p.user, "alert_rated", { rating: p.r, type: a.type, source: "email" });
    return { hi: false, title: "Thanks, noted", body: p.r === "up" ? "Nazar will keep sending alerts like this." : "Nazar will use this to raise the bar for this kind of alert, and will tell you when it does." };
  }
  if (p.a === "confirm" || p.a === "unsub") {
    const [r] = await db.select({ r: schema.recipients, language: schema.portfolios.language }).from(schema.recipients).innerJoin(schema.portfolios, eq(schema.portfolios.id, schema.recipients.portfolioId)).where(eq(schema.recipients.id, p.rec)).limit(1);
    if (!r) return { hi: false, title: "This link has expired", body: "The portfolio may have been removed." };
    const hi = r.language === "hi";
    if (p.a === "confirm") {
      await db.update(schema.recipients).set({ confirmedAt: new Date(), unsubscribedAt: null }).where(eq(schema.recipients.id, p.rec));
      return hi ? { hi, title: "पुष्टि हो गई", body: "अब आपको हर रविवार एक छोटी रिपोर्ट और ज़रूरी बदलावों की जानकारी हिंदी में मिलेगी।" } : { hi, title: "You're all set", body: "You'll get a short weekly report every Sunday and a note when something important happens." };
    }
    await db.update(schema.recipients).set({ unsubscribedAt: new Date() }).where(eq(schema.recipients.id, p.rec));
    return hi ? { hi, title: "ईमेल बंद कर दिए गए", body: "अब आपको Nazar से कोई ईमेल नहीं मिलेगा।" } : { hi, title: "Unsubscribed", body: "You won't get any more emails from Nazar." };
  }
  await db.insert(schema.alertSettings).values({ userId: p.user, emailDigest: false }).onConflictDoUpdate({ target: schema.alertSettings.userId, set: { emailDigest: false, updatedAt: new Date() } });
  return { hi: false, title: "Email digests turned off", body: "Your alerts still appear in the app. You can turn email back on in Settings." };
}

const PROMPT: Record<LinkPayload["a"], string> = { rate: "Record your rating", confirm: "Confirm · पुष्टि करें", unsub: "Unsubscribe · ईमेल बंद करें", "unsub-owner": "Turn off email digests" };

export default async function LinkPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params;
  const { done } = await searchParams;
  const p = verifyLink(token);
  let result: { hi: boolean; title: string; body: string } | null = null;
  if (p && done === "1") result = await act(p);
  async function submit() {
    "use server";
    redirect(`/r/${token}?done=1`);
  }
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4">
      <Link href="/" className="mb-8" aria-label="Nazar home">
        <Wordmark />
      </Link>
      <Card className="w-full max-w-md p-7 text-center">
        {!p ? (
          <>
            <h1 className="t-title-2 text-text">This link has expired</h1>
            <p className="mt-2 text-sm text-muted">Open Nazar to do this from the app instead.</p>
          </>
        ) : result ? (
          <div lang={result.hi ? "hi" : undefined} className={result.hi ? "hi" : ""}>
            <h1 className="t-title-2 text-text">{result.title}</h1>
            <p className="mt-2 text-sm text-muted">{result.body}</p>
          </div>
        ) : (
          <form action={submit}>
            <h1 className="t-title-2 text-text">{PROMPT[p.a]}?</h1>
            <p className="mt-2 text-sm text-muted">{p.a === "rate" ? `You're marking this alert as ${p.r === "up" ? "useful 👍" : "not useful 👎"}.` : "One click and it's done."}</p>
            <button type="submit" className={buttonClass("primary", "md", "mt-5 w-full")}>
              {PROMPT[p.a]}
            </button>
          </form>
        )}
      </Card>
    </div>
  );
}
