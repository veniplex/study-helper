CREATE TABLE "assessment_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"assessment_id" text NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"result_percent" numeric(5, 2),
	"date" date,
	"passed" boolean,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_assessment" (
	"id" text PRIMARY KEY NOT NULL,
	"module_id" text NOT NULL,
	"type" text DEFAULT 'exam' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "module_assessment_module_id_unique" UNIQUE("module_id")
);
--> statement-breakpoint
CREATE TABLE "module_contact" (
	"id" text PRIMARY KEY NOT NULL,
	"module_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"role" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assignment" ADD COLUMN "kind" text DEFAULT 'graded' NOT NULL;--> statement-breakpoint
ALTER TABLE "assignment" ADD COLUMN "ai_generated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "degree_program" ADD COLUMN "grade_scale" jsonb;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "ai_generated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "module" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "module" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "module" ADD COLUMN "max_attempts" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "module" ADD COLUMN "pass_fail" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "module" ADD COLUMN "bonus_type" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "module" ADD COLUMN "bonus_value" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "module" ADD COLUMN "bonus_min_avg_percent" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "module" ADD COLUMN "bonus_min_completed_share" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "deck" ADD COLUMN "ai_generated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "thesis_project" ADD COLUMN "program_id" text;--> statement-breakpoint
ALTER TABLE "thesis_project" ADD COLUMN "attempt" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "thesis_project" ADD COLUMN "superseded_by_id" text;--> statement-breakpoint
ALTER TABLE "assessment_attempt" ADD CONSTRAINT "assessment_attempt_assessment_id_module_assessment_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."module_assessment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_assessment" ADD CONSTRAINT "module_assessment_module_id_module_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."module"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_contact" ADD CONSTRAINT "module_contact_module_id_module_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."module"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assessment_attempt_assessmentId_idx" ON "assessment_attempt" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "module_assessment_moduleId_idx" ON "module_assessment" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "module_contact_moduleId_idx" ON "module_contact" USING btree ("module_id");--> statement-breakpoint
ALTER TABLE "thesis_project" ADD CONSTRAINT "thesis_project_program_id_degree_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."degree_program"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Backfill program_id from the linked semester, then fall back to the user's first program.
UPDATE "thesis_project" SET "program_id" = (
	SELECT "s"."program_id" FROM "semester" "s" WHERE "s"."id" = "thesis_project"."semester_id"
) WHERE "semester_id" IS NOT NULL AND "program_id" IS NULL;--> statement-breakpoint
UPDATE "thesis_project" SET "program_id" = (
	SELECT "dp"."id" FROM "degree_program" "dp"
	WHERE "dp"."user_id" = "thesis_project"."user_id"
	ORDER BY "dp"."sort_order" ASC LIMIT 1
) WHERE "program_id" IS NULL;--> statement-breakpoint
-- Collapse pre-existing duplicate theses per program: keep the newest as the live one,
-- mark older rows superseded (pointing at the newest), number attempts oldest→newest.
UPDATE "thesis_project" "tp" SET
	"superseded_by_id" = CASE WHEN "r"."rn" > 1 THEN "r"."newest_id" ELSE "tp"."superseded_by_id" END,
	"attempt" = ("r"."cnt" - "r"."rn" + 1)
FROM (
	SELECT "id", "user_id", "program_id",
		row_number() OVER (PARTITION BY "user_id", "program_id" ORDER BY "created_at" DESC) AS "rn",
		first_value("id") OVER (PARTITION BY "user_id", "program_id" ORDER BY "created_at" DESC) AS "newest_id",
		count(*) OVER (PARTITION BY "user_id", "program_id") AS "cnt"
	FROM "thesis_project" WHERE "program_id" IS NOT NULL
) "r"
WHERE "tp"."id" = "r"."id" AND "r"."cnt" > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "thesis_active_per_program_uq" ON "thesis_project" USING btree ("user_id","program_id") WHERE "thesis_project"."superseded_by_id" is null and "thesis_project"."program_id" is not null;