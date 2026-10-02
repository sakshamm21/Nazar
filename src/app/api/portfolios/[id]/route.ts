import { z } from "zod";
import { api, json, parseBody, requireUser } from "@/lib/http";
import { deletePortfolio, listHoldings, requirePortfolio, updatePortfolio } from "@/lib/repo/portfolios";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

const Patch = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  ownerLabel: z.string().trim().max(40).nullable().optional(),
  language: z.enum(["en", "hi"]).optional(),
  alertsEnabled: z.boolean().optional(),
});

export const GET = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  return json({ portfolio: await requirePortfolio(u.id, id), holdings: await listHoldings(u.id, id) });
});

export const PATCH = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  const body = await parseBody(req, Patch);
  return json({ portfolio: await updatePortfolio(u.id, id, { ...body, ownerLabel: body.ownerLabel === "" ? null : body.ownerLabel }) });
});

export const DELETE = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  await deletePortfolio(u.id, id);
  return json({ ok: true });
});
