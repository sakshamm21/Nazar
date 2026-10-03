import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { api, json, requireUser } from "@/lib/http";

export const runtime = "nodejs";

/** The user's Ask conversations, newest first. */
export const GET = api(async (req) => {
  const u = await requireUser(req);
  const db = await getDb();
  const chats = await db
    .select({ id: schema.chats.id, title: schema.chats.title, updatedAt: schema.chats.updatedAt })
    .from(schema.chats)
    .where(eq(schema.chats.userId, u.id))
    .orderBy(desc(schema.chats.updatedAt))
    .limit(100);
  return json({ chats });
});
