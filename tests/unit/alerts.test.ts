import { describe, expect, it } from "vitest";
import { classifyReason } from "@/lib/alerts/reason";
import { route } from "@/lib/alerts/routing";
import { capDaily, evaluate, MAX_ALERTS_PER_DAY, type DayHolding, type DayInput } from "@/lib/alerts/rules";
import { quarterName, resultsPoints, resultsText } from "@/lib/alerts/templates";
import { effectiveSettings } from "@/lib/alerts/thresholds";
import { tune, type Rated } from "@/lib/alerts/tuner";

const dh = (o: Partial<DayHolding> & { symbol: string }): DayHolding => ({
  name: o.symbol,
  sector: "IT",
  sectorRaw: "Technology",
  industry: "Information Technology Services",
  quantity: 100,
  avgPrice: 100,
  buyDate: null,
  price: 100,
  prevClose: 100,
  changePct: 0,
  beta: 1,
  health: 70,
  healthPrev: 70,
  nextResultsDate: null,
  results: null,
  prevWeight: null,
  ...o,
});
const day = (holdings: DayHolding[], o: Partial<DayInput> = {}): DayInput => ({ tradeDate: "2026-10-02", portfolio: { id: "p1", ownerLabel: null }, holdings, niftyPct: -0.002, sectorPct: { "^CNXIT": -0.003 }, recent: [], ...o });
const move = (symbol: string, pct: number, extra: Partial<DayHolding> = {}) => dh({ symbol, prevClose: 100, price: 100 * (1 + pct), changePct: pct, ...extra });

describe("H1: likely reason", () => {
  it("whole market: Nifty moved and the stock moved about as much as its beta implies", () => {
    expect(classifyReason({ stockPct: -0.03, niftyPct: -0.025, sectorPct: null, beta: 1.2, recentResults: false })).toBe("market");
  });
  it("sector-wide: its sector index moved most of the way", () => {
    expect(classifyReason({ stockPct: -0.05, niftyPct: -0.003, sectorPct: -0.045, beta: 1, recentResults: false })).toBe("sector");
  });
  it("results: a move right after quarterly results", () => {
    expect(classifyReason({ stockPct: -0.07, niftyPct: 0.001, sectorPct: 0.002, beta: 1, recentResults: true })).toBe("results");
  });
  it("a falling market doesn't hide company news: −8.3% when the market explains ~−4.5%", () => {
    expect(classifyReason({ stockPct: -0.083, niftyPct: -0.032, sectorPct: -0.045, beta: 1.6, recentResults: false })).toBe("company");
  });
  it("company-specific otherwise", () => {
    expect(classifyReason({ stockPct: -0.07, niftyPct: -0.004, sectorPct: -0.009, beta: 1, recentResults: false })).toBe("company");
  });
});

describe("H1: alert rules", () => {
  const balanced = effectiveSettings("balanced");
  it("alerts on a big move with the reason and ₹ impact for this portfolio", () => {
    const c = evaluate(day([move("TMPV", -0.07, { name: "Tata Motors", sectorRaw: "Consumer Cyclical", industry: "Auto Manufacturers", quantity: 100 }), dh({ symbol: "X", quantity: 254 })]), balanced);
    const a = c.find((x) => x.type === "stock_move")!;
    expect(a.title.en).toBe("Tata Motors fell 7.0%");
    expect(a.severity).toBe("critical"); // ≥ 1% of portfolio value
    expect(a.data.impactInr).toBeCloseTo(-700, 6);
    expect(a.data.reason?.kind).toBe("company");
    expect(a.body.en).toMatch(/Tata Motors is 2\d% of your portfolio; its value fell ~₹700 today\./);
    expect(a.title.hi).toBe("Tata Motors 7.0% गिरा");
  });
  it("respects sensitivity: 3% is quiet on Balanced, an alert on Everything", () => {
    const d = day([move("INFY", 0.03), dh({ symbol: "Y" })]);
    expect(evaluate(d, balanced).filter((x) => x.type === "stock_move")).toHaveLength(0);
    expect(evaluate(d, effectiveSettings("everything")).filter((x) => x.type === "stock_move")).toHaveLength(1);
  });
  it("ignores big moves in tiny positions (materiality)", () => {
    const c = evaluate(day([move("SMALL", -0.08, { quantity: 1 }), dh({ symbol: "BIG", quantity: 10000 })]), balanced);
    expect(c.filter((x) => x.type === "stock_move")).toHaveLength(0);
  });
  it("learned thresholds raise the bar (never lower it)", () => {
    const tuned = effectiveSettings("everything", { stock_move: { value: 5, muted: false } });
    expect(tuned.stockMove).toBe(5);
    expect(effectiveSettings("major", { stock_move: { value: 5, muted: false } }).stockMove).toBe(6);
    expect(evaluate(day([move("A", 0.045), dh({ symbol: "B" })]), tuned).filter((x) => x.type === "stock_move")).toHaveLength(0);
  });
  it("whole-portfolio move uses the H2 line", () => {
    const c = evaluate(day([move("A", -0.03), move("B", -0.026)]), balanced);
    const p = c.find((x) => x.type === "portfolio_move")!;
    expect(p.title.en).toBe("Your portfolio fell 2.8% today");
    expect(p.body.en).toMatch(/^You're down ₹560 today/);
  });
  it("family portfolios are named in English and addressed directly in Hindi", () => {
    const c = evaluate(day([move("A", -0.03), move("B", -0.026)], { portfolio: { id: "p2", ownerLabel: "Papa" } }), balanced);
    const p = c.find((x) => x.type === "portfolio_move")!;
    expect(p.title.en).toBe("Papa's portfolio fell 2.8% today");
    expect(p.title.hi).toBe("आपका पोर्टफोलियो आज 2.8% गिरा");
  });
  it("concentration alerts on the crossing only, with a 30-day cooldown", () => {
    const hs = [dh({ symbol: "A", quantity: 30, prevWeight: 0.24 }), dh({ symbol: "B", quantity: 70, prevWeight: 0.76 })];
    const c1 = evaluate(day(hs), balanced).filter((x) => x.type === "concentration");
    expect(c1.map((x) => x.symbol)).toEqual(["A"]); // B was already above
    const c2 = evaluate(day(hs, { recent: [{ type: "concentration", symbol: "A", tradeDate: "2026-09-20" }] }), balanced).filter((x) => x.type === "concentration");
    expect(c2).toHaveLength(0);
  });
  it("upcoming results 1–4 days ahead (info), and not on Major", () => {
    const d = day([dh({ symbol: "TCS", nextResultsDate: "2026-10-05" })]);
    expect(evaluate(d, balanced).find((x) => x.type === "results_upcoming")?.severity).toBe("info");
    expect(evaluate(d, effectiveSettings("major")).find((x) => x.type === "results_upcoming")).toBeUndefined();
  });
  it("de-duplication keys are stable per portfolio, type, symbol and day", () => {
    const d = day([move("TMPV", -0.07), dh({ symbol: "X" })]);
    const k1 = evaluate(d, balanced).map((x) => x.dedupeKey);
    const k2 = evaluate(d, balanced).map((x) => x.dedupeKey);
    expect(k1).toEqual(k2);
    expect(k1).toContain("p1:stock_move:TMPV:2026-10-02");
    expect(new Set(k1).size).toBe(k1.length);
  });
  it("caps alerts per day and rolls the rest into one digest", () => {
    const many = Array.from({ length: 9 }, (_, i) => move(`S${i}`, -0.06 - i * 0.001));
    const c = evaluate(day(many), balanced);
    expect(c).toHaveLength(MAX_ALERTS_PER_DAY);
    expect(c.at(-1)!.type).toBe("digest");
    expect(capDaily([], day([]))).toEqual([]);
  });
  it("muted types produce nothing", () => {
    const s = effectiveSettings("everything", { results_upcoming: { value: null, muted: true } });
    expect(evaluate(day([dh({ symbol: "TCS", nextResultsDate: "2026-10-05" })]), s).find((x) => x.type === "results_upcoming")).toBeUndefined();
  });
});

describe("H4: results-day explainer", () => {
  const cur = { quarterEnd: "2026-06-30", revenue: 1100, earnings: 150, epsActual: 10.5, epsEstimate: 10 };
  const prev = { quarterEnd: "2026-03-31", revenue: 1000, earnings: 160, epsActual: 10, epsEstimate: 10 };
  const yearAgo = { quarterEnd: "2025-06-30", revenue: 900, earnings: 120, epsActual: 8, epsEstimate: 8 };
  it("splits what improved from what got worse", () => {
    const pts = resultsPoints(cur, prev, yearAgo);
    expect(pts.filter((p) => p.good).map((p) => p.key)).toEqual(expect.arrayContaining(["rev_yoy", "profit_yoy", "rev_qoq", "eps_vs_est"]));
    expect(pts.filter((p) => !p.good).map((p) => p.key)).toEqual(expect.arrayContaining(["profit_qoq", "margin"]));
    expect(pts.find((p) => p.key === "rev_qoq")!.en).toBe("Revenue grew 10.0% from last quarter");
    expect(pts.find((p) => p.key === "eps_vs_est")!.en).toBe("Earnings per share came in 5.0% above what analysts expected");
  });
  it("says honestly when the annual health score hasn't changed", () => {
    const t = resultsText({ name: "Infosys", quarterEnd: "2026-06-30", points: resultsPoints(cur, prev, null), healthBefore: 87, healthAfter: 87, annualHealthUpdated: false });
    expect(t.title.en).toBe("Infosys reported Apr–Jun 2026 results");
    expect(t.body.en).toContain("Health score 87/100, unchanged; it updates with full-year results.");
    expect(t.title.hi).toBe("Infosys के अप्रैल–जून 2026 के नतीजे आए");
  });
  it("shows the before → after after full-year results", () => {
    const t = resultsText({ name: "X", quarterEnd: "2026-03-31", points: [], healthBefore: 60, healthAfter: 72, annualHealthUpdated: true });
    expect(t.health.en).toBe("Health score improved from 60 to 72 (out of 100).");
  });
  it("skips growth from a loss (not a meaningful %)", () => {
    expect(resultsPoints({ ...cur, earnings: 50 }, { ...prev, earnings: -20 }, null).find((p) => p.key === "profit_qoq")).toBeUndefined();
  });
  it("names quarters the way Indian investors do", () => {
    expect(quarterName("2026-12-31").en).toBe("Oct–Dec 2026");
  });
});

describe("H5: alerts that learn", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  const r = (magnitude: number, useful: boolean, daysAgo = 5): Rated => ({ magnitude, useful, createdAt: new Date(now.getTime() - daysAgo * 86400000) });
  it("raises the stock-move threshold to the step that separates useful from not useful", () => {
    const ratings = [r(2.6, false), r(3.1, false), r(3.6, false), r(4.2, false), r(4.6, false), r(3.0, true), r(5.4, true), r(7.1, true)];
    const d = tune({ type: "stock_move", current: 2.5, ratings, lastChangeAt: null, frozenUntil: null, now })!;
    expect(d.newValue).toBe(5);
    expect(d.evidence.below).toEqual({ useful: 1, total: 6 });
    expect(d.evidence.above).toEqual({ useful: 2, total: 2 });
  });
  it("does nothing without enough evidence", () => {
    expect(tune({ type: "stock_move", current: 2.5, ratings: [r(3, false), r(3.5, false)], lastChangeAt: null, frozenUntil: null, now })).toBeNull();
  });
  it("does nothing when small alerts are mostly useful", () => {
    const ratings = [r(2.6, true), r(3.1, true), r(3.6, false), r(4.2, true)];
    expect(tune({ type: "stock_move", current: 2.5, ratings, lastChangeAt: null, frozenUntil: null, now })).toBeNull();
  });
  it("never lowers a threshold", () => {
    const ratings = [r(2.6, false), r(3.1, false), r(3.6, false), r(8, false), r(9, false)];
    expect(tune({ type: "stock_move", current: 10, ratings, lastChangeAt: null, frozenUntil: null, now })).toBeNull(); // top of the ladder
    for (const current of [2.5, 4, 5, 7]) {
      const d = tune({ type: "stock_move", current, ratings: [r(2.6, false), r(3.1, false), r(3.6, false), r(4.5, false), r(6, false), r(8, true), r(9, true)], lastChangeAt: null, frozenUntil: null, now });
      if (d) expect(d.newValue!).toBeGreaterThan(current);
    }
  });
  it("respects a 14-day cooldown and only counts ratings since the last change", () => {
    const ratings = [r(2.6, false, 20), r(3.1, false, 20), r(3.6, false, 20), r(5.5, true, 1)];
    expect(tune({ type: "stock_move", current: 2.5, ratings, lastChangeAt: new Date(now.getTime() - 3 * 86400000), frozenUntil: null, now })).toBeNull();
    expect(tune({ type: "stock_move", current: 2.5, ratings, lastChangeAt: new Date(now.getTime() - 15 * 86400000), frozenUntil: null, now })).toBeNull();
  });
  it("pauses after the user presses Undo", () => {
    const ratings = [r(2.6, false), r(3.1, false), r(3.6, false), r(6, true), r(7, true)];
    expect(tune({ type: "stock_move", current: 2.5, ratings, lastChangeAt: null, frozenUntil: new Date(now.getTime() + 86400000), now })).toBeNull();
  });
  it("mutes upcoming-results reminders that are rarely useful", () => {
    const d = tune({ type: "results_upcoming", current: 0, ratings: [r(0, false), r(0, false), r(0, false), r(0, true), r(0, false)], lastChangeAt: null, frozenUntil: null, now })!;
    expect(d).toMatchObject({ muted: true });
  });
});

describe("H6: who gets what, in which language", () => {
  const owner = { email: "aarav@x.in", emailVerified: true, isDemo: false, emailDigest: true, quietMode: false, language: "en" as const };
  const papa = [{ email: "papa@x.in", confirmed: true, unsubscribed: false }];
  const emails = (t: ReturnType<typeof route>) => t.filter((x) => x.channel === "email") as { email: string; language: string; audience: string }[];
  it("inbox always; owner email; family email in the portfolio's language for major alerts", () => {
    const t = route({ kind: "alert", severity: "important", owner, portfolio: { alertsEnabled: true, language: "hi" }, recipients: papa });
    expect(t[0]).toEqual({ channel: "inbox" });
    expect(emails(t)).toEqual([
      { channel: "email", email: "aarav@x.in", language: "en", audience: "owner" },
      { channel: "email", email: "papa@x.in", language: "hi", audience: "family" },
    ]);
  });
  it("info alerts don't go to family", () => {
    expect(emails(route({ kind: "alert", severity: "info", owner, portfolio: { alertsEnabled: true, language: "hi" }, recipients: papa })).map((e) => e.audience)).toEqual(["owner"]);
  });
  it("weekly reports always go to family, in Hindi", () => {
    expect(emails(route({ kind: "report", owner: { ...owner, emailDigest: false }, portfolio: { alertsEnabled: true, language: "hi" }, recipients: papa }))).toEqual([{ channel: "email", email: "papa@x.in", language: "hi", audience: "family" }]);
  });
  it("quiet mode limits owner email to critical alerts", () => {
    const q = { ...owner, quietMode: true };
    expect(emails(route({ kind: "alert", severity: "important", owner: q, portfolio: { alertsEnabled: true, language: "en" }, recipients: [] }))).toHaveLength(0);
    expect(emails(route({ kind: "alert", severity: "critical", owner: q, portfolio: { alertsEnabled: true, language: "en" }, recipients: [] }))).toHaveLength(1);
  });
  it("unconfirmed or unsubscribed recipients get nothing; nor does anyone when alerts are off", () => {
    const rec = [{ email: "a@x.in", confirmed: false, unsubscribed: false }, { email: "b@x.in", confirmed: true, unsubscribed: true }];
    expect(emails(route({ kind: "alert", severity: "critical", owner: { ...owner, emailDigest: false }, portfolio: { alertsEnabled: true, language: "hi" }, recipients: rec }))).toHaveLength(0);
    expect(route({ kind: "alert", severity: "critical", owner, portfolio: { alertsEnabled: false, language: "hi" }, recipients: papa })).toEqual([{ channel: "inbox" }]);
  });
  it("demo accounts and simulations never email family", () => {
    expect(emails(route({ kind: "alert", severity: "critical", simulated: true, owner, portfolio: { alertsEnabled: true, language: "hi" }, recipients: papa })).map((e) => e.audience)).toEqual(["owner"]);
    expect(emails(route({ kind: "alert", severity: "critical", owner: { ...owner, isDemo: true }, portfolio: { alertsEnabled: true, language: "hi" }, recipients: [] }))).toHaveLength(0);
  });
});
