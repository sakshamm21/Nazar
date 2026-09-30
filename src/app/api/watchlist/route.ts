import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { addToWatchlist, getWatchlist, removeFromWatchlist } from "@/lib/watchlist";

export const runtime = "nodejs";

const Body = z.object({ symbols: z.array(z.string().trim().min(1).max(20)).min(1).max(20) });

export async function GET() {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });
  return Response.json(await getWatchlist(userId));
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Send { symbols: string[] }" }, { status: 400 });
  const r = await addToWatchlist(userId, body.data.symbols);
  return Response.json({ ...r, ...(await getWatchlist(userId)) });
}

export async function DELETE(req: Request) {
  const userId = await getUserId();
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Send { symbols: string[] }" }, { status: 400 });
  await removeFromWatchlist(userId, body.data.symbols);
  return Response.json(await getWatchlist(userId));
}
