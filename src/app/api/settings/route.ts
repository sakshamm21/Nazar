import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { forbidden } from "@/lib/errors";
import { api, json, parseBody, requireUser } from "@/lib/http";
import { SLABS } from "@/lib/portfolio/capital-gains";

export const runtime = "nodejs";

const Prefs = z
  .object({
    taxSlabPct: z
      .number()
      .refine((x) => (SLABS as readonly number[]).includes(x), "Pick one of the income-tax slabs.")
      .nullable(),
  })
  .partial();
const Patch = z.object({ name: z.string().trim().min(1).max(80).optional(), prefs: Prefs.optional() });

export const PATCH = api(async (req) => {
  const u = await requireUser(req);
  const { name, prefs } = await parseBody(req, Patch);
  const db = await getDb();
  if (name != null) {
    // The shared test account keeps its name, or one visitor's edit would greet everyone else.
    if (u.isTestAccount) throw forbidden("The demo account's name can't be changed. Create your own account to set yours.");
    await db.update(schema.users).set({ name }).where(eq(schema.users.id, u.id));
  }
  if (prefs) await db.update(schema.users).set({ prefs: { ...(u.prefs ?? {}), ...prefs } }).where(eq(schema.users.id, u.id));
  return json({ ok: true });
});
