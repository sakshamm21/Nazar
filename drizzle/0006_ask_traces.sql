CREATE TABLE "ask_traces" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"message_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"model" text,
	"auto" boolean DEFAULT true NOT NULL,
	"mode" text NOT NULL,
	"lang" text NOT NULL,
	"turn" integer NOT NULL,
	"outcome" text NOT NULL,
	"guard" jsonb NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"cached_input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"reasoning_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"ttft_ms" integer,
	"latency_ms" integer NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "prompt_version" text;--> statement-breakpoint
ALTER TABLE "ask_traces" ADD CONSTRAINT "ask_traces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ask_traces_created_idx" ON "ask_traces" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ask_traces_chat_idx" ON "ask_traces" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "ask_traces_version_idx" ON "ask_traces" USING btree ("prompt_version","created_at");