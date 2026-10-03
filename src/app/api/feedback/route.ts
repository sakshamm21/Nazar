import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { track } from "@/lib/events";
import { getDb, schema } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { FEEDBACK_REASONS, type FeedbackReason } from "@/lib/ask/feedback-reasons";
import { api, json, parseBody, requireUser } from "@/lib/http";

export const runtime = "nodejs";

const Body = z.object({
  chatId: z.string().max(64),
  messageId: z.string().max(100),
  rating: z.enum(["up", "down"]).nullable(),
  reason: z.enum(Object.keys(FEEDBACK_REASONS) as [FeedbackReason, ...FeedbackReason[]]).optional(),
});

/** 👍/👎 on an Ask answer (null clears it). Only answers in the user's own chats can be rated. */
export const POST = api(async (req) => {
  const u = await requireUser(req);
  const { chatId, messageId, rating, reason } = await parseBody(req, Body);
  const db = await getDb();
  const [chat] = await db.select({ messages: schema.chats.messages }).from(schema.chats).where(and(eq(schema.chats.id, chatId), eq(schema.chats.userId, u.id))).limit(1);
  const msg = (Array.isArray(chat?.messages) ? chat.messages : []).find((m: { id?: string; role?: string }) => m.id === messageId && m.role === "assistant") as
    | { metadata?: { model?: string; mode?: string } }
    | undefined;
  if (!msg) throw notFound("Message not found.");
  if (rating === null) {
    await db.delete(schema.feedback).where(and(eq(schema.feedback.userId, u.id), eq(schema.feedback.messageId, messageId)));
    return json({ ok: true });
  }
  const row = { userId: u.id, messageId, chatId, rating, reason: rating === "down" ? (reason ?? null) : null, model: msg.metadata?.model ?? null, mode: msg.metadata?.mode ?? null };
  await db
    .insert(schema.feedback)
    .values(row)
    .onConflictDoUpdate({ target: [schema.feedback.userId, schema.feedback.messageId], set: { rating: row.rating, reason: row.reason, createdAt: new Date() } });
  track(u.id, "feedback", { rating, reason: row.reason, model: row.model, mode: row.mode }, chatId);
  return json({ ok: true });
});
