CREATE TABLE "holding_income" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"portfolio_id" text NOT NULL,
	"holding_id" text,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"amount" double precision NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "holding_income" ADD CONSTRAINT "holding_income_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_income" ADD CONSTRAINT "holding_income_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_income" ADD CONSTRAINT "holding_income_holding_id_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."holdings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "income_portfolio_idx" ON "holding_income" USING btree ("portfolio_id","date");--> statement-breakpoint
CREATE INDEX "income_user_idx" ON "holding_income" USING btree ("user_id","date");