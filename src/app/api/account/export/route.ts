import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { displayName } from "@/lib/market/portfolio-day";
import { api, json, requireUser } from "@/lib/http";

export const runtime = "nodejs";

/** Everything the person has entered, as plain rows, for a download they keep. Nothing of anyone else's. */
export const GET = api(async (req) => {
  const u = await requireUser(req);
  const db = await getDb();
  const portfolios = await db.select().from(schema.portfolios).where(eq(schema.portfolios.userId, u.id));
  const ids = portfolios.map((p) => p.id);
  const pname = new Map(portfolios.map((p) => [p.id, p.name]));
  const [holdings, lots, sales, income, sips, goals, watching] = await Promise.all([
    ids.length ? db.select().from(schema.holdings).where(inArray(schema.holdings.portfolioId, ids)) : [],
    ids.length ? db.select().from(schema.holdingLots).where(inArray(schema.holdingLots.portfolioId, ids)) : [],
    db.select().from(schema.holdingSales).where(eq(schema.holdingSales.userId, u.id)),
    db.select().from(schema.holdingIncome).where(eq(schema.holdingIncome.userId, u.id)),
    ids.length ? db.select().from(schema.sips).where(inArray(schema.sips.portfolioId, ids)) : [],
    db.select().from(schema.goals).where(eq(schema.goals.userId, u.id)),
    db.select().from(schema.watching).where(eq(schema.watching.userId, u.id)),
  ]);
  const hname = new Map(holdings.map((h) => [h.id, h.symbol.startsWith("MANUAL:") ? (h.rawName ?? "Manual asset") : displayName(h.symbol)]));
  return json({
    holdings: holdings.map((h) => ({ portfolio: pname.get(h.portfolioId), name: hname.get(h.id), symbol: h.symbol.startsWith("MANUAL:") ? "" : h.symbol, kind: h.assetClass, units: h.quantity, avgPrice: h.avgPrice, firstBought: h.buyDate, value: h.details?.value ?? null, source: h.source })),
    purchases: lots.map((l) => ({ portfolio: pname.get(l.portfolioId), name: hname.get(l.holdingId), date: l.date, units: l.quantity, price: l.price, stillHeld: l.remaining, sip: !!l.sipId })),
    sales: sales.map((s) => ({ portfolio: pname.get(s.portfolioId), name: s.name, date: s.date, units: s.units, price: s.price, cost: s.cost, gain: s.units * s.price - s.cost })),
    income: income.map((x) => ({ portfolio: pname.get(x.portfolioId), name: x.name, date: x.date, kind: x.kind, amount: x.amount })),
    sips: sips.map((s) => ({ portfolio: pname.get(s.portfolioId), name: hname.get(s.holdingId), amount: s.amount, day: s.dayOfMonth, started: s.startDate, ends: s.endDate, active: s.active, nextDue: s.nextDue })),
    goals: goals.map((g) => ({ name: g.name, target: g.target, byDate: g.byDate, saved: g.saved, savedAsOf: g.savedAsOf, monthly: g.monthly })),
    watching: watching.map((w) => ({ name: displayName(w.symbol), symbol: w.symbol })),
  });
});
