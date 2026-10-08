CREATE TABLE "sips" (
	"id" text PRIMARY KEY NOT NULL,
	"portfolio_id" text NOT NULL,
	"holding_id" text NOT NULL,
	"amount" double precision NOT NULL,
	"day_of_month" integer NOT NULL,
	"end_date" date,
	"active" boolean DEFAULT true NOT NULL,
	"next_due" date NOT NULL,
	"instalments" integer DEFAULT 0 NOT NULL,
	"invested" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "holding_lots" ADD COLUMN "sip_id" text;--> statement-breakpoint
ALTER TABLE "sips" ADD CONSTRAINT "sips_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sips" ADD CONSTRAINT "sips_holding_id_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."holdings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sips_holding_idx" ON "sips" USING btree ("holding_id");--> statement-breakpoint
CREATE INDEX "sips_due_idx" ON "sips" USING btree ("active","next_due");