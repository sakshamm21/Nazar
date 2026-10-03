/**
 * The test accounts and what they hold. Nothing here is market data: these are the personas'
 * choices (which assets, roughly how many rupees in each, how long ago they started buying).
 * Every price, NAV, health score and alert comes from the live data sources, the same as for any
 * other account. Quantities are worked out from the live price when an account is built.
 */
import type { ManualClass } from "@/lib/instruments/asset-classes";

/** A market holding: about `value` rupees of it, bought gradually over the last `daysAgo` days. */
export type PersonaHolding = { symbol: string; value: number; daysAgo: number };
/** An asset with no price feed, as the persona would have typed it in. */
export type PersonaManual = { assetClass: ManualClass; name: string; invested: number; value: number; valueDaysAgo: number; ratePct?: number; startDaysAgo: number; maturesInDays?: number };
export type PersonaPortfolio = { name: string; ownerLabel: string | null; language: "en" | "hi"; holdings: PersonaHolding[]; manual: PersonaManual[]; recipient?: string };
export type Persona = { id: "investor" | "saver"; portfolios: PersonaPortfolio[]; watching: string[] };

const FUND = { flexi: "MF:122639", nifty: "MF:120716", small: "MF:125497", balanced: "MF:118968", liquid: "MF:119091", large: "MF:118825" };

/** Stocks first, with funds, ETFs, a REIT, gold and deposits around them; plus a parent's portfolio in Hindi. */
const INVESTOR: Persona = {
  id: "investor",
  watching: ["TITAN.NS", "ASIANPAINT.NS", "ETERNAL.NS", "JUNIORBEES.NS", "US:NVDA"],
  portfolios: [
    {
      name: "My portfolio",
      ownerLabel: null,
      language: "en",
      holdings: [
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
        { symbol: FUND.flexi, value: 300_000, daysAgo: 320 },
        { symbol: FUND.nifty, value: 200_000, daysAgo: 300 },
        { symbol: FUND.small, value: 120_000, daysAgo: 210 },
        { symbol: "NIFTYBEES.NS", value: 100_000, daysAgo: 250 },
        { symbol: "GOLDBEES.NS", value: 80_000, daysAgo: 190 },
        { symbol: "EMBASSY.BO", value: 90_000, daysAgo: 230 },
        { symbol: "CMD:SGB", value: 200_000, daysAgo: 300 },
        { symbol: "US:AAPL", value: 150_000, daysAgo: 280 },
        { symbol: "US:MSFT", value: 120_000, daysAgo: 240 },
        { symbol: "CRYPTO:BTC", value: 90_000, daysAgo: 200 },
      ],
      manual: [
        { assetClass: "fd", name: "SBI fixed deposit", invested: 300_000, value: 300_000, valueDaysAgo: 400, ratePct: 7.25, startDaysAgo: 400, maturesInDays: 695 },
        { assetClass: "ppf", name: "PPF account", invested: 450_000, value: 612_000, valueDaysAgo: 30, ratePct: 7.1, startDaysAgo: 2200 },
        { assetClass: "epf", name: "EPF", invested: 380_000, value: 486_000, valueDaysAgo: 60, ratePct: 8.25, startDaysAgo: 1800 },
      ],
    },
    {
      name: "Papa's portfolio",
      ownerLabel: "Papa",
      language: "hi",
      recipient: "papa@example.com",
      holdings: [
        { symbol: "ITC.NS", value: 300_000, daysAgo: 330 },
        { symbol: "HDFCBANK.NS", value: 250_000, daysAgo: 320 },
        { symbol: "RELIANCE.NS", value: 200_000, daysAgo: 300 },
        { symbol: "SBIN.NS", value: 150_000, daysAgo: 250 },
        { symbol: "COALINDIA.NS", value: 150_000, daysAgo: 210 },
        { symbol: "POWERGRID.NS", value: 150_000, daysAgo: 230 },
        { symbol: FUND.balanced, value: 400_000, daysAgo: 330 },
        { symbol: "CMD:GOLD22", value: 350_000, daysAgo: 330 },
      ],
      manual: [
        { assetClass: "fd", name: "Post office deposit", invested: 500_000, value: 500_000, valueDaysAgo: 500, ratePct: 7.5, startDaysAgo: 500, maturesInDays: 1325 },
        { assetClass: "cash", name: "Savings account", invested: 180_000, value: 180_000, valueDaysAgo: 5, ratePct: 2.7, startDaysAgo: 5 },
      ],
    },
  ],
};

/** Funds first: a salaried saver with index and active funds, ETFs, gold, silver and the usual deposits. */
const SAVER: Persona = {
  id: "saver",
  watching: ["RELIANCE.NS", "SILVERBEES.NS", FUND.large],
  portfolios: [
    {
      name: "Long-term money",
      ownerLabel: null,
      language: "en",
      holdings: [
        { symbol: FUND.nifty, value: 450_000, daysAgo: 330 },
        { symbol: FUND.flexi, value: 350_000, daysAgo: 320 },
        { symbol: FUND.small, value: 150_000, daysAgo: 240 },
        { symbol: FUND.balanced, value: 200_000, daysAgo: 280 },
        { symbol: FUND.liquid, value: 150_000, daysAgo: 90 },
        { symbol: "NIFTYBEES.NS", value: 180_000, daysAgo: 300 },
        { symbol: "JUNIORBEES.NS", value: 90_000, daysAgo: 200 },
        { symbol: "GOLDBEES.NS", value: 120_000, daysAgo: 260 },
        { symbol: "MINDSPACE.BO", value: 70_000, daysAgo: 180 },
        { symbol: "CMD:GOLD24", value: 160_000, daysAgo: 310 },
        { symbol: "CMD:SILVER", value: 60_000, daysAgo: 150 },
        { symbol: "US:VOO", value: 200_000, daysAgo: 300 },
        { symbol: "CRYPTO:ETH", value: 40_000, daysAgo: 170 },
        { symbol: "TCS.NS", value: 110_000, daysAgo: 270 },
        { symbol: "HDFCBANK.NS", value: 130_000, daysAgo: 300 },
        { symbol: "ITC.NS", value: 70_000, daysAgo: 220 },
      ],
      manual: [
        { assetClass: "fd", name: "HDFC Bank FD", invested: 400_000, value: 400_000, valueDaysAgo: 300, ratePct: 7.1, startDaysAgo: 300, maturesInDays: 430 },
        { assetClass: "ppf", name: "PPF account", invested: 600_000, value: 790_000, valueDaysAgo: 30, ratePct: 7.1, startDaysAgo: 2900 },
        { assetClass: "epf", name: "EPF", invested: 520_000, value: 705_000, valueDaysAgo: 45, ratePct: 8.25, startDaysAgo: 2500 },
        { assetClass: "nps", name: "NPS Tier 1", invested: 240_000, value: 318_000, valueDaysAgo: 20, startDaysAgo: 1500 },
        { assetClass: "bond", name: "RBI floating rate bond", invested: 200_000, value: 200_000, valueDaysAgo: 200, ratePct: 8.05, startDaysAgo: 200, maturesInDays: 2355 },
        { assetClass: "cash", name: "Emergency fund (savings)", invested: 250_000, value: 250_000, valueDaysAgo: 3, ratePct: 3, startDaysAgo: 3 },
      ],
    },
  ],
};

export const PERSONAS: Record<Persona["id"], Persona> = { investor: INVESTOR, saver: SAVER };

/** Every market symbol any persona holds or watches. */
export const PERSONA_SYMBOLS = [...new Set(Object.values(PERSONAS).flatMap((p) => [...p.portfolios.flatMap((pf) => pf.holdings.map((h) => h.symbol)), ...p.watching]))];

/**
 * Public test accounts: one tap each on the sign-in page. They are ordinary accounts on live data,
 * shared by everyone who uses them, and put back to this state once a day.
 */
export const TEST_PASSWORD = "nazar123";
export type TestAccount = { email: string; name: string; persona: Persona["id"] | null; label: string; blurb: string };
export const TEST_ACCOUNTS: TestAccount[] = [
  { email: "demo@nazar.dev", name: "Aarav Mehta", persona: "investor", label: "Aarav, the investor", blurb: "14 stocks plus funds, ETFs, a REIT, gold, US stocks, Bitcoin and deposits. Also tracks his father's portfolio in Hindi." },
  { email: "riya@nazar.dev", name: "Riya Kapoor", persona: "saver", label: "Riya, the saver", blurb: "Mostly mutual funds and ETFs, with gold, silver, a US index fund, PPF, EPF, NPS and an emergency fund." },
  { email: "tester1@nazar.dev", name: "Kabir Shah", persona: "investor", label: "Kabir (a second investor)", blurb: "A separate copy of the investor account, for a second tester." },
  { email: "tester2@nazar.dev", name: "Meera Nair", persona: "saver", label: "Meera (a second saver)", blurb: "A separate copy of the saver account, for a second tester." },
  { email: "new@nazar.dev", name: "Isha Rao", persona: null, label: "Isha, brand new", blurb: "An empty account: build a portfolio from scratch." },
];
export const isTestEmail = (email: string) => TEST_ACCOUNTS.some((a) => a.email === email.trim().toLowerCase());

/** Internal: the hidden account each persona's history is built on; test accounts are copies of it. */
export const templateEmail = (persona: Persona["id"]) => `template+${persona}@nazar.internal`;

/** Bump when the alert rules change in a way that should show in the personas' replayed history. */
const HISTORY_RULES = 2; // 2: crypto alerts only on moves of 15%+

/** Changes whenever the personas, accounts or history rules change, so existing accounts are rebuilt to match. */
export const PERSONA_VERSION = (() => {
  let h = 0;
  for (const c of JSON.stringify([HISTORY_RULES, PERSONAS, TEST_ACCOUNTS.map((a) => [a.email, a.name, a.persona])])) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h.toString(36);
})();

/** Sessions of real market history the alert engine is replayed over when a persona is first built. */
export const HISTORY_DAYS = 45;
