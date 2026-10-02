import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { track } from "@/lib/analytics";
import { sessionFromRequest } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";

export const runtime = "nodejs";

/** Create (or return) a public read-only link for a chat. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = (await sessionFromRequest(req))?.userId ?? null;
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  const db = await getDb();
  const [chat] = await db.select({ shareId: schema.chats.shareId }).from(schema.chats).where(and(eq(schema.chats.id, id), eq(schema.chats.userId, userId))).limit(1);
  if (!chat) return Response.json({ error: "Send a message first. Only saved chats can be shared." }, { status: 404 });
  let shareId = chat.shareId;
  if (!shareId) {
    shareId = randomBytes(12).toString("base64url");
    await db.update(schema.chats).set({ shareId }).where(eq(schema.chats.id, id));
    track(userId, "share_created", {}, id);
  }
  return Response.json({ shareId, url: `${new URL(req.url).origin}/s/${shareId}` });
}

/** Revoke the public link. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = (await sessionFromRequest(req))?.userId ?? null;
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  const db = await getDb();
  await db.update(schema.chats).set({ shareId: null }).where(and(eq(schema.chats.id, id), eq(schema.chats.userId, userId)));
  return Response.json({ ok: true });
}
