ALTER TABLE "event" ADD COLUMN "recurrence_weekdays" jsonb;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "recurrence_interval" integer;