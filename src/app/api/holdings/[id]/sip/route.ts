import { z } from "zod";
import { istDate } from "@/lib/data/provider";
import { track } from "@/lib/events";
import { api, json, parseBody, requireUser } from "@/lib/http";
import { SIP_MAX_AMOUNT, SIP_MAX_DAY, SIP_MIN_AMOUNT, SIP_MIN_DAY } from "@/lib/portfolio/sip";
import { removeSip, setSip } from "@/lib/repo/sips";

export const runtime = "nodejs";
// A start date years back fetches that much price history before it answers.
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  amount: z.number().min(SIP_MIN_AMOUNT).max(SIP_MAX_AMOUNT),
  dayOfMonth: z.number().int().min(SIP_MIN_DAY).max(SIP_MAX_DAY),
  /** When the SIP began. In the past: every instalment since is added now. Only read when the plan is first set. */
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  active: z.boolean().optional(),
});

/** Sets or changes the monthly SIP on a holding. One plan per holding. */
export const PUT = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  const body = await parseBody(req, Body);
  const { sip, added } = await setSip(u.id, id, body, istDate(new Date()));
  track(u.id, "sip_set", { amount: Math.round(body.amount), dayOfMonth: body.dayOfMonth, active: sip.active, backfilled: added });
  return json({ sip, added });
});

/** Stops the plan. Instalments already added stay in the holding, unless `?undo=1` asks for them to be taken back out. */
export const DELETE = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  const undo = new URL(req.url).searchParams.get("undo") === "1";
  const { removedInstalments } = await removeSip(u.id, id, { undo });
  track(u.id, "sip_removed", { undo, removedInstalments });
  return json({ ok: true, removedInstalments });
});
