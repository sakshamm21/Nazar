CREATE TABLE "holding_sales" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"portfolio_id" text NOT NULL,
	"holding_id" text,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"asset_class" text NOT NULL,
	"category" text,
	"units" double precision NOT NULL,
	"price" double precision NOT NULL,
	"date" date NOT NULL,
	"cost" double precision NOT NULL,
	"parts" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "holding_sales" ADD CONSTRAINT "holding_sales_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_sales" ADD CONSTRAINT "holding_sales_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_sales" ADD CONSTRAINT "holding_sales_holding_id_holdings_id_fk" FOREIGN KEY ("holding_id") REFERENCES "public"."holdings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sales_portfolio_idx" ON "holding_sales" USING btree ("portfolio_id","date");--> statement-breakpoint
CREATE INDEX "sales_user_idx" ON "holding_sales" USING btree ("user_id","date");