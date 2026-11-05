CREATE TABLE "corporate_actions" (
	"symbol" text NOT NULL,
	"ex_date" date NOT NULL,
	"ratio" double precision NOT NULL,
	"holdings_adjusted" integer DEFAULT 0 NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "corporate_actions_symbol_ex_date_pk" PRIMARY KEY("symbol","ex_date")
);
