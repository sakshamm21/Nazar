import { api, json, requireUser } from "@/lib/http";
import { incomeForHolding } from "@/lib/repo/income";
import { lotRowsForHolding } from "@/lib/repo/lots";
import { requireHolding } from "@/lib/repo/portfolios";
import { salesForHolding } from "@/lib/repo/sales";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** A holding's purchases (each still held or sold), its sales and the income it paid. */
export const GET = api(async (req, ctx: Ctx) => {
  const u = await requireUser(req);
  const { id } = await ctx.params;
  await requireHolding(u.id, id);
  const [lots, sales, income] = await Promise.all([lotRowsForHolding(id), salesForHolding(u.id, id), incomeForHolding(u.id, id)]);
  return json({
    lots: lots.map((l) => ({ id: l.id, date: l.date, quantity: l.quantity, remaining: l.remaining, price: l.price, sip: !!l.sipId })),
    sales: sales.map((s) => ({ id: s.id, date: s.date, units: s.units, price: s.price, cost: s.cost })),
    income: income.map((x) => ({ id: x.id, date: x.date, kind: x.kind, amount: x.amount })),
  });
});
