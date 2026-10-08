/**
 * The world an eval runs in: an in-memory database holding the two demo personas, priced by the
 * deterministic fake market the integration tests use. The same holdings, prices and history on
 * every run, so a change in an answer comes from the prompt or the model, not from the market.
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { createPglite, schema, setDbForTests, type DB } from "@/lib/db";
import { PERSONA_SYMBOLS } from "@/lib/demo/config";
import { createCopy, ensureTestAccounts } from "@/lib/demo/seed";
import { prevWeekday } from "@/lib/market/store";
import { GENERIC, fakeMarket } from "../tests/integration/fake-market";

/** The date every eval believes it is. Recorded tool results were fetched on this day. */
export const EVAL_TODAY = "2026-10-07";

export type World = { db: DB; account: (persona: "investor" | "saver" | "new") => Promise<{ id: string; isDemo: boolean; isTestAccount: boolean }> };

/**
 * The investor has one SIP: ₹10,000 on the 5th into their flexi-cap fund, with two instalments
 * already added by Nazar. The saver has none, so a case can ask about SIPs that do not exist.
 */
const SIP_FUND = "MF:122639";
async function seedSip(db: DB, userId: string) {
  const [row] = await db.select({ h: schema.holdings }).from(schema.holdings).innerJoin(schema.portfolios, eq(schema.portfolios.id, schema.holdings.portfolioId)).where(and(eq(schema.portfolios.userId, userId), eq(schema.holdings.symbol, SIP_FUND))).limit(1);
  if (!row) throw new Error("eval world: the investor persona no longer holds the fund its SIP is on");
  const h = row.h;
  const sipId = randomUUID();
  await db.insert(schema.sips).values({ id: sipId, portfolioId: h.portfolioId, holdingId: h.id, amount: 10000, dayOfMonth: 5, nextDue: "2026-11-05", instalments: 2, invested: 20000 });
  // Bought a little below the average the holding carries, so the two instalments show a small gain.
  for (const [date, price] of [["2026-09-07", h.avgPrice * 0.98], ["2026-10-05", h.avgPrice * 0.99]] as const)
    await db.insert(schema.holdingLots).values({ id: randomUUID(), holdingId: h.id, portfolioId: h.portfolioId, quantity: 10000 / price, price, date, remaining: 10000 / price, sipId });
}

export async function buildWorld(): Promise<World> {
  process.env.EMAIL_DISABLED = "1";
  process.env.NEWS_ENABLED = "0";
  const db = await createPglite("memory://");
  setDbForTests(db);
  for (const s of PERSONA_SYMBOLS) GENERIC.add(s);
  const market = fakeMarket();
  market.state.day = prevWeekday(EVAL_TODAY);
  const r = await ensureTestAccounts(db, { provider: market.provider, now: new Date(`${EVAL_TODAY}T06:00:00Z`) });
  if (!r.built?.length) throw new Error(`eval world: personas were not built (${r.reason ?? "unknown"})`);
  return {
    db,
    /** A private copy per case, so one case adding to a Watching list cannot change another's answer. */
    async account(persona) {
      if (persona !== "new") {
        const id = await createCopy(db, persona);
        if (persona === "investor") await seedSip(db, id);
        return { id, isDemo: false, isTestAccount: false };
      }
      const id = randomUUID();
      await db.insert(schema.users).values({ id, email: `eval-${id}@nazar.internal`, name: "New", emailVerifiedAt: new Date() });
      return { id, isDemo: false, isTestAccount: false };
    },
  };
}
