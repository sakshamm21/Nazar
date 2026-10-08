import "server-only";
import { eq, inArray } from "drizzle-orm";
import { istDate } from "@/lib/data/provider";
import { getDb, schema } from "@/lib/db";
import { displayName } from "@/lib/market/portfolio-day";
import { instrumentsFor, latestTradeDate, snapshotsAsOf, sourcesFor } from "@/lib/market/store";
import { sipLots } from "@/lib/repo/sips";
import { goalsView } from "./goals";

/**
 * The user's monthly SIPs, across every portfolio: each plan, what Nazar has added for it so far and
 * what those units are worth now, and the monthly total beside what the user's goals need. The
 * comparison with goals is two totals side by side and nothing more: Nazar does not decide which
 * SIP is "for" which goal.
 */
export type SipRowView = {
  portfolio: string;
  holding: string;
  symbol: string;
  amount: number;
  dayOfMonth: number;
  active: boolean;
  nextDue: string;
  endDate: string | null;
  /** Instalments Nazar added since the plan was set up, and the rupees in them. Earlier ones are part of the holding, not counted here. */
  instalmentsAdded: number;
  investedThroughNazar: number;
  /** Of those, what is still held: its cost, and its value at the latest price. Null before a price is known. */
  stillHeldCost: number;
  valueNow: number | null;
  gain: number | null;
  gainPct: number | null;
  firstAddedOn: string | null;
  lastAddedOn: string | null;
};

export async function sipsView(user: { id: string }) {
  const db = await getDb();
  const sources = sourcesFor(user);
  const portfolios = await db.select().from(schema.portfolios).where(eq(schema.portfolios.userId, user.id));
  const plans = portfolios.length ? await db.select({ sip: schema.sips, holding: schema.holdings }).from(schema.sips).innerJoin(schema.holdings, eq(schema.holdings.id, schema.sips.holdingId)).where(inArray(schema.sips.portfolioId, portfolios.map((p) => p.id))) : [];
  const symbols = [...new Set(plans.map((p) => p.holding.symbol))];
  const date = (await latestTradeDate(db, sources)) ?? istDate(new Date());
  const [snaps, inst, lots, goals] = await Promise.all([snapshotsAsOf(db, symbols, date, sources), instrumentsFor(db, symbols), sipLots(db, plans.map((p) => p.sip.id)), goalsView(user.id)]);
  const rows: SipRowView[] = plans
    .map(({ sip, holding }) => {
      const price = snaps.get(holding.symbol)?.price ?? null;
      const l = lots.get(sip.id) ?? { units: 0, cost: 0, first: null, last: null };
      const valueNow = price != null && l.units > 0 ? l.units * price : l.units > 0 ? null : 0;
      return {
        portfolio: portfolios.find((p) => p.id === sip.portfolioId)?.name ?? "",
        holding: displayName(holding.symbol, inst.get(holding.symbol)),
        symbol: holding.symbol,
        amount: sip.amount,
        dayOfMonth: sip.dayOfMonth,
        active: sip.active,
        nextDue: sip.nextDue,
        endDate: sip.endDate,
        instalmentsAdded: sip.instalments,
        investedThroughNazar: sip.invested,
        stillHeldCost: l.cost,
        valueNow,
        gain: valueNow != null && l.units > 0 ? valueNow - l.cost : null,
        gainPct: valueNow != null && l.cost > 0 ? valueNow / l.cost - 1 : null,
        firstAddedOn: l.first,
        lastAddedOn: l.last,
      };
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || b.amount - a.amount);
  const live = rows.filter((r) => r.active);
  const monthly = live.reduce((a, r) => a + r.amount, 0);
  // What the user's goals need each month from here, by their own figures; nothing if they have none.
  const goalsNeed = goals.rows.filter((g) => g.projection.status !== "expired" && g.projection.status !== "met").reduce((a, g) => a + Math.max(g.projection.requiredMonthly, 0), 0);
  return {
    asOf: date,
    rows,
    monthly,
    active: live.length,
    paused: rows.length - live.length,
    nextDue: live.map((r) => r.nextDue).sort()[0] ?? null,
    goals: goals.rows.length ? { needEachMonth: goalsNeed, sipsEachMonth: monthly, difference: monthly - goalsNeed } : null,
  };
}

export type SipsView = Awaited<ReturnType<typeof sipsView>>;
