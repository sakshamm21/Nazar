/**
 * The world an eval runs in: an in-memory database holding the two demo personas, priced by the
 * deterministic fake market the integration tests use. The same holdings, prices and history on
 * every run, so a change in an answer comes from the prompt or the model, not from the market.
 */
import { randomUUID } from "node:crypto";
import { createPglite, schema, setDbForTests, type DB } from "@/lib/db";
import { PERSONA_SYMBOLS } from "@/lib/demo/config";
import { createCopy, ensureTestAccounts } from "@/lib/demo/seed";
import { prevWeekday } from "@/lib/market/store";
import { GENERIC, fakeMarket } from "../tests/integration/fake-market";

/** The date every eval believes it is. Recorded tool results were fetched on this day. */
export const EVAL_TODAY = "2026-10-07";

export type World = { db: DB; account: (persona: "investor" | "saver" | "new") => Promise<{ id: string; isDemo: boolean; isTestAccount: boolean }> };

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
      if (persona !== "new") return { id: await createCopy(db, persona), isDemo: false, isTestAccount: false };
      const id = randomUUID();
      await db.insert(schema.users).values({ id, email: `eval-${id}@nazar.internal`, name: "New", emailVerifiedAt: new Date() });
      return { id, isDemo: false, isTestAccount: false };
    },
  };
}
