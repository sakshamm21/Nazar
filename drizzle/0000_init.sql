CREATE TABLE "alert_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"portfolio_id" text,
	"type" text NOT NULL,
	"symbol" text,
	"severity" text NOT NULL,
	"trade_date" date NOT NULL,
	"dedupe_key" text NOT NULL,
	"title_en" text NOT NULL,
	"body_en" text NOT NULL,
	"title_hi" text NOT NULL,
	"body_hi" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_simulated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "alert_feedback" (
	"alert_id" text NOT NULL,
	"user_id" text NOT NULL,
	"rating" text NOT NULL,
	"source" text DEFAULT 'app' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_feedback_alert_id_user_id_pk" PRIMARY KEY("alert_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "alert_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"sensitivity" text DEFAULT 'balanced' NOT NULL,
	"quiet_mode" boolean DEFAULT false NOT NULL,
	"email_digest" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_thresholds" (
	"user_id" text NOT NULL,
	"alert_type" text NOT NULL,
	"value" double precision,
	"muted" boolean DEFAULT false NOT NULL,
	"source" text NOT NULL,
	"frozen_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_thresholds_user_id_alert_type_pk" PRIMARY KEY("user_id","alert_type")
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT 'New question' NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"share_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"item_key" text NOT NULL,
	"email" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"alert_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"chat_id" text,
	"type" text NOT NULL,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"user_id" text NOT NULL,
	"message_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"rating" text NOT NULL,
	"reason" text,
	"model" text,
	"mode" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_user_id_message_id_pk" PRIMARY KEY("user_id","message_id")
);
--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" text PRIMARY KEY NOT NULL,
	"portfolio_id" text NOT NULL,
	"symbol" text NOT NULL,
	"quantity" double precision NOT NULL,
	"avg_price" double precision NOT NULL,
	"buy_date" date,
	"isin" text,
	"raw_name" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"portfolio_id" text NOT NULL,
	"broker" text NOT NULL,
	"filename" text,
	"row_count" integer NOT NULL,
	"matched" integer NOT NULL,
	"unmatched" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"symbol" text PRIMARY KEY NOT NULL,
	"isin" text,
	"name" text NOT NULL,
	"short_name" text,
	"sector" text,
	"industry" text,
	"is_financial" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"run_date" date NOT NULL,
	"stage" text NOT NULL,
	"cursor" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"locked_until" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "portfolios" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"owner_label" text,
	"language" text DEFAULT 'en' NOT NULL,
	"alerts_enabled" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_daily" (
	"symbol" text NOT NULL,
	"date" date NOT NULL,
	"source" text NOT NULL,
	"close" double precision NOT NULL,
	"volume" double precision,
	CONSTRAINT "price_daily_symbol_date_source_pk" PRIMARY KEY("symbol","date","source")
);
--> statement-breakpoint
CREATE TABLE "price_targets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"symbol" text NOT NULL,
	"direction" text NOT NULL,
	"target" double precision NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"triggered_at" timestamp with time zone,
	"triggered_price" double precision
);
--> statement-breakpoint
CREATE TABLE "rate_events" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipients" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"portfolio_id" text NOT NULL,
	"email" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"portfolio_id" text NOT NULL,
	"week_start" date NOT NULL,
	"week_end" date NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "results_events" (
	"id" text PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"source" text NOT NULL,
	"quarter_end" date NOT NULL,
	"detected_on" date NOT NULL,
	"data" jsonb NOT NULL,
	"health_before" double precision,
	"health_after" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "symbol_snapshots" (
	"symbol" text NOT NULL,
	"trade_date" date NOT NULL,
	"source" text NOT NULL,
	"price" double precision,
	"prev_close" double precision,
	"change_pct" double precision,
	"market_cap" double precision,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"beta" double precision,
	"vol_1y" double precision,
	"health" jsonb,
	"next_results_date" date,
	"last_quarter_end" date,
	"quarterly" jsonb,
	"as_of" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	CONSTRAINT "symbol_snapshots_symbol_trade_date_source_pk" PRIMARY KEY("symbol","trade_date","source")
);
--> statement-breakpoint
CREATE TABLE "threshold_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"alert_type" text NOT NULL,
	"old_value" double precision,
	"new_value" double precision,
	"muted" boolean DEFAULT false NOT NULL,
	"evidence" jsonb NOT NULL,
	"message_en" text NOT NULL,
	"message_hi" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"undone_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "usage" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"chat_id" text,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text,
	"email_verified_at" timestamp with time zone,
	"verify_code_hash" text,
	"verify_expires_at" timestamp with time zone,
	"verify_attempts" integer DEFAULT 0 NOT NULL,
	"verify_sent_at" timestamp with time zone,
	"reset_token_hash" text,
	"reset_expires_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"demo_expires_at" timestamp with time zone,
	"is_test_account" boolean DEFAULT false NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"tour_completed_at" timestamp with time zone,
	"ui_language" text DEFAULT 'en' NOT NULL,
	"sim_state" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "watching" (
	"user_id" text NOT NULL,
	"symbol" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watching_user_id_symbol_pk" PRIMARY KEY("user_id","symbol")
);
--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_feedback" ADD CONSTRAINT "alert_feedback_alert_id_alert_events_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alert_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_feedback" ADD CONSTRAINT "alert_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_settings" ADD CONSTRAINT "alert_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_thresholds" ADD CONSTRAINT "alert_thresholds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_targets" ADD CONSTRAINT "price_targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threshold_changes" ADD CONSTRAINT "threshold_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage" ADD CONSTRAINT "usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watching" ADD CONSTRAINT "watching_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_events_dedupe_idx" ON "alert_events" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "alert_events_user_idx" ON "alert_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "alert_feedback_user_idx" ON "alert_feedback" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "chats_user_idx" ON "chats" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chats_share_idx" ON "chats" USING btree ("share_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deliveries_item_email_idx" ON "deliveries" USING btree ("item_key","email");--> statement-breakpoint
CREATE INDEX "deliveries_created_idx" ON "deliveries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "events_type_idx" ON "events" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "events_created_idx" ON "events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "feedback_created_idx" ON "feedback" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "holdings_pf_symbol_idx" ON "holdings" USING btree ("portfolio_id","symbol");--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_runs_kind_date_idx" ON "pipeline_runs" USING btree ("kind","run_date");--> statement-breakpoint
CREATE INDEX "portfolios_user_idx" ON "portfolios" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "price_daily_source_idx" ON "price_daily" USING btree ("source","symbol","date");--> statement-breakpoint
CREATE INDEX "price_targets_user_idx" ON "price_targets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rate_key_idx" ON "rate_events" USING btree ("key","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recipients_pf_email_idx" ON "recipients" USING btree ("portfolio_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_pf_week_idx" ON "reports" USING btree ("portfolio_id","week_start");--> statement-breakpoint
CREATE UNIQUE INDEX "results_symbol_quarter_idx" ON "results_events" USING btree ("symbol","quarter_end","source");--> statement-breakpoint
CREATE INDEX "snapshots_source_date_idx" ON "symbol_snapshots" USING btree ("source","trade_date");--> statement-breakpoint
CREATE INDEX "threshold_changes_user_idx" ON "threshold_changes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_user_idx" ON "usage" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "usage_created_idx" ON "usage" USING btree ("created_at");