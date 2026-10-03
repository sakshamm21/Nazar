import { randomUUID } from "crypto";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { appUrl } from "@/lib/auth/service";
import { getDb, schema } from "@/lib/db";
import { SCENARIOS, simulate } from "@/lib/demo/simulate";
import { digestEmail } from "@/lib/email/templates";
import { sendMail } from "@/lib/email/mailer";
import { forbidden } from "@/lib/errors";
import { api, json, parseBody, requireUser } from "@/lib/http";
import { ipHash, rateLimit } from "@/lib/limits";
import { toDigestItem } from "@/lib/pipeline/deliver";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  scenario: z.enum(Object.keys(SCENARIOS) as [string, ...string[]]).default("global-selloff"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(200).optional().or(z.literal("")),
});

/**
 * "Simulate a bad day" (test accounts). Runs the real alert engine on a generated session for this
 * account only. Optionally emails the resulting digest to an address the visitor typed (their own),
 * capped per address and per IP so it can't be used to send email to others.
 */
export const POST = api(async (req) => {
  const user = await requireUser(req);
  if (!user.isTestAccount) throw forbidden("Simulation is only available in the test accounts.", "NOT_DEMO");
  const body = await parseBody(req, Body);
  await rateLimit(`demo:simulate:${user.id}`, 8, 24 * 3600_000, "That's plenty of bad days for one demo. Use Back to normal and explore the alerts.");
  const r = await simulate(user.id, body.scenario);
  let emailed: "sent" | "not_configured" | "failed" | null = null;
  if (body.email) {
    await rateLimit(`demo:email:${body.email}`, 1, 24 * 3600_000, "We've already sent a demo email to this address today.");
    await rateLimit(`demo:email:ip:${ipHash(req)}`, 3, 24 * 3600_000, "Demo emails are limited to 3 a day per network.");
    const db = await getDb();
    const alerts = r.alertIds.length ? await db.select().from(schema.alertEvents).where(inArray(schema.alertEvents.id, r.alertIds)) : [];
    const mail = digestEmail({
      lang: "en",
      portfolioName: "the Nazar demo portfolio",
      items: alerts.map((a) => toDigestItem(a, "en", false, user.id)),
      appLink: `${appUrl()}/alerts`,
      headline: "Nazar demo: here's what a bad day looks like",
    });
    const sent = await sendMail({ to: body.email, ...mail, text: `${mail.text}\n\nYou asked for this demo email on Nazar. It was sent once and you won't get more.` });
    await db.insert(schema.deliveries).values({ id: randomUUID(), userId: user.id, kind: "simulation", itemKey: `simulation:${user.id}:${r.simDate}`, email: body.email, status: sent.status, error: sent.error ?? null, alertIds: r.alertIds }).onConflictDoNothing();
    emailed = sent.delivered ? "sent" : sent.status === "skipped_no_config" ? "not_configured" : "failed";
  }
  return json({ ok: true, simDate: r.simDate, alerts: r.alertIds.length, scenario: r.scenario.label, emailed });
});
