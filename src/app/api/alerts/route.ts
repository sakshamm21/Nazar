import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { createAlert, deleteAlerts, listAlerts } from "@/lib/alerts";

export const runtime = "nodejs";

const Create = z.object({
  symbol: z.string().trim().min(1).max(20),
  direction: z.enum(["above", "below"]),
  target: z.number().positive().finite(),
  note: z.string().max(140).optional(),
});
const Delete = z.object({ ids: z.array(z.string().max(64)).min(1).max(50) });

export async function GET() {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });
  return Response.json(await listAlerts(userId));
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });
  const body = Create.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid alert. Need symbol, direction (above/below) and a positive target." }, { status: 400 });
  const r = await createAlert(userId, body.data);
  if ("error" in r) return Response.json(r, { status: 400 });
  return Response.json({ ...r, ...(await listAlerts(userId)) });
}

export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });
  const body = Delete.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Send { ids: string[] }" }, { status: 400 });
  await deleteAlerts(userId, body.data.ids);
  return Response.json(await listAlerts(userId));
}
