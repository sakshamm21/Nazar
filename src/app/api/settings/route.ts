import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { forbidden } from "@/lib/errors";
import { api, json, parseBody, requireUser } from "@/lib/http";

export const runtime = "nodejs";

const Patch = z.object({ name: z.string().trim().min(1).max(80) });

export const PATCH = api(async (req) => {
  const u = await requireUser(req);
  const { name } = await parseBody(req, Patch);
  // The shared test account keeps its name, or one visitor's edit would greet everyone else.
  if (u.isTestAccount) throw forbidden("The demo account's name can't be changed. Create your own account to set yours.");
  const db = await getDb();
  await db.update(schema.users).set({ name }).where(eq(schema.users.id, u.id));
  return json({ ok: true });
});
