import type { AssetClass, ManualDetails } from "@/lib/instruments/asset-classes";
import { boolean, date, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const created = () => ts("created_at").defaultNow().notNull();

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  emailVerifiedAt: ts("email_verified_at"),
  verifyCodeHash: text("verify_code_hash"),
  verifyExpiresAt: ts("verify_expires_at"),
  verifyAttempts: integer("verify_attempts").notNull().default(0),
  verifySentAt: ts("verify_sent_at"),
  resetTokenHash: text("reset_token_hash"),
  resetExpiresAt: ts("reset_expires_at"),
  /** Legacy: an anonymous 24-hour demo visitor. Nothing creates these any more. */
  isDemo: boolean("is_demo").notNull().default(false),
  demoExpiresAt: ts("demo_expires_at"),
  /** A shared test account from the sign-in page (or a persona template): never emails, capped Ask use. */
  isTestAccount: boolean("is_test_account").notNull().default(false),
  isAdmin: boolean("is_admin").notNull().default(false),
  /** Bumped whenever the password changes or is reset, so every session already issued stops working. */
  sessionVersion: integer("session_version").notNull().default(0),
  createdAt: created(),
  lastSeenAt: ts("last_seen_at").defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/* Portfolios                                                          */
/* ------------------------------------------------------------------ */

export const portfolios = pgTable(
  "portfolios",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: created(),
  },
  (t) => [index("portfolios_user_idx").on(t.userId)],
);

export const holdings = pgTable(
  "holdings",
  {
    id: text("id").primaryKey(),
    portfolioId: text("portfolio_id").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
    /** "INFY.NS", "MF:<AMFI scheme code>", "CMD:GOLD24", or "MANUAL:<id>" for assets without a price feed. */
    symbol: text("symbol").notNull(),
    assetClass: text("asset_class").$type<AssetClass>().notNull().default("stock"),
    /** Units held. Manual assets hold 1 unit whose average price is the amount invested. */
    quantity: doublePrecision("quantity").notNull(),
    avgPrice: doublePrecision("avg_price").notNull(),
    buyDate: date("buy_date", { mode: "string" }),
    isin: text("isin"),
    rawName: text("raw_name"),
    /** Manual assets only: the value the user entered and how it grows. */
    details: jsonb("details").$type<ManualDetails | null>(),
    source: text("source").$type<"manual" | "zerodha" | "groww" | "upstox" | "generic" | "cas" | "screenshot">().notNull().default("manual"),
    createdAt: created(),
    updatedAt: ts("updated_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("holdings_pf_symbol_idx").on(t.portfolioId, t.symbol)],
);

/** Stocks the user watches without owning them. */
export const watching = pgTable(
  "watching",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    addedAt: ts("added_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.symbol] })],
);

export const importBatches = pgTable("import_batches", {
  id: text("id").primaryKey(),
  portfolioId: text("portfolio_id").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
  broker: text("broker").notNull(),
  filename: text("filename"),
  rowCount: integer("row_count").notNull(),
  matched: integer("matched").notNull(),
  unmatched: jsonb("unmatched").$type<{ name: string; reason: string }[]>().notNull().default([]),
  createdAt: created(),
});

/* ------------------------------------------------------------------ */
/* Market data — shared across users, keyed by symbol + source         */
/* source: "live" (nightly checkup, refresh on open)                    */
/* ------------------------------------------------------------------ */

export const instruments = pgTable("instruments", {
  symbol: text("symbol").primaryKey(),
  isin: text("isin"),
  name: text("name").notNull(),
  shortName: text("short_name"),
  assetClass: text("asset_class").$type<AssetClass>().notNull().default("stock"),
  /** Fund category or ETF underlying, e.g. "Flexi Cap Fund". */
  category: text("category"),
  sector: text("sector"),
  industry: text("industry"),
  isFinancial: boolean("is_financial").notNull().default(false),
  updatedAt: ts("updated_at").defaultNow().notNull(),
});

export const priceDaily = pgTable(
  "price_daily",
  {
    symbol: text("symbol").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    source: text("source").notNull(),
    close: doublePrecision("close").notNull(),
    volume: doublePrecision("volume"),
  },
  (t) => [primaryKey({ columns: [t.symbol, t.date, t.source] }), index("price_daily_source_idx").on(t.source, t.symbol, t.date)],
);

export type HealthInfo = {
  score: number | null;
  kind: "piotroski" | "lender" | "none";
  fScore?: number | null;
  scoredTests?: number;
  altmanZ?: number | null;
  altmanZone?: "Safe" | "Grey" | "Distress" | null;
  lenderPassed?: number;
  lenderTests?: { name: string; pass: boolean | null; detail: string }[];
  tests?: { name: string; group: string; pass: boolean | null; detail: string }[];
  periods?: (string | null)[];
};

export const symbolSnapshots = pgTable(
  "symbol_snapshots",
  {
    symbol: text("symbol").notNull(),
    tradeDate: date("trade_date", { mode: "string" }).notNull(),
    source: text("source").notNull(),
    price: doublePrecision("price"),
    prevClose: doublePrecision("prev_close"),
    changePct: doublePrecision("change_pct"),
    marketCap: doublePrecision("market_cap"),
    metrics: jsonb("metrics").$type<Record<string, number | null>>().notNull().default({}),
    beta: doublePrecision("beta"),
    vol1y: doublePrecision("vol_1y"),
    health: jsonb("health").$type<HealthInfo | null>(),
    nextResultsDate: date("next_results_date", { mode: "string" }),
    lastQuarterEnd: date("last_quarter_end", { mode: "string" }),
    quarterly: jsonb("quarterly").$type<QuarterRow[] | null>(),
    asOf: ts("as_of"),
    fetchedAt: ts("fetched_at").defaultNow().notNull(),
    status: text("status").$type<"ok" | "stale" | "failed">().notNull().default("ok"),
  },
  (t) => [primaryKey({ columns: [t.symbol, t.tradeDate, t.source] }), index("snapshots_source_date_idx").on(t.source, t.tradeDate)],
);

export type QuarterRow = { quarterEnd: string; revenue: number | null; earnings: number | null; epsActual: number | null; epsEstimate: number | null; operatingMargin?: number | null };

export const resultsEvents = pgTable(
  "results_events",
  {
    id: text("id").primaryKey(),
    symbol: text("symbol").notNull(),
    source: text("source").notNull(),
    quarterEnd: date("quarter_end", { mode: "string" }).notNull(),
    detectedOn: date("detected_on", { mode: "string" }).notNull(),
    data: jsonb("data").$type<ResultsData>().notNull(),
    healthBefore: doublePrecision("health_before"),
    healthAfter: doublePrecision("health_after"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("results_symbol_quarter_idx").on(t.symbol, t.quarterEnd, t.source)],
);

export type ResultsData = {
  current: QuarterRow;
  previous: QuarterRow | null;
  yearAgo: QuarterRow | null;
  annualHealthUpdated: boolean;
  /** The latest quarter as it stood when Nazar first saw the stock: explained on the stock page, but never announced as news. */
  backfilled?: boolean;
};

/* ------------------------------------------------------------------ */
/* Jobs                                                                */
/* ------------------------------------------------------------------ */

export const pipelineRuns = pgTable(
  "pipeline_runs",
  {
    id: text("id").primaryKey(),
    kind: text("kind").$type<"nightly" | "maintenance">().notNull(),
    runDate: date("run_date", { mode: "string" }).notNull(),
    stage: text("stage").notNull(),
    cursor: integer("cursor").notNull().default(0),
    status: text("status").$type<"running" | "done" | "failed" | "skipped">().notNull(),
    stats: jsonb("stats").$type<Record<string, unknown>>().notNull().default({}),
    errors: jsonb("errors").$type<string[]>().notNull().default([]),
    lockedUntil: ts("locked_until"),
    startedAt: ts("started_at").defaultNow().notNull(),
    finishedAt: ts("finished_at"),
  },
  (t) => [uniqueIndex("pipeline_runs_kind_date_idx").on(t.kind, t.runDate)],
);

/* ------------------------------------------------------------------ */
/* Ask (chat)                                                          */
/* ------------------------------------------------------------------ */

export const chats = pgTable(
  "chats",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New question"),
    messages: jsonb("messages").notNull().default([]),
    shareId: text("share_id"),
    createdAt: created(),
    updatedAt: ts("updated_at").defaultNow().notNull(),
  },
  (t) => [index("chats_user_idx").on(t.userId, t.updatedAt), uniqueIndex("chats_share_idx").on(t.shareId)],
);

/** Product analytics events. Stores no raw question text — only structured properties. */
export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    chatId: text("chat_id"),
    type: text("type").notNull(),
    props: jsonb("props").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: created(),
  },
  (t) => [index("events_type_idx").on(t.type, t.createdAt), index("events_created_idx").on(t.createdAt)],
);

/** 👍/👎 on an Ask answer — one row per user per message (latest rating wins). */
export const feedback = pgTable(
  "feedback",
  {
    userId: text("user_id").notNull(),
    messageId: text("message_id").notNull(),
    chatId: text("chat_id").notNull(),
    rating: text("rating").$type<"up" | "down">().notNull(),
    reason: text("reason"),
    model: text("model"),
    mode: text("mode"),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.messageId] }), index("feedback_created_idx").on(t.createdAt)],
);

/** One row per rate-limited action, keyed e.g. "chat:u:<id>", "auth:ip:<hash>". */
export const rateEvents = pgTable(
  "rate_events",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    createdAt: created(),
  },
  (t) => [index("rate_key_idx").on(t.key, t.createdAt)],
);

export const usage = pgTable(
  "usage",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    chatId: text("chat_id"),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    createdAt: created(),
  },
  (t) => [index("usage_user_idx").on(t.userId), index("usage_created_idx").on(t.createdAt)],
);
