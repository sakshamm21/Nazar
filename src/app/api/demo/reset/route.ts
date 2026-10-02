import { resetSimulation } from "@/lib/demo/simulate";
import { api, json, requireUser } from "@/lib/http";

export const runtime = "nodejs";

/** "Back to normal": removes the simulated session and its alerts. */
export const POST = api(async (req) => {
  const user = await requireUser(req);
  await resetSimulation(user.id);
  return json({ ok: true });
});
