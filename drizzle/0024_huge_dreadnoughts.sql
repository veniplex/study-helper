ALTER TABLE "reminder_sent" DROP CONSTRAINT "reminder_sent_event_offset";--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "recurrence" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "recurrence_until" date;--> statement-breakpoint
ALTER TABLE "user_prefs" ADD COLUMN "weekly_goal_minutes" integer;--> statement-breakpoint
ALTER TABLE "deck" ADD COLUMN "kind" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "reminder_sent" ADD COLUMN "occurrence_date" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "reminder_sent" ADD CONSTRAINT "reminder_sent_event_offset_occurrence" UNIQUE("event_id","offset_minutes","occurrence_date");--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "material_name_trgm_idx" ON "material" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "material_text_trgm_idx" ON "material" USING gin ("text_content" gin_trgm_ops);
