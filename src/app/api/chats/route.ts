import { desc, eq, sql } from "drizzle-orm";
import { sessionFromRequest } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const userId = (await sessionFromRequest(req))?.userId ?? null;
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });
  const db = await getDb();
  const chats = await db
    .select({ id: schema.chats.id, title: schema.chats.title, updatedAt: schema.chats.updatedAt })
    .from(schema.chats)
    .where(eq(schema.chats.userId, userId))
    .orderBy(desc(schema.chats.updatedAt))
    .limit(100);
  const [u] = await db
    .select({ cost: sql<number>`coalesce(sum(${schema.usage.costUsd}), 0)`, tokens: sql<number>`coalesce(sum(${schema.usage.inputTokens} + ${schema.usage.outputTokens}), 0)` })
    .from(schema.usage)
    .where(eq(schema.usage.userId, userId));
  return Response.json({ chats, usage: { costUsd: Number(u?.cost ?? 0), tokens: Number(u?.tokens ?? 0) } });
}
