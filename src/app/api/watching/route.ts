import { after } from "next/server";
import { z } from "zod";
import { api, json, parseBody, requireUser } from "@/lib/http";
import { addWatching, listWatching, removeWatching } from "@/lib/repo/portfolios";
import { firstLookFor } from "@/lib/pipeline/first-look";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({ symbols: z.array(z.string().trim().min(1).max(30)).min(1).max(20) });

export const GET = api(async (req) => json({ watching: await listWatching((await requireUser(req)).id) }));

export const POST = api(async (req) => {
  const u = await requireUser(req);
  const { symbols } = await parseBody(req, Body);
  const rows = await addWatching(u.id, symbols);
  after(() => firstLookFor(u, symbols));
  return json({ watching: rows });
});

export const DELETE = api(async (req) => {
  const u = await requireUser(req);
  const { symbols } = await parseBody(req, Body);
  return json({ watching: await removeWatching(u.id, symbols) });
});
