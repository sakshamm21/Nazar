import { pgTable, text, timestamp, jsonb, integer, doublePrecision, index, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  fingerprintHash: text("fingerprint_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  email: text("email"),
  name: text("name"),
  image: text("image"),
});

/** OAuth identities (Google / GitHub) linked to a user. A user may have a fingerprint AND linked accounts. */
export const accounts = pgTable(
  "accounts",
  {
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] }), index("accounts_user_idx").on(t.userId)],
);

export const chats = pgTable(
  "chats",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New research"),
    messages: jsonb("messages").notNull().default([]),
    /** Public read-only link id; null = not shared. */
    shareId: text("share_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("chats_user_idx").on(t.userId, t.updatedAt), uniqueIndex("chats_share_idx").on(t.shareId)],
);

export const watchlist = pgTable(
  "watchlist",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.symbol] })],
);

export const alerts = pgTable(
  "alerts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    direction: text("direction").$type<"above" | "below">().notNull(),
    target: doublePrecision("target").notNull(),
    currency: text("currency"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    triggeredAt: timestamp("triggered_at", { withTimezone: true }),
    triggeredPrice: doublePrecision("triggered_price"),
    /** Whether the user has been shown the triggered notification. */
    notified: integer("notified").notNull().default(0),
  },
  (t) => [index("alerts_user_idx").on(t.userId), index("alerts_active_idx").on(t.triggeredAt)],
);

/**
 * Product analytics events. Deliberately stores no raw question text — only structured
 * properties (model, tools, latency, cost, tickers, classifier topic labels).
 */
export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    chatId: text("chat_id"),
    type: text("type").notNull(),
    props: jsonb("props").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("events_type_idx").on(t.type, t.createdAt), index("events_created_idx").on(t.createdAt)],
);

/** 👍/👎 on an answer — one row per user per message (latest rating wins). */
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.messageId] }), index("feedback_created_idx").on(t.createdAt)],
);

/** One row per accepted chat request — used for per-user / per-IP rate limiting. */
export const rateEvents = pgTable(
  "rate_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    ipHash: text("ip_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("rate_user_idx").on(t.userId, t.createdAt), index("rate_ip_idx").on(t.ipHash, t.createdAt)],
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("usage_user_idx").on(t.userId)],
);

/** Idempotent bootstrap so the app works with zero manual migration steps. */
export const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  fingerprint_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS chats (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New research',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chats_user_idx ON chats(user_id, updated_at);
CREATE TABLE IF NOT EXISTS usage (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id text,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_user_idx ON usage(user_id);
CREATE INDEX IF NOT EXISTS usage_created_idx ON usage(created_at);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS image text;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS share_id text;
CREATE UNIQUE INDEX IF NOT EXISTS chats_share_idx ON chats(share_id);
CREATE TABLE IF NOT EXISTS accounts (
  provider text NOT NULL,
  provider_account_id text NOT NULL,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_account_id)
);
CREATE INDEX IF NOT EXISTS accounts_user_idx ON accounts(user_id);
CREATE TABLE IF NOT EXISTS watchlist (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, symbol)
);
CREATE TABLE IF NOT EXISTS alerts (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  direction text NOT NULL,
  target double precision NOT NULL,
  currency text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  triggered_at timestamptz,
  triggered_price double precision,
  notified integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS alerts_user_idx ON alerts(user_id);
CREATE INDEX IF NOT EXISTS alerts_active_idx ON alerts(triggered_at);
CREATE TABLE IF NOT EXISTS rate_events (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_user_idx ON rate_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS rate_ip_idx ON rate_events(ip_hash, created_at);
CREATE TABLE IF NOT EXISTS events (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  chat_id text,
  type text NOT NULL,
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_type_idx ON events(type, created_at);
CREATE INDEX IF NOT EXISTS events_created_idx ON events(created_at);
CREATE TABLE IF NOT EXISTS feedback (
  user_id text NOT NULL,
  message_id text NOT NULL,
  chat_id text NOT NULL,
  rating text NOT NULL,
  reason text,
  model text,
  mode text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);
CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback(created_at);
`;
