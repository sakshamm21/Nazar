import { z } from "zod";
import { api, json, parseBody, requireUser } from "@/lib/http";
import { createTarget, deleteTargets, listTargets } from "@/lib/repo/targets";

export const runtime = "nodejs";

const Create = z.object({ symbol: z.string().trim().min(1).max(30), direction: z.enum(["above", "below"]), target: z.number().positive().max(1e8), note: z.string().max(140).optional() });
const Delete = z.object({ ids: z.array(z.string().max(64)).min(1).max(50) });

/** Manual price alerts (P2): the user picks the level; Nazar only watches it. */
export const GET = api(async (req) => json({ targets: await listTargets((await requireUser(req)).id) }));

export const POST = api(async (req) => {
  const u = await requireUser(req);
  await createTarget(u.id, await parseBody(req, Create));
  return json({ targets: await listTargets(u.id) });
});

export const DELETE = api(async (req) => {
  const u = await requireUser(req);
  await deleteTargets(u.id, (await parseBody(req, Delete)).ids);
  return json({ targets: await listTargets(u.id) });
});
