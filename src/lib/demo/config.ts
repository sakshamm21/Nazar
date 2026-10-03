/**
 * The demo's cast: two portfolios built from real NSE stocks. "Mine" deliberately holds five
 * banks/financials (the correlated cluster for H3) and an IT pair; "Papa's" is a dividend-heavy
 * portfolio in Hindi (H6). Target values are in rupees; quantities come from the fixture prices.
 */
import { NIFTY, SECTOR_INDICES } from "@/lib/instruments/sectors";

export const DEMO_MINE: { symbol: string; value: number; daysAgo: number }[] = [
  { symbol: "HDFCBANK.NS", value: 240_000, daysAgo: 310 },
  { symbol: "ICICIBANK.NS", value: 160_000, daysAgo: 280 },
  { symbol: "KOTAKBANK.NS", value: 90_000, daysAgo: 200 },
  { symbol: "AXISBANK.NS", value: 90_000, daysAgo: 160 },
  { symbol: "SBIN.NS", value: 120_000, daysAgo: 240 },
  { symbol: "TCS.NS", value: 150_000, daysAgo: 300 },
  { symbol: "INFY.NS", value: 200_000, daysAgo: 260 },
  { symbol: "TMPV.NS", value: 160_000, daysAgo: 120 },
  { symbol: "MARUTI.NS", value: 120_000, daysAgo: 180 },
  { symbol: "ITC.NS", value: 90_000, daysAgo: 220 },
  { symbol: "HINDUNILVR.NS", value: 80_000, daysAgo: 140 },
  { symbol: "RELIANCE.NS", value: 180_000, daysAgo: 290 },
  { symbol: "BHARTIARTL.NS", value: 110_000, daysAgo: 100 },
  { symbol: "SUNPHARMA.NS", value: 70_000, daysAgo: 80 },
];

export const DEMO_PAPA: { symbol: string; value: number; daysAgo: number }[] = [
  { symbol: "ITC.NS", value: 300_000, daysAgo: 330 },
  { symbol: "HDFCBANK.NS", value: 250_000, daysAgo: 320 },
  { symbol: "RELIANCE.NS", value: 200_000, daysAgo: 300 },
  { symbol: "SBIN.NS", value: 150_000, daysAgo: 250 },
  { symbol: "COALINDIA.NS", value: 150_000, daysAgo: 210 },
  { symbol: "POWERGRID.NS", value: 150_000, daysAgo: 230 },
];

export const DEMO_WATCHING = ["TITAN.NS", "ASIANPAINT.NS", "ETERNAL.NS"];

export const DEMO_SYMBOLS = [...new Set([...DEMO_MINE, ...DEMO_PAPA].map((h) => h.symbol).concat(DEMO_WATCHING))];
export const DEMO_INDICES = [NIFTY, ...SECTOR_INDICES];

/** The holding whose latest real quarterly results are presented as "reported yesterday" (H4). */
export const DEMO_RESULTS_SYMBOL = "INFY.NS";

/** Public test accounts (docs/TEST_ACCOUNTS.md), one click each on the sign-in page. */
export const TEST_PASSWORD = "nazar123";
export const TEST_ACCOUNTS = [
  { email: "demo@nazar.dev", name: "Aarav Mehta", kind: "full" as const, label: "Investor (full demo)" },
  { email: "new@nazar.dev", name: "Isha Rao", kind: "empty" as const, label: "New user" },
  { email: "tester1@nazar.dev", name: "Tester One", kind: "full" as const, label: "Tester 1" },
  { email: "tester2@nazar.dev", name: "Tester Two", kind: "empty" as const, label: "Tester 2" },
];

/** Internal: the demo account every "Try the demo" visitor is cloned from. */
export const TEMPLATE_EMAIL = "template@demo.nazar.internal";

/** Days of alert history replayed for the demo account. */
export const HISTORY_DAYS = 60;
