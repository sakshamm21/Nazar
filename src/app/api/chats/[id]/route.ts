import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { api, json, requireUser } from "@/lib/http";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** One conversation with the user's ratings of its answers. */
export const GET = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  const db = await getDb();
  const [chat] = await db.select().from(schema.chats).where(and(eq(schema.chats.id, id), eq(schema.chats.userId, u.id))).limit(1);
  if (!chat) throw notFound("Conversation not found.");
  const ratings = await db.select({ messageId: schema.feedback.messageId, rating: schema.feedback.rating }).from(schema.feedback).where(and(eq(schema.feedback.userId, u.id), eq(schema.feedback.chatId, id)));
  return json({ id: chat.id, title: chat.title, messages: chat.messages, shareId: chat.shareId, updatedAt: chat.updatedAt, feedback: Object.fromEntries(ratings.map((r) => [r.messageId, r.rating])) });
});

export const DELETE = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  const db = await getDb();
  await db.delete(schema.chats).where(and(eq(schema.chats.id, id), eq(schema.chats.userId, u.id)));
  return json({ ok: true });
});
