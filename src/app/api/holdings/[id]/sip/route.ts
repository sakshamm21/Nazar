import { z } from "zod";
import { istDate } from "@/lib/data/provider";
import { track } from "@/lib/events";
import { api, json, parseBody, requireUser } from "@/lib/http";
import { SIP_MAX_AMOUNT, SIP_MAX_DAY, SIP_MIN_AMOUNT, SIP_MIN_DAY } from "@/lib/portfolio/sip";
import { removeSip, setSip } from "@/lib/repo/sips";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  amount: z.number().min(SIP_MIN_AMOUNT).max(SIP_MAX_AMOUNT),
  dayOfMonth: z.number().int().min(SIP_MIN_DAY).max(SIP_MAX_DAY),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  active: z.boolean().optional(),
});

/** Sets or changes the monthly SIP on a holding. One plan per holding. */
export const PUT = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  const body = await parseBody(req, Body);
  const sip = await setSip(u.id, id, body, istDate(new Date()));
  track(u.id, "sip_set", { amount: Math.round(body.amount), dayOfMonth: body.dayOfMonth, active: sip.active });
  return json({ sip });
});

/** Stops the plan. Instalments already added stay in the holding. */
export const DELETE = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  await removeSip(u.id, id);
  track(u.id, "sip_removed", {});
  return json({ ok: true });
});
