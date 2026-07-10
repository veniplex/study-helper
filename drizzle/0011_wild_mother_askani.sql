CREATE TABLE "invite" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp with time zone,
	"max_uses" integer DEFAULT 1 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invite_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "study_session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"module_id" text,
	"kind" text DEFAULT 'pomodoro' NOT NULL,
	"duration_minutes" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_prefs" ADD COLUMN "active_program_id" text;--> statement-breakpoint
ALTER TABLE "user_prefs" ADD COLUMN "active_semester_id" text;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_session" ADD CONSTRAINT "study_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_session" ADD CONSTRAINT "study_session_module_id_module_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."module"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "study_session_userId_idx" ON "study_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "study_session_startedAt_idx" ON "study_session" USING btree ("started_at");--> statement-breakpoint
ALTER TABLE "user_prefs" ADD CONSTRAINT "user_prefs_active_program_id_degree_program_id_fk" FOREIGN KEY ("active_program_id") REFERENCES "public"."degree_program"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_prefs" ADD CONSTRAINT "user_prefs_active_semester_id_semester_id_fk" FOREIGN KEY ("active_semester_id") REFERENCES "public"."semester"("id") ON DELETE set null ON UPDATE no action;