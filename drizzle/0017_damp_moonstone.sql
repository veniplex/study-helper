CREATE TABLE "notification_sent" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_sent_user_key" UNIQUE("user_id","key")
);
--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD COLUMN "channels" jsonb;--> statement-breakpoint
ALTER TABLE "notification_sent" ADD CONSTRAINT "notification_sent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;