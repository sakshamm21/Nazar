import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { adjustedBeta } from "@/lib/portfolio/math";
import { NIFTY, SECTOR_INDICES, sectorOf } from "@/lib/instruments/sectors";
import { latestTradeDate, shiftDate, snapshotsAsOf, sourcesFor, instrumentsFor } from "@/lib/market/store";
import { evaluateUser } from "@/lib/pipeline/evaluate";
import { track } from "@/lib/events";

/**
 * DEMO: "Simulate a bad day in the market". Generates a realistic next session for the visitor's
 * holdings and runs the REAL alert engine on it. Each stock's move = its beta × the market move,
 * plus its sector's extra move, plus a small deterministic wobble — and one holding gets a
 * company-specific shock so every "likely reason" type shows up. Written under the visitor's own
 * source ("sim:<userId>"), so nobody else sees it; alerts are badged SIMULATION and never carry
 * invented news. "Back to normal" deletes it all.
 */
export type Scenario = { id: string; label: string; labelHi: string; market: number; sectors: Record<string, number>; company: { pick: "largest-auto" | "largest-nonfinancial"; move: number } | null };

export const SCENARIOS: Record<string, Scenario> = {
  "global-selloff": {
    id: "global-selloff",
    label: "Global slide: the Nifty falls 3.2%, IT and autos hit hardest",
    labelHi: "वैश्विक गिरावट: निफ्टी 3.2% गिरा, आईटी और ऑटो पर सबसे ज़्यादा असर",
    market: -0.032,
    sectors: { IT: -0.052, Auto: -0.045, Banks: -0.036, "Financial services": -0.038, "Energy & power": -0.025, FMCG: -0.012, "Pharma & healthcare": -0.009, "Telecom & media": -0.021 },
    company: { pick: "largest-auto", move: -0.083 },
  },
  "rate-shock": {
    id: "rate-shock",
    label: "Rate shock: banks fall 4% after a surprise rate hike",
    labelHi: "ब्याज दर का झटका: अचानक दर बढ़ने से बैंक 4% गिरे",
    market: -0.019,
    sectors: { Banks: -0.042, "Financial services": -0.047, Auto: -0.022, Realty: -0.05 },
    company: null,
  },
  "company-shock": {
    id: "company-shock",
    label: "One company shock: a quiet market, but one of your stocks falls 8%",
    labelHi: "एक कंपनी का झटका: बाज़ार शांत, लेकिन आपका एक शेयर 8% गिरा",
    market: -0.003,
    sectors: {},
    company: { pick: "largest-nonfinancial", move: -0.081 },
  },
};

const wobble = (symbol: string) => {
  let h = 0;
  for (const c of symbol) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ((h % 1000) / 1000 - 0.5) * 0.012; // ±0.6%
};

export async function simulate(userId: string, scenarioId: string) {
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user?.isDemo) throw new Error("Simulation is only available in demo accounts.");
  await resetSimulation(userId);
  const sc = SCENARIOS[scenarioId] ?? SCENARIOS["global-selloff"];
  const chain = sourcesFor({ ...user, simState: null });
  const today = await latestTradeDate(db, chain);
  if (!today) throw new Error("Demo market not ready yet.");
  let simDate = shiftDate(today, 1);
  while ([0, 6].includes(new Date(`${simDate}T00:00:00Z`).getUTCDay())) simDate = shiftDate(simDate, 1);

  const pfs = await db.select({ id: schema.portfolios.id }).from(schema.portfolios).where(eq(schema.portfolios.userId, userId));
  const holdings = pfs.length ? await db.select().from(schema.holdings).where(inArray(schema.holdings.portfolioId, pfs.map((p) => p.id))) : [];
  const symbols = [...new Set(holdings.map((h) => h.symbol))];
  const [snaps, inst] = await Promise.all([snapshotsAsOf(db, [...symbols, NIFTY, ...SECTOR_INDICES], today, chain), instrumentsFor(db, symbols)]);

  // The company-specific shock: largest auto holding (or largest non-financial).
  const value = (s: string) => holdings.filter((h) => h.symbol === s).reduce((a, h) => a + h.quantity * (snaps.get(s)?.price ?? h.avgPrice), 0);
  const sectorFor = (s: string) => sectorOf(inst.get(s)?.sector, inst.get(s)?.industry);
  let shocked: string | null = null;
  if (sc.company) {
    const pool = symbols.filter((s) => (sc.company!.pick === "largest-auto" ? sectorFor(s).label === "Auto" : !sectorFor(s).financial));
    shocked = (pool.length ? pool : symbols).sort((a, b) => value(b) - value(a))[0] ?? null;
  }

  const source = `sim:${userId}`;
  const priceRows: (typeof schema.priceDaily.$inferInsert)[] = [];
  const snapRows: (typeof schema.symbolSnapshots.$inferInsert)[] = [];
  const asOf = new Date(`${simDate}T10:00:00Z`);
  const push = (symbol: string, move: number) => {
    const base = snaps.get(symbol);
    if (!base?.price) return;
    const price = Math.round(base.price * (1 + move) * 100) / 100;
    priceRows.push({ symbol, date: simDate, source, close: price, volume: null });
    snapRows.push({ ...base, symbol, tradeDate: simDate, source, price, prevClose: base.price, changePct: price / base.price - 1, asOf, fetchedAt: new Date(asOf.getTime() + 47 * 60000), status: "ok" });
  };
  push(NIFTY, sc.market);
  const indexMove: Record<string, number> = { "^NSEBANK": sc.sectors.Banks ?? sc.market * 1.1, "^CNXIT": sc.sectors.IT ?? sc.market * 0.9, "^CNXPHARMA": sc.sectors["Pharma & healthcare"] ?? sc.market * 0.6 };
  for (const [idx, mv] of Object.entries(indexMove)) push(idx, mv);
  for (const s of symbols) {
    const sec = sectorFor(s);
    const b = adjustedBeta(snaps.get(s)?.beta ?? null);
    const move = s === shocked ? sc.company!.move : (sc.sectors[sec.label] ?? b * sc.market) + wobble(s);
    push(s, Math.max(-0.2, Math.min(0.2, move)));
  }
  if (priceRows.length) await db.insert(schema.priceDaily).values(priceRows).onConflictDoNothing();
  if (snapRows.length) await db.insert(schema.symbolSnapshots).values(snapRows).onConflictDoNothing();

  const simState = { date: simDate, scenario: sc.id, label: sc.label };
  await db.update(schema.users).set({ simState }).where(eq(schema.users.id, userId));
  const r = await evaluateUser({ ...user, simState }, { date: simDate, sources: [source, ...chain], simulated: true, news: false, tune: false });
  track(userId, "simulate", { scenario: sc.id, alerts: r.created.length });
  return { simDate, scenario: sc, alertIds: r.created, shocked };
}

export async function resetSimulation(userId: string) {
  const db = await getDb();
  const source = `sim:${userId}`;
  await db.delete(schema.alertEvents).where(and(eq(schema.alertEvents.userId, userId), eq(schema.alertEvents.isSimulated, true)));
  await db.delete(schema.symbolSnapshots).where(eq(schema.symbolSnapshots.source, source));
  await db.delete(schema.priceDaily).where(eq(schema.priceDaily.source, source));
  await db.update(schema.users).set({ simState: null }).where(eq(schema.users.id, userId));
}
