CREATE TABLE "user_prefs" (
	"user_id" text PRIMARY KEY NOT NULL,
	"ics_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_prefs_ics_token_unique" UNIQUE("ics_token")
);
--> statement-breakpoint
ALTER TABLE "user_prefs" ADD CONSTRAINT "user_prefs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;