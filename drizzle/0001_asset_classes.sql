ALTER TABLE "holdings" ADD COLUMN "asset_class" text DEFAULT 'stock' NOT NULL;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "details" jsonb;--> statement-breakpoint
ALTER TABLE "instruments" ADD COLUMN "asset_class" text DEFAULT 'stock' NOT NULL;--> statement-breakpoint
ALTER TABLE "instruments" ADD COLUMN "category" text;