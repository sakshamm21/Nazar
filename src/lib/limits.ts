import "server-only";
import { createHash, randomUUID } from "crypto";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { authSecret } from "@/lib/auth/secret";
import { tooMany } from "./errors";

const envNum = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};

/** All limits are env-configurable; 0 disables a limit. */
export const LIMITS = {
  /** Ask questions per user per rolling minute (burst protection). */
  perMinute: envNum("RATE_LIMIT_PER_MINUTE", 6),
  /** Ask questions per user per rolling 24h. */
  perDay: envNum("RATE_LIMIT_PER_DAY", 40),
  /** Ask questions per visitor of a shared test account (caps OpenAI spend from people just looking). */
  perDayDemo: envNum("RATE_LIMIT_PER_DAY_DEMO", 5),
  /** Ask questions per IP per rolling 24h. */
  perDayIp: envNum("RATE_LIMIT_PER_DAY_IP", 100),
  /** Max OpenAI spend (USD) per user per rolling 24h. */
  userDailyUsd: envNum("USER_DAILY_BUDGET_USD", 0.3),
  /** Max OpenAI spend (USD) across ALL users per rolling 24h — protects your bill. */
  globalDailyUsd: envNum("GLOBAL_DAILY_BUDGET_USD", 3),
  /** Max characters in one question. */
  maxInputChars: envNum("MAX_INPUT_CHARS", 2000),
};

export const ipHash = (req: Request) => ipHashOf(req.headers);

/** The same network fingerprint from request headers (server components have no Request). */
export function ipHashOf(h: { get(name: string): string | null }) {
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  return createHash("sha256").update(`${authSecret()}:ip:${ip}`).digest("hex").slice(0, 32);
}

const HOUR = 3600_000;

async function count(key: string, since: Date) {
  const db = await getDb();
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.rateEvents).where(and(eq(schema.rateEvents.key, key), gte(schema.rateEvents.createdAt, since)));
  return Number(r?.n ?? 0);
}

async function record(key: string) {
  const db = await getDb();
  await db.insert(schema.rateEvents).values({ id: randomUUID(), key });
  if (Math.random() < 0.02) await db.delete(schema.rateEvents).where(lt(schema.rateEvents.createdAt, new Date(Date.now() - 48 * HOUR))).catch(() => {});
}

/**
 * Generic limiter: throws a 429 AppError if `key` was hit `max` times within `windowMs`,
 * otherwise records the hit. Used for auth, demo, simulate and import endpoints.
 */
export async function rateLimit(key: string, max: number, windowMs: number, message = "Too many attempts. Please wait a bit and try again.") {
  if (!max) return;
  const n = await count(key, new Date(Date.now() - windowMs));
  if (n >= max) throw tooMany(message, "RATE_LIMITED", { retryAfterSeconds: Math.ceil(windowMs / 1000) });
  await record(key);
}

type Verdict = { ok: true; remainingToday: number | null } | { ok: false; status: number; error: string };

/** Ask tab: checks every limit and, if allowed, records the request. */
/**
 * Whether model spend has reached today's budget, for this user or for the whole app. For model
 * calls outside Ask (import help), which have no question to count but spend from the same purse.
 */
export async function overBudget(userId: string): Promise<boolean> {
  const db = await getDb();
  const dayAgo = new Date(Date.now() - 24 * HOUR);
  const spent = async (userOnly: boolean) =>
    Number((await db.select({ c: sql<number>`coalesce(sum(${schema.usage.costUsd}), 0)` }).from(schema.usage).where(userOnly ? and(eq(schema.usage.userId, userId), gte(schema.usage.createdAt, dayAgo)) : gte(schema.usage.createdAt, dayAgo)))[0]?.c ?? 0);
  const [mine, all] = await Promise.all([LIMITS.userDailyUsd ? spent(true) : 0, LIMITS.globalDailyUsd ? spent(false) : 0]);
  return Boolean((LIMITS.userDailyUsd && mine >= LIMITS.userDailyUsd) || (LIMITS.globalDailyUsd && all >= LIMITS.globalDailyUsd));
}

export async function checkAndRecord(userId: string, ip: string, isDemo: boolean): Promise<Verdict> {
  // A shared test account is used by many people: its daily allowance is per network.
  const who = isDemo ? `${userId}:${ip}` : userId;
  const db = await getDb();
  const now = Date.now();
  const dayAgo = new Date(now - 24 * HOUR);
  const minuteAgo = new Date(now - 60_000);
  const spend = async (userOnly: boolean) =>
    Number(
      (
        await db
          .select({ c: sql<number>`coalesce(sum(${schema.usage.costUsd}), 0)` })
          .from(schema.usage)
          .where(userOnly ? and(eq(schema.usage.userId, userId), gte(schema.usage.createdAt, dayAgo)) : gte(schema.usage.createdAt, dayAgo))
      )[0]?.c ?? 0,
    );
  const perDay = isDemo ? LIMITS.perDayDemo : LIMITS.perDay;
  const [minute, day, ipDay, userUsd, globalUsd] = await Promise.all([
    LIMITS.perMinute ? count(`chat:u:${who}`, minuteAgo) : 0,
    perDay ? count(`chat:u:${who}`, dayAgo) : 0,
    LIMITS.perDayIp ? count(`chat:ip:${ip}`, dayAgo) : 0,
    LIMITS.userDailyUsd ? spend(true) : 0,
    LIMITS.globalDailyUsd ? spend(false) : 0,
  ]);

  if (LIMITS.globalDailyUsd && globalUsd >= LIMITS.globalDailyUsd) return { ok: false, status: 503, error: "Ask has reached today's usage budget. Everything else in Nazar keeps working; please try Ask again tomorrow." };
  if (LIMITS.perMinute && minute >= LIMITS.perMinute) return { ok: false, status: 429, error: "You're asking too quickly. Wait a minute and try again." };
  if (perDay && day >= perDay)
    return { ok: false, status: 429, error: isDemo ? `The test account includes ${perDay} questions a day. Create a free account to keep asking.` : `You've used all ${perDay} questions for today. The limit resets on a rolling 24-hour basis.` };
  if (LIMITS.perDayIp && ipDay >= LIMITS.perDayIp) return { ok: false, status: 429, error: "Too many questions from this network today. Please try again later." };
  if (LIMITS.userDailyUsd && userUsd >= LIMITS.userDailyUsd) return { ok: false, status: 429, error: "You've reached today's usage budget for Ask. Try again tomorrow." };

  await Promise.all([record(`chat:u:${who}`), record(`chat:ip:${ip}`)]);
  return { ok: true, remainingToday: perDay ? Math.max(0, perDay - day - 1) : null };
}

/** For the UI: how many questions the user has left today. */
export async function remainingToday(userId: string, isDemo: boolean, ip?: string) {
  const perDay = isDemo ? LIMITS.perDayDemo : LIMITS.perDay;
  if (!perDay) return null;
  const n = await count(`chat:u:${isDemo && ip ? `${userId}:${ip}` : userId}`, new Date(Date.now() - 24 * HOUR));
  return { remaining: Math.max(0, perDay - n), limit: perDay };
}
