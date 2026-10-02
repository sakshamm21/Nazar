import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { signLink } from "@/lib/auth/links";
import { appUrl } from "@/lib/auth/service";
import { getDb, schema } from "@/lib/db";
import { emails } from "@/lib/email/templates";
import { sendMail } from "@/lib/email/mailer";
import { api, json, parseBody, requireUser } from "@/lib/http";
import { rateLimit } from "@/lib/limits";
import { requirePortfolio } from "@/lib/repo/portfolios";
import { track } from "@/lib/analytics";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(200) });

/**
 * H6: a family member who receives this portfolio's weekly report and major alerts by email, in the
 * portfolio's language. They confirm once (one click) before anything is sent — consent, and
 * protection against sending email to people who didn't ask for it.
 */
export const POST = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  const p = await requirePortfolio(u.id, id);
  const { email } = await parseBody(req, Body);
  await rateLimit(`recipient:${u.id}`, 10, 24 * 3600_000);
  const db = await getDb();
  await db.delete(schema.recipients).where(eq(schema.recipients.portfolioId, p.id));
  const recId = randomUUID();
  await db.insert(schema.recipients).values({ id: recId, userId: u.id, portfolioId: p.id, email });
  let status: "sent" | "not_configured" | "failed" | "demo" = "demo";
  if (!u.isDemo) {
    const url = `${appUrl()}/r/${signLink({ a: "confirm", rec: recId }, 14)}`;
    const mail = emails.recipientConfirm({ ownerName: u.name, portfolioName: p.ownerLabel ? `${p.ownerLabel}'s portfolio` : p.name, url, lang: p.language });
    const r = await sendMail({ to: email, ...mail });
    status = r.delivered ? "sent" : r.status === "skipped_no_config" ? "not_configured" : "failed";
    if (status === "not_configured" && process.env.NODE_ENV !== "production") await db.update(schema.recipients).set({ confirmedAt: new Date() }).where(eq(schema.recipients.id, recId));
  } else {
    // Demo recipients are marked confirmed but never emailed (demo accounts never send email).
    await db.update(schema.recipients).set({ confirmedAt: new Date() }).where(eq(schema.recipients.id, recId));
  }
  track(u.id, "recipient_added", { language: p.language, status });
  return json({ ok: true, status });
});

export const DELETE = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  const p = await requirePortfolio(u.id, id);
  const db = await getDb();
  await db.delete(schema.recipients).where(and(eq(schema.recipients.portfolioId, p.id), eq(schema.recipients.userId, u.id)));
  return json({ ok: true });
});
