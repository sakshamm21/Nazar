DROP TABLE "alert_events" CASCADE;--> statement-breakpoint
DROP TABLE "alert_feedback" CASCADE;--> statement-breakpoint
DROP TABLE "alert_settings" CASCADE;--> statement-breakpoint
DROP TABLE "alert_thresholds" CASCADE;--> statement-breakpoint
DROP TABLE "deliveries" CASCADE;--> statement-breakpoint
DROP TABLE "price_targets" CASCADE;--> statement-breakpoint
DROP TABLE "recipients" CASCADE;--> statement-breakpoint
DROP TABLE "reports" CASCADE;--> statement-breakpoint
DROP TABLE "threshold_changes" CASCADE;--> statement-breakpoint
ALTER TABLE "portfolios" DROP COLUMN "owner_label";--> statement-breakpoint
ALTER TABLE "portfolios" DROP COLUMN "language";--> statement-breakpoint
ALTER TABLE "portfolios" DROP COLUMN "alerts_enabled";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "tour_completed_at";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "ui_language";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "sim_state";--> statement-breakpoint
DELETE FROM "symbol_snapshots" WHERE "source" <> 'live';--> statement-breakpoint
DELETE FROM "price_daily" WHERE "source" <> 'live';--> statement-breakpoint
DELETE FROM "results_events" WHERE "source" <> 'live';--> statement-breakpoint
DELETE FROM "pipeline_runs" WHERE "kind" = 'weekly';--> statement-breakpoint
DELETE FROM "users" WHERE "is_demo" = true;--> statement-breakpoint
DELETE FROM "events" WHERE "type" IN ('alert_created', 'alert_rated', 'threshold_tuned', 'threshold_undone', 'simulate', 'settings_changed', 'recipient_added', 'price_target_created', 'demo_started', 'tour_complete', 'tour_skip', 'tour_restart', 'tour_step', 'landing_cta', 'portfolio_switch', 'theme_change');
