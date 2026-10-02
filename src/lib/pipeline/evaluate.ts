import "server-only";
import { randomUUID } from "crypto";
import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { AlertType } from "@/lib/db/schema";
import { safeText } from "@/lib/alerts/guard";
import { evaluate, type Candidate } from "@/lib/alerts/rules";
import { effectiveSettings, LADDERS, PRESETS } from "@/lib/alerts/thresholds";
import { tune } from "@/lib/alerts/tuner";
import { dropShared, fetchCompanyNews, type Headline } from "@/lib/news/google";
import { loadPortfolioDay } from "@/lib/market/portfolio-day";
import { shiftDate } from "@/lib/market/store";
import { applyTuning, getSettings, getThresholds, ratedAlerts } from "@/lib/repo/alerts";
import { track } from "@/lib/analytics";

/**
 * Alerts stage: for each of a user's portfolios, build the day from stored snapshots, run the
 * rule engine (H1/H4), attach company-specific headlines, run the no-advice net, and insert with
 * `on conflict do nothing` (dedupe). Then run the H5 tuner for the user.
 */
export type EvalOptions = { date: string; sources: string[]; simulated?: boolean; news?: boolean; now?: Date; createdAt?: Date; tune?: boolean };

type UserRow = typeof schema.users.$inferSelect;

export async function evaluateUser(user: UserRow, opts: EvalOptions): Promise<{ created: string[]; skipped: boolean }> {
  const db = await getDb();
  const portfolios = await db.select().from(schema.portfolios).where(eq(schema.portfolios.userId, user.id));
  const settings = await getSettings(user.id);
  const eff = effectiveSettings(settings.sensitivity, await getThresholds(user.id));
  const created: string[] = [];
  let anySession = false;
  const pending: { c: Candidate; portfolioId: string; companyNews: { name: string; symbol: string } | null }[] = [];
  const otherNames: string[] = [];

  for (const p of portfolios) {
    const holdings = await db.select().from(schema.holdings).where(eq(schema.holdings.portfolioId, p.id));
    if (!holdings.length) continue;
    const day = await loadPortfolioDay(db, holdings, opts.date, opts.sources);
    if (day.nifty?.tradeDate !== opts.date) continue; // holiday / no session yet
    anySession = true;
    otherNames.push(...day.holdings.map((h) => h.name.toLowerCase()));
    const recent = await db
      .select({ type: schema.alertEvents.type, symbol: schema.alertEvents.symbol, tradeDate: schema.alertEvents.tradeDate })
      .from(schema.alertEvents)
      .where(and(eq(schema.alertEvents.portfolioId, p.id), gte(schema.alertEvents.tradeDate, shiftDate(opts.date, -30))));
    const targets = await db.select().from(schema.priceTargets).where(and(eq(schema.priceTargets.userId, user.id), isNull(schema.priceTargets.triggeredAt), inArray(schema.priceTargets.symbol, holdings.map((h) => h.symbol))));
    const cands = evaluate(
      { tradeDate: opts.date, portfolio: { id: p.id, ownerLabel: p.ownerLabel }, holdings: day.holdings, niftyPct: day.niftyPct, sectorPct: day.sectorPct, recent, priceTargets: targets.map((t) => ({ id: t.id, symbol: t.symbol, direction: t.direction, target: t.target, note: t.note })) },
      eff,
    );
    for (const c of cands) {
      const company = c.type === "stock_move" && c.data.reason?.kind === "company" && c.symbol ? { name: c.data.name ?? c.symbol, symbol: c.symbol } : null;
      pending.push({ c, portfolioId: p.id, companyNews: company });
      if (c.type === "price_target" && c.data.priceTargetId) await db.update(schema.priceTargets).set({ triggeredAt: new Date(), triggeredPrice: null }).where(eq(schema.priceTargets.id, String(c.data.priceTargetId)));
    }
  }

  // Company-specific headlines (live only; simulated and demo alerts never show invented news).
  const news = new Map<string, Headline[]>();
  if (opts.news && !opts.simulated) {
    const wanted = [...new Map(pending.filter((x) => x.companyNews).map((x) => [x.companyNews!.symbol, x.companyNews!])).values()];
    for (const w of wanted.slice(0, 10)) news.set(w.symbol, await fetchCompanyNews(w.name, w.symbol, { since: new Date(`${shiftDate(opts.date, -2)}T00:00:00Z`), otherCompanies: otherNames }));
  }
  const filtered = dropShared(news);

  for (const { c, portfolioId } of pending) {
    const id = randomUUID();
    const headlines = c.symbol ? (filtered.get(c.symbol) ?? []) : [];
    const fallbackEn = c.title.en, fallbackHi = c.title.hi;
    const inserted = await db
      .insert(schema.alertEvents)
      .values({
        id,
        userId: user.id,
        portfolioId,
        type: c.type,
        symbol: c.symbol,
        severity: c.severity,
        tradeDate: opts.date,
        dedupeKey: (opts.simulated ? "sim:" : "") + c.dedupeKey,
        titleEn: safeText(c.title.en, "Something changed in your portfolio", "alert title"),
        bodyEn: safeText(c.body.en, fallbackEn, "alert body"),
        titleHi: safeText(c.title.hi, "आपके पोर्टफोलियो में बदलाव", "alert title hi"),
        bodyHi: safeText(c.body.hi, fallbackHi, "alert body hi"),
        data: { ...c.data, ...(headlines.length ? { headlines } : {}) },
        isSimulated: Boolean(opts.simulated),
        ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      })
      .onConflictDoNothing()
      .returning({ id: schema.alertEvents.id });
    if (inserted.length) {
      created.push(id);
      track(user.id, "alert_created", { type: c.type, severity: c.severity, simulated: Boolean(opts.simulated), reason: c.data.reason?.kind ?? null, demo: user.isDemo });
    }
  }

  if (opts.tune !== false && !opts.simulated) await runTuner(user.id, settings.sensitivity, opts.date, opts.now ?? new Date());
  return { created, skipped: !anySession };
}

const TUNED_TYPES: AlertType[] = ["stock_move", "portfolio_move", "concentration", "results_upcoming"];

/** H5: one decision per alert type at most; applies and announces any change. */
export async function runTuner(userId: string, sensitivity: keyof typeof PRESETS, tradeDate: string, now = new Date()) {
  const db = await getDb();
  const thresholds = await db.select().from(schema.alertThresholds).where(eq(schema.alertThresholds.userId, userId));
  const changes = await db.select().from(schema.thresholdChanges).where(eq(schema.thresholdChanges.userId, userId)).orderBy(desc(schema.thresholdChanges.createdAt));
  const preset = PRESETS[sensitivity];
  const out: string[] = [];
  for (const type of TUNED_TYPES) {
    const row = thresholds.find((t) => t.alertType === type);
    if (row?.muted) continue;
    const presetValue = type === "stock_move" ? preset.stock_move : type === "portfolio_move" ? preset.portfolio_move : type === "concentration" ? preset.concentration : (LADDERS[type]?.[0] ?? 0);
    const current = type === "results_upcoming" ? 0 : Math.max(presetValue, row?.value ?? 0);
    const last = changes.find((c) => c.alertType === type);
    const ratings = await ratedAlerts(userId, type, new Date(now.getTime() - 90 * 86400000));
    const d = tune({ type, current, ratings, lastChangeAt: last?.createdAt ?? null, frozenUntil: row?.frozenUntil ?? null, now });
    if (d) out.push(await applyTuning(userId, d, tradeDate, now));
  }
  return out;
}
