import "server-only";
import { logger } from "@/lib/logger";

/**
 * Email through Brevo's HTTP API (free tier: 300 emails/day) — the same approach as Syncronify's
 * mailer. Never throws: email is a side channel and must not break the request or pipeline that
 * triggered it. Without BREVO_API_KEY + MAIL_FROM it logs a preview and reports "not configured".
 */
export type MailInput = { to: string; subject: string; text: string; html: string };
export type MailResult = { delivered: boolean; status: "sent" | "failed" | "skipped_no_config"; error?: string };

export const mailConfigured = () => Boolean(process.env.BREVO_API_KEY && process.env.MAIL_FROM);

/** 'Nazar <a@b.com>' → { name, email }; a bare address has no name. */
export function parseAddress(address: string): { name?: string; email: string } {
  const m = address.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1] || undefined, email: m[2].trim() } : { email: address.trim() };
}

export async function sendMail({ to, subject, text, html }: MailInput, fetchImpl: typeof fetch = fetch): Promise<MailResult> {
  if (!mailConfigured()) {
    logger.warn({ to, subject }, "Email not configured: email not sent");
    if (process.env.NODE_ENV !== "production") logger.info(`[mail preview] To: ${to}\nSubject: ${subject}\n\n${text}`);
    return { delivered: false, status: "skipped_no_config" };
  }
  try {
    const sender = parseAddress(process.env.MAIL_FROM!);
    const res = await fetchImpl("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": process.env.BREVO_API_KEY!, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: { name: sender.name ?? "Nazar", email: sender.email }, to: [{ email: to }], subject, textContent: text, htmlContent: html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Brevo responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return { delivered: true, status: "sent" };
  } catch (err) {
    logger.error({ err: String(err), to, subject }, "Failed to send email");
    return { delivered: false, status: "failed", error: String(err).slice(0, 300) };
  }
}

/** Global daily cap that keeps us inside Brevo's free tier, leaving headroom for sign-up codes. */
export const EMAIL_DAILY_CAP = Number(process.env.EMAIL_DAILY_CAP) || 250;
