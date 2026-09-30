import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { track } from "@/lib/analytics";
import { getUserId } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { FEEDBACK_REASONS, type FeedbackReason } from "@/lib/feedback-reasons";

export const runtime = "nodejs";

const Body = z.object({
  chatId: z.string().max(64),
  messageId: z.string().max(100),
  rating: z.enum(["up", "down"]).nullable(),
  reason: z.enum(Object.keys(FEEDBACK_REASONS) as [FeedbackReason, ...FeedbackReason[]]).optional(),
});

/** 👍/👎 on an assistant answer. rating=null clears it. Only messages in the user's own chats can be rated. */
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const { chatId, messageId, rating, reason } = body.data;
  const db = await getDb();
  const [chat] = await db.select({ messages: schema.chats.messages }).from(schema.chats).where(and(eq(schema.chats.id, chatId), eq(schema.chats.userId, userId))).limit(1);
  const msg = (Array.isArray(chat?.messages) ? chat.messages : []).find((m: { id?: string; role?: string }) => m.id === messageId && m.role === "assistant") as
    | { metadata?: { model?: string; mode?: string } }
    | undefined;
  if (!msg) return Response.json({ error: "Message not found" }, { status: 404 });
  if (rating === null) {
    await db.delete(schema.feedback).where(and(eq(schema.feedback.userId, userId), eq(schema.feedback.messageId, messageId)));
    return Response.json({ ok: true });
  }
  const row = { userId, messageId, chatId, rating, reason: rating === "down" ? (reason ?? null) : null, model: msg.metadata?.model ?? null, mode: msg.metadata?.mode ?? null };
  await db
    .insert(schema.feedback)
    .values(row)
    .onConflictDoUpdate({ target: [schema.feedback.userId, schema.feedback.messageId], set: { rating: row.rating, reason: row.reason, createdAt: new Date() } });
  track(userId, "feedback", { rating, reason: row.reason, model: row.model, mode: row.mode }, chatId);
  return Response.json({ ok: true });
}
