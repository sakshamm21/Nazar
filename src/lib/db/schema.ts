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
  /** Per-visitor demo account ("Try the demo"): isolated, deleted after `demoExpiresAt`. */
  isDemo: boolean("is_demo").notNull().default(false),
  demoExpiresAt: ts("demo_expires_at"),
  /** Public test account listed on the sign-in page (docs/TEST_ACCOUNTS.md). */
  isTestAccount: boolean("is_test_account").notNull().default(false),
  isAdmin: boolean("is_admin").notNull().default(false),
  tourCompletedAt: ts("tour_completed_at"),
  uiLanguage: text("ui_language").$type<"en" | "hi">().notNull().default("en"),
  /** Active "Simulate a bad day" scenario for demo accounts. */
  simState: jsonb("sim_state").$type<{ date: string; scenario: string; label: string } | null>(),
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
    /** Whose money this is, e.g. "Papa". Null = the account owner's own portfolio. */
    ownerLabel: text("owner_label"),
    language: text("language").$type<"en" | "hi">().notNull().default("en"),
    alertsEnabled: boolean("alerts_enabled").notNull().default(true),
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
    symbol: text("symbol").notNull(),
    quantity: doublePrecision("quantity").notNull(),
    avgPrice: doublePrecision("avg_price").notNull(),
    buyDate: date("buy_date", { mode: "string" }),
    isin: text("isin"),
    rawName: text("raw_name"),
    source: text("source").$type<"manual" | "zerodha" | "groww" | "upstox" | "generic" | "screenshot">().notNull().default("manual"),
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

/** "Tell me when X crosses ₹Y" price levels, evaluated by the nightly checkup. */
export const priceTargets = pgTable(
  "price_targets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    direction: text("direction").$type<"above" | "below">().notNull(),
    target: doublePrecision("target").notNull(),
    note: text("note"),
    createdAt: created(),
    triggeredAt: ts("triggered_at"),
    triggeredPrice: doublePrecision("triggered_price"),
  },
  (t) => [index("price_targets_user_idx").on(t.userId)],
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
/* source: "live" (nightly pipeline) | "demo" (fixture) | "sim:<userId>" */
/* ------------------------------------------------------------------ */

export const instruments = pgTable("instruments", {
  symbol: text("symbol").primaryKey(),
  isin: text("isin"),
  name: text("name").notNull(),
  shortName: text("short_name"),
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
};

/* ------------------------------------------------------------------ */
/* Alerts                                                              */
/* ------------------------------------------------------------------ */

export type AlertType = "stock_move" | "portfolio_move" | "results" | "health_change" | "concentration" | "results_upcoming" | "price_target" | "learned" | "digest";
export type Severity = "critical" | "important" | "info";
export type Sensitivity = "major" | "balanced" | "everything";

export const alertSettings = pgTable("alert_settings", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  sensitivity: text("sensitivity").$type<Sensitivity>().notNull().default("balanced"),
  quietMode: boolean("quiet_mode").notNull().default(false),
  emailDigest: boolean("email_digest").notNull().default(true),
  updatedAt: ts("updated_at").defaultNow().notNull(),
});

export const alertThresholds = pgTable(
  "alert_thresholds",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    alertType: text("alert_type").$type<AlertType>().notNull(),
    value: doublePrecision("value"),
    muted: boolean("muted").notNull().default(false),
    source: text("source").$type<"tuned" | "manual">().notNull(),
    frozenUntil: ts("frozen_until"),
    updatedAt: ts("updated_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.alertType] })],
);

/** H5: every automatic threshold change, its evidence and whether the user undid it. */
export const thresholdChanges = pgTable(
  "threshold_changes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    alertType: text("alert_type").$type<AlertType>().notNull(),
    oldValue: doublePrecision("old_value"),
    newValue: doublePrecision("new_value"),
    muted: boolean("muted").notNull().default(false),
    evidence: jsonb("evidence").$type<TuningEvidence>().notNull(),
    messageEn: text("message_en").notNull(),
    messageHi: text("message_hi").notNull(),
    createdAt: created(),
    undoneAt: ts("undone_at"),
  },
  (t) => [index("threshold_changes_user_idx").on(t.userId, t.createdAt)],
);

export type TuningEvidence = { below: { useful: number; total: number }; above: { useful: number; total: number }; window: number };

export type AlertData = {
  symbol?: string;
  name?: string;
  changePct?: number;
  magnitude?: number;
  impactInr?: number;
  weight?: number;
  portfolioValue?: number;
  reason?: { kind: "market" | "sector" | "results" | "company"; marketPct?: number | null; sectorPct?: number | null; sectorName?: string | null };
  headlines?: { title: string; source: string; link: string; published: string }[];
  resultsEventId?: string;
  healthBefore?: number | null;
  healthAfter?: number | null;
  thresholdChangeId?: string;
  items?: { title: string; symbol?: string }[];
  date?: string;
  [k: string]: unknown;
};

export const alertEvents = pgTable(
  "alert_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    portfolioId: text("portfolio_id").references(() => portfolios.id, { onDelete: "cascade" }),
    type: text("type").$type<AlertType>().notNull(),
    symbol: text("symbol"),
    severity: text("severity").$type<Severity>().notNull(),
    tradeDate: date("trade_date", { mode: "string" }).notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    titleEn: text("title_en").notNull(),
    bodyEn: text("body_en").notNull(),
    titleHi: text("title_hi").notNull(),
    bodyHi: text("body_hi").notNull(),
    data: jsonb("data").$type<AlertData>().notNull().default({}),
    isSimulated: boolean("is_simulated").notNull().default(false),
    createdAt: created(),
    readAt: ts("read_at"),
  },
  (t) => [uniqueIndex("alert_events_dedupe_idx").on(t.userId, t.dedupeKey), index("alert_events_user_idx").on(t.userId, t.createdAt)],
);

export const alertFeedback = pgTable(
  "alert_feedback",
  {
    alertId: text("alert_id").notNull().references(() => alertEvents.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    rating: text("rating").$type<"up" | "down">().notNull(),
    source: text("source").$type<"app" | "email">().notNull().default("app"),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.alertId, t.userId] }), index("alert_feedback_user_idx").on(t.userId, t.createdAt)],
);

/** Family members who receive a portfolio's report and major alerts by email (H6). */
export const recipients = pgTable(
  "recipients",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    portfolioId: text("portfolio_id").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    confirmedAt: ts("confirmed_at"),
    unsubscribedAt: ts("unsubscribed_at"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("recipients_pf_email_idx").on(t.portfolioId, t.email)],
);

export const deliveries = pgTable(
  "deliveries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    kind: text("kind").$type<"digest" | "report" | "simulation" | "auth" | "confirm">().notNull(),
    itemKey: text("item_key").notNull(),
    email: text("email").notNull(),
    status: text("status").$type<"sent" | "failed" | "skipped_no_config" | "skipped_cap">().notNull(),
    error: text("error"),
    alertIds: jsonb("alert_ids").$type<string[]>().notNull().default([]),
    createdAt: created(),
  },
  (t) => [uniqueIndex("deliveries_item_email_idx").on(t.itemKey, t.email), index("deliveries_created_idx").on(t.createdAt)],
);

export const reports = pgTable(
  "reports",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    portfolioId: text("portfolio_id").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    weekEnd: date("week_end", { mode: "string" }).notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("reports_pf_week_idx").on(t.portfolioId, t.weekStart)],
);

export const pipelineRuns = pgTable(
  "pipeline_runs",
  {
    id: text("id").primaryKey(),
    kind: text("kind").$type<"nightly" | "weekly" | "maintenance">().notNull(),
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
