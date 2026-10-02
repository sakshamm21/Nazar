import "server-only";
import { eq } from "drizzle-orm";
import { z, ZodError } from "zod";
import { getDb, schema } from "@/lib/db";
import { AppError, unauthenticated } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { sessionFromRequest } from "@/lib/auth/session";

export type User = typeof schema.users.$inferSelect;

/** Route-handler wrapper: AppError → status + {error, code}; zod → 400; anything else → 500 (logged). */
export function api<A extends unknown[]>(fn: (req: Request, ...rest: A) => Promise<Response>) {
  return async (req: Request, ...rest: A): Promise<Response> => {
    try {
      return await fn(req, ...rest);
    } catch (e) {
      if (e instanceof AppError) return Response.json({ error: e.message, code: e.code, ...(e.details ?? {}) }, { status: e.status });
      if (e instanceof ZodError) return Response.json({ error: e.issues[0]?.message ?? "Invalid input.", code: "VALIDATION" }, { status: 400 });
      logger.error({ err: String((e as Error)?.stack ?? e) }, "unhandled API error");
      return Response.json({ error: "Something went wrong. Please try again.", code: "SERVER_ERROR" }, { status: 500 });
    }
  };
}

export async function parseBody<T extends z.ZodTypeAny>(req: Request, s: T): Promise<z.infer<T>> {
  const body = await req.json().catch(() => null);
  return s.parse(body);
}

/** The signed-in user (or a 401). Demo users whose 24 hours are up are treated as signed out. */
export async function requireUser(req: Request): Promise<User> {
  const s = await sessionFromRequest(req);
  if (!s) throw unauthenticated();
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, s.userId)).limit(1);
  if (!u || (u.isDemo && u.demoExpiresAt && u.demoExpiresAt < new Date())) throw unauthenticated("Your session has ended. Please sign in again.");
  return u;
}

export const json = (data: unknown, init?: ResponseInit) => Response.json(data, init);
