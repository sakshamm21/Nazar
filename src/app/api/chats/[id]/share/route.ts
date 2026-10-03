import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { track } from "@/lib/events";
import { getDb, schema } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { api, json, requireUser } from "@/lib/http";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Creates (or returns) a public read-only link for a conversation. */
export const POST = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  const db = await getDb();
  const [chat] = await db.select({ shareId: schema.chats.shareId }).from(schema.chats).where(and(eq(schema.chats.id, id), eq(schema.chats.userId, u.id))).limit(1);
  if (!chat) throw notFound("Send a message first. Only saved conversations can be shared.");
  let shareId = chat.shareId;
  if (!shareId) {
    shareId = randomBytes(12).toString("base64url");
    await db.update(schema.chats).set({ shareId }).where(eq(schema.chats.id, id));
    track(u.id, "share_created", {}, id);
  }
  return json({ shareId, url: `${new URL(req.url).origin}/s/${shareId}` });
});

/** Revokes the public link. */
export const DELETE = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  const db = await getDb();
  await db.update(schema.chats).set({ shareId: null }).where(and(eq(schema.chats.id, id), eq(schema.chats.userId, u.id)));
  return json({ ok: true });
});
