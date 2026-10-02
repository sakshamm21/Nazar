import { and, eq } from "drizzle-orm";
import { sessionFromRequest } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = (await sessionFromRequest(req))?.userId ?? null;
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  const db = await getDb();
  const [chat] = await db.select().from(schema.chats).where(and(eq(schema.chats.id, id), eq(schema.chats.userId, userId))).limit(1);
  if (!chat) return Response.json({ error: "Not found" }, { status: 404 });
  const ratings = await db.select({ messageId: schema.feedback.messageId, rating: schema.feedback.rating }).from(schema.feedback).where(and(eq(schema.feedback.userId, userId), eq(schema.feedback.chatId, id)));
  return Response.json({ id: chat.id, title: chat.title, messages: chat.messages, shareId: chat.shareId, updatedAt: chat.updatedAt, feedback: Object.fromEntries(ratings.map((r) => [r.messageId, r.rating])) });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = (await sessionFromRequest(req))?.userId ?? null;
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  const db = await getDb();
  await db.delete(schema.chats).where(and(eq(schema.chats.id, id), eq(schema.chats.userId, userId)));
  return Response.json({ ok: true });
}
