CREATE TABLE "notification_prefs" (
	"user_id" text PRIMARY KEY NOT NULL,
	"email_reminders" boolean DEFAULT true NOT NULL,
	"push_reminders" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscription_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "reminder_sent" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"offset_minutes" integer NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_sent_event_offset" UNIQUE("event_id","offset_minutes")
);
--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_sent" ADD CONSTRAINT "reminder_sent_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_subscription_userId_idx" ON "push_subscription" USING btree ("user_id");