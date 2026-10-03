import "server-only";
import bcrypt from "bcryptjs";
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { emails } from "@/lib/email/templates";
import { sendMail } from "@/lib/email/mailer";
import { AppError, badRequest, conflict, forbidden, unauthenticated } from "@/lib/errors";
import { track } from "@/lib/events";

/**
 * Email + password accounts with a 6-digit email code:
 * hashed codes (10-minute TTL, 5 attempts, 30s resend cooldown), hashed one-time reset links,
 * and a dev fallback that shows the code on screen when email isn't configured.
 */
const CODE_TTL_MIN = 10;
const CODE_MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_S = 30;
const RESET_TTL_MIN = 30;

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const otp = () => randomInt(0, 1_000_000).toString().padStart(6, "0");
const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Codes are shown on screen only when email can't deliver them: always in dev, in production only if allowed. */
const exposeCodes = () => process.env.NODE_ENV !== "production" || process.env.EXPOSE_VERIFICATION_CODES === "true";
const devOnly = <T,>(delivered: boolean, value: T): T | undefined => (!delivered && exposeCodes() ? value : undefined);

export const appUrl = () => (process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")).replace(/\/$/, "");

type UserRow = typeof schema.users.$inferSelect;
export const publicUser = (u: UserRow) => ({ id: u.id, email: u.email, name: u.name, isDemo: u.isDemo, emailVerified: Boolean(u.emailVerifiedAt), tourCompleted: Boolean(u.tourCompletedAt), isAdmin: u.isAdmin || adminEmails().includes(u.email) });
export const adminEmails = () => (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

async function findByEmail(email: string) {
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase())).limit(1);
  return u ?? null;
}

async function sendCode(u: UserRow) {
  if (u.verifySentAt) {
    const since = (Date.now() - u.verifySentAt.getTime()) / 1000;
    if (since < RESEND_COOLDOWN_S) {
      const wait = Math.ceil(RESEND_COOLDOWN_S - since);
      throw new AppError(429, `Please wait ${wait}s before requesting another code.`, "RESEND_COOLDOWN", { retryAfter: wait });
    }
  }
  const code = otp();
  const db = await getDb();
  await db
    .update(schema.users)
    .set({ verifyCodeHash: sha256(code), verifyExpiresAt: new Date(Date.now() + CODE_TTL_MIN * 60_000), verifyAttempts: 0, verifySentAt: new Date() })
    .where(eq(schema.users.id, u.id));
  const r = await sendMail({ to: u.email, ...emails.verificationCode({ name: u.name, code, minutes: CODE_TTL_MIN }) });
  return { delivered: r.delivered, code };
}

export async function register(input: { name: string; email: string; password: string }) {
  const email = input.email.toLowerCase();
  const db = await getDb();
  let u = await findByEmail(email);
  if (u?.emailVerifiedAt) throw conflict("An account with this email already exists. Try signing in instead.", "EMAIL_TAKEN");
  const passwordHash = await bcrypt.hash(input.password, 10);
  if (!u) {
    const id = randomUUID();
    await db.insert(schema.users).values({ id, email, name: input.name, passwordHash });
    u = (await findByEmail(email))!;
    track(id, "signed_up", {});
  } else {
    // An unverified account can be re-registered: the latest details win.
    await db.update(schema.users).set({ name: input.name, passwordHash }).where(eq(schema.users.id, u.id));
    u = (await findByEmail(email))!;
  }
  const { delivered, code } = await sendCode(u);
  return { email, emailDelivered: delivered, devCode: devOnly(delivered, code) };
}

export async function resendCode(emailIn: string) {
  const u = await findByEmail(emailIn);
  // Same response for unknown or already-verified emails, so this can't reveal who has an account.
  if (!u || u.emailVerifiedAt) return { email: emailIn.toLowerCase() };
  const { delivered, code } = await sendCode(u);
  return { email: u.email, emailDelivered: delivered, devCode: devOnly(delivered, code) };
}

export async function verifyEmail(emailIn: string, code: string) {
  const u = await findByEmail(emailIn);
  if (!u) throw badRequest("That code is not valid.", "INVALID_CODE");
  if (u.emailVerifiedAt) throw conflict("This email is already verified. Please sign in.", "ALREADY_VERIFIED");
  if (!u.verifyCodeHash || !u.verifyExpiresAt || u.verifyExpiresAt < new Date()) throw badRequest("This code has expired. Request a new one.", "CODE_EXPIRED");
  if (u.verifyAttempts >= CODE_MAX_ATTEMPTS) throw new AppError(429, "Too many incorrect attempts. Request a new code.", "TOO_MANY_ATTEMPTS");
  const db = await getDb();
  if (!safeEqual(sha256(code), u.verifyCodeHash)) {
    const attempts = u.verifyAttempts + 1;
    await db.update(schema.users).set({ verifyAttempts: attempts }).where(eq(schema.users.id, u.id));
    const left = CODE_MAX_ATTEMPTS - attempts;
    throw badRequest(left > 0 ? `That code is not valid. ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many incorrect attempts. Request a new code.", "INVALID_CODE");
  }
  await db.update(schema.users).set({ emailVerifiedAt: new Date(), verifyCodeHash: null, verifyExpiresAt: null, verifyAttempts: 0, lastSeenAt: new Date() }).where(eq(schema.users.id, u.id));
  track(u.id, "email_verified", {});
  return (await findByEmail(u.email))!;
}

export async function login(emailIn: string, password: string) {
  const u = await findByEmail(emailIn);
  if (!u || !u.passwordHash || !(await bcrypt.compare(password, u.passwordHash))) throw unauthenticated("Incorrect email or password.", "INVALID_CREDENTIALS");
  if (!u.emailVerifiedAt) throw forbidden("Please verify your email to continue.", "EMAIL_NOT_VERIFIED");
  const db = await getDb();
  await db.update(schema.users).set({ lastSeenAt: new Date() }).where(eq(schema.users.id, u.id));
  return u;
}

export async function forgotPassword(emailIn: string) {
  const u = await findByEmail(emailIn);
  if (!u || u.isDemo) return {};
  const token = randomBytes(32).toString("hex");
  const db = await getDb();
  await db.update(schema.users).set({ resetTokenHash: sha256(token), resetExpiresAt: new Date(Date.now() + RESET_TTL_MIN * 60_000) }).where(eq(schema.users.id, u.id));
  const url = `${appUrl()}/reset?token=${token}`;
  const r = await sendMail({ to: u.email, ...emails.passwordReset({ name: u.name, url, minutes: RESET_TTL_MIN }) });
  return { devResetUrl: devOnly(r.delivered, url) };
}

export async function resetPassword(token: string, password: string) {
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.resetTokenHash, sha256(token))).limit(1);
  if (!u || !u.resetExpiresAt || u.resetExpiresAt < new Date()) throw badRequest("This reset link has expired or was already used. Request a new one.", "RESET_EXPIRED");
  await db
    .update(schema.users)
    .set({ passwordHash: await bcrypt.hash(password, 10), resetTokenHash: null, resetExpiresAt: null, emailVerifiedAt: u.emailVerifiedAt ?? new Date() })
    .where(eq(schema.users.id, u.id));
  return u;
}
