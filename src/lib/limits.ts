import "server-only";
import { createHash, randomUUID } from "crypto";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { authSecret } from "./auth";
import { getDb, schema } from "./db";

const envNum = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};

/** All limits are env-configurable; 0 disables a limit. */
export const LIMITS = {
  /** Questions per user per rolling minute (burst protection). */
  perMinute: envNum("RATE_LIMIT_PER_MINUTE", 6),
  /** Questions per user per rolling 24h. */
  perDay: envNum("RATE_LIMIT_PER_DAY", 60),
  /** Questions per IP per rolling 24h — stops one person minting many fingerprints. */
  perDayIp: envNum("RATE_LIMIT_PER_DAY_IP", 150),
  /** Max OpenAI spend (USD) per user per rolling 24h. */
  userDailyUsd: envNum("USER_DAILY_BUDGET_USD", 0.5),
  /** Max OpenAI spend (USD) across ALL users per rolling 24h — protects your bill. */
  globalDailyUsd: envNum("GLOBAL_DAILY_BUDGET_USD", 10),
  /** Max characters in one question. */
  maxInputChars: envNum("MAX_INPUT_CHARS", 2000),
};

export function clientIpHash(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  return createHash("sha256").update(`${authSecret ?? ""}:ip:${ip}`).digest("hex").slice(0, 32);
}

type Verdict = { ok: true; remainingToday: number | null } | { ok: false; status: number; error: string };

const HOUR = 3600_000;

/** Checks every limit and, if allowed, records the request. */
export async function checkAndRecord(userId: string, ipHash: string): Promise<Verdict> {
  const db = await getDb();
  const now = Date.now();
  const dayAgo = new Date(now - 24 * HOUR);
  const minuteAgo = new Date(now - 60_000);

  const count = async (where: ReturnType<typeof and>) =>
    Number((await db.select({ n: sql<number>`count(*)::int` }).from(schema.rateEvents).where(where))[0]?.n ?? 0);
  const spend = async (userOnly: boolean) =>
    Number(
      (
        await db
          .select({ c: sql<number>`coalesce(sum(${schema.usage.costUsd}), 0)` })
          .from(schema.usage)
          .where(userOnly ? and(eq(schema.usage.userId, userId), gte(schema.usage.createdAt, dayAgo)) : gte(schema.usage.createdAt, dayAgo))
      )[0]?.c ?? 0,
    );

  const [minute, day, ipDay, userUsd, globalUsd] = await Promise.all([
    LIMITS.perMinute ? count(and(eq(schema.rateEvents.userId, userId), gte(schema.rateEvents.createdAt, minuteAgo))) : 0,
    LIMITS.perDay ? count(and(eq(schema.rateEvents.userId, userId), gte(schema.rateEvents.createdAt, dayAgo))) : 0,
    LIMITS.perDayIp ? count(and(eq(schema.rateEvents.ipHash, ipHash), gte(schema.rateEvents.createdAt, dayAgo))) : 0,
    LIMITS.userDailyUsd ? spend(true) : 0,
    LIMITS.globalDailyUsd ? spend(false) : 0,
  ]);

  if (LIMITS.globalDailyUsd && globalUsd >= LIMITS.globalDailyUsd)
    return { ok: false, status: 503, error: "Stock AI has hit its daily usage budget. Please try again tomorrow." };
  if (LIMITS.perMinute && minute >= LIMITS.perMinute) return { ok: false, status: 429, error: "You're asking too quickly. Wait a minute and try again." };
  if (LIMITS.perDay && day >= LIMITS.perDay) return { ok: false, status: 429, error: `You've used all ${LIMITS.perDay} questions for today. The limit resets on a rolling 24-hour basis.` };
  if (LIMITS.perDayIp && ipDay >= LIMITS.perDayIp) return { ok: false, status: 429, error: "Too many questions from this network today. Please try again later." };
  if (LIMITS.userDailyUsd && userUsd >= LIMITS.userDailyUsd)
    return { ok: false, status: 429, error: `You've reached today's usage budget ($${LIMITS.userDailyUsd.toFixed(2)}). Try a cheaper model or come back tomorrow.` };

  await db.insert(schema.rateEvents).values({ id: randomUUID(), userId, ipHash });
  // Opportunistic cleanup so the table stays small.
  if (Math.random() < 0.02) await db.delete(schema.rateEvents).where(lt(schema.rateEvents.createdAt, new Date(now - 48 * HOUR))).catch(() => {});
  return { ok: true, remainingToday: LIMITS.perDay ? Math.max(0, LIMITS.perDay - day - 1) : null };
}

/** For the UI: how many questions the user has left today. */
export async function remainingToday(userId: string) {
  if (!LIMITS.perDay) return null;
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.rateEvents)
    .where(and(eq(schema.rateEvents.userId, userId), gte(schema.rateEvents.createdAt, new Date(Date.now() - 24 * HOUR))));
  return { remaining: Math.max(0, LIMITS.perDay - Number(n)), limit: LIMITS.perDay };
}
