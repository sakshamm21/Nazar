CREATE TABLE "holding_lots" (
	"id" text PRIMARY KEY NOT NULL,
	"holding_id" text NOT NULL,
	"portfolio_id" text NOT NULL,
	"quantity" double precision NOT NULL,
	"price" double precision NOT NULL,
	"date" date NOT NULL,
	"remaining" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "holding_lots" ADD CONSTRAINT "holding_lots_holding_id_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."holdings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_lots" ADD CONSTRAINT "holding_lots_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lots_holding_idx" ON "holding_lots" USING btree ("holding_id");--> statement-breakpoint
CREATE INDEX "lots_portfolio_date_idx" ON "holding_lots" USING btree ("portfolio_id","date");--> statement-breakpoint
-- Existing holdings predate the lots ledger. Give each one a single lot matching its summary row,
-- dated at its buy date, so money-weighted return and holding-period maths work for everyone who
-- already has a portfolio rather than starting empty. "on conflict do nothing" keeps this safe to
-- re-run if the migration is ever replayed.
INSERT INTO "holding_lots" ("id", "holding_id", "portfolio_id", "quantity", "price", "date", "remaining")
SELECT md5(h."id" || 'seed')::text, h."id", h."portfolio_id", h."quantity", h."avg_price", coalesce(h."buy_date", h."created_at"::date), h."quantity"
FROM "holdings" h
WHERE h."quantity" > 0
ON CONFLICT DO NOTHING;
