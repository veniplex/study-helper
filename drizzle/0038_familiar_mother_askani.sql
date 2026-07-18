-- ============================================================================
-- 0038 — Goal-based learning model (Phase 1 / Teil A "Datenmodell Lernziele")
--
-- The drizzle-generated end-state is captured in meta/0038_snapshot.json and is
-- correct as-is. drizzle-kit could only express the change as a lossy
-- drop+create; this hand-written migration reaches the SAME end-state
-- losslessly, using ALTER ... RENAME + data backfill. Steps mirror the plan's
-- "Migrationen" 1-7:
--   1. new goal tables (module_goal, goal_attempt) + new columns
--   2. one grade goal per module (from module_assessment, else default exam;
--      is_thesis modules get a `thesis` goal); title = module.exam_type
--   3. assessment_attempt -> goal_attempt
--   4. bonus/practice `assignments` goals + assignment.goal_id backfill
--   5. (is_thesis handled in step 2)
--   6. thesis_project -> writing_project, thesis_milestone -> writing_milestone
--      (+ kind/variant/task_description/goal_id); link thesis goal
--   7. drop module_assessment / assessment_attempt + dropped module columns
--
-- Not runnable here (no DB in this environment); verified via typecheck, tests
-- and db:generate. Uses gen_random_uuid() (Postgres 13+ core).
-- ============================================================================

-- 1. New goal tables --------------------------------------------------------------
CREATE TABLE "module_goal" (
	"id" text PRIMARY KEY NOT NULL,
	"module_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text,
	"grading_role" text DEFAULT 'grade' NOT NULL,
	"weight" numeric(5, 2) DEFAULT '1' NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"pass_fail" boolean DEFAULT false NOT NULL,
	"due_date" date,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"goal_id" text NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"result_percent" numeric(5, 2),
	"date" date,
	"passed" boolean,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "module_goal" ADD CONSTRAINT "module_goal_module_id_module_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."module"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_attempt" ADD CONSTRAINT "goal_attempt_goal_id_module_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."module_goal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "module_goal_moduleId_idx" ON "module_goal" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "goal_attempt_goalId_idx" ON "goal_attempt" USING btree ("goal_id");--> statement-breakpoint

-- New columns on existing tables --------------------------------------------------
ALTER TABLE "assignment" ADD COLUMN "goal_id" text;--> statement-breakpoint
ALTER TABLE "module" ADD COLUMN "tool_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint

-- 2. One grade goal per module ----------------------------------------------------
-- type: is_thesis -> 'thesis'; else module_assessment.type (oral_presentation ->
-- presentation), default 'exam'. title = module.exam_type; max_attempts/pass_fail
-- carried over from the module; due_date from the module's next exam event.
INSERT INTO "module_goal"
	("id", "module_id", "type", "title", "grading_role", "weight", "max_attempts", "pass_fail", "due_date", "config", "sort_order")
SELECT
	gen_random_uuid()::text,
	m."id",
	CASE
		WHEN m."is_thesis" THEN 'thesis'
		WHEN ma."type" = 'oral_presentation' THEN 'presentation'
		ELSE COALESCE(ma."type", 'exam')
	END,
	m."exam_type",
	'grade',
	'1',
	m."max_attempts",
	m."pass_fail",
	(SELECT MIN(e."starts_at")::date FROM "event" e WHERE e."module_id" = m."id" AND e."type" = 'exam'),
	'{}'::jsonb,
	0
FROM "module" m
LEFT JOIN "module_assessment" ma ON ma."module_id" = m."id";--> statement-breakpoint

-- 3. assessment_attempt -> goal_attempt (goal_id via assessment -> module -> goal)
INSERT INTO "goal_attempt"
	("id", "goal_id", "attempt", "result_percent", "date", "passed", "note", "created_at", "updated_at")
SELECT
	aa."id",
	g."id",
	aa."attempt",
	aa."result_percent",
	aa."date",
	aa."passed",
	aa."note",
	aa."created_at",
	aa."updated_at"
FROM "assessment_attempt" aa
JOIN "module_assessment" ma ON ma."id" = aa."assessment_id"
JOIN "module_goal" g ON g."module_id" = ma."module_id" AND g."grading_role" = 'grade';--> statement-breakpoint

-- 4a. Bonus modules -> `assignments` bonus goal carrying config.bonus -------------
INSERT INTO "module_goal"
	("id", "module_id", "type", "grading_role", "weight", "max_attempts", "pass_fail", "config", "sort_order")
SELECT
	gen_random_uuid()::text,
	m."id",
	'assignments',
	'bonus',
	'1',
	3,
	false,
	jsonb_build_object('bonus', jsonb_strip_nulls(jsonb_build_object(
		'type', m."bonus_type",
		'value', m."bonus_value",
		'minAvgPercent', m."bonus_min_avg_percent",
		'minCompletedShare', m."bonus_min_completed_share"
	))),
	1
FROM "module" m
WHERE m."bonus_type" <> 'none';--> statement-breakpoint

-- 4b. Modules with assignments but no bonus -> `assignments` practice goal --------
INSERT INTO "module_goal"
	("id", "module_id", "type", "grading_role", "weight", "max_attempts", "pass_fail", "config", "sort_order")
SELECT
	gen_random_uuid()::text,
	m."id",
	'assignments',
	'practice',
	'1',
	3,
	false,
	'{}'::jsonb,
	1
FROM "module" m
WHERE m."bonus_type" = 'none'
	AND EXISTS (SELECT 1 FROM "assignment" a WHERE a."module_id" = m."id");--> statement-breakpoint

-- 4c. Point every assignment at its module's assignments goal ---------------------
UPDATE "assignment" a
SET "goal_id" = g."id"
FROM "module_goal" g
WHERE g."module_id" = a."module_id"
	AND g."type" = 'assignments'
	AND g."grading_role" IN ('bonus', 'practice');--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_goal_id_module_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."module_goal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- 6. thesis_project -> writing_project, thesis_milestone -> writing_milestone ------
ALTER TABLE "thesis_project" RENAME TO "writing_project";--> statement-breakpoint
ALTER TABLE "thesis_milestone" RENAME TO "writing_milestone";--> statement-breakpoint
ALTER TABLE "writing_milestone" RENAME COLUMN "thesis_id" TO "project_id";--> statement-breakpoint
-- keep constraint/index names in sync with the generated snapshot
ALTER TABLE "writing_project" RENAME CONSTRAINT "thesis_project_pkey" TO "writing_project_pkey";--> statement-breakpoint
ALTER TABLE "writing_project" RENAME CONSTRAINT "thesis_project_user_id_user_id_fk" TO "writing_project_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "writing_project" RENAME CONSTRAINT "thesis_project_program_id_degree_program_id_fk" TO "writing_project_program_id_degree_program_id_fk";--> statement-breakpoint
ALTER TABLE "writing_project" RENAME CONSTRAINT "thesis_project_semester_id_semester_id_fk" TO "writing_project_semester_id_semester_id_fk";--> statement-breakpoint
ALTER TABLE "writing_project" RENAME CONSTRAINT "thesis_project_superseded_by_id_thesis_project_id_fk" TO "writing_project_superseded_by_id_writing_project_id_fk";--> statement-breakpoint
ALTER INDEX "thesis_project_userId_idx" RENAME TO "writing_project_userId_idx";--> statement-breakpoint
ALTER TABLE "writing_milestone" RENAME CONSTRAINT "thesis_milestone_pkey" TO "writing_milestone_pkey";--> statement-breakpoint
ALTER TABLE "writing_milestone" RENAME CONSTRAINT "thesis_milestone_thesis_id_thesis_project_id_fk" TO "writing_milestone_project_id_writing_project_id_fk";--> statement-breakpoint
ALTER INDEX "thesis_milestone_thesisId_idx" RENAME TO "writing_milestone_projectId_idx";--> statement-breakpoint
-- new writing_project columns (existing rows are scientific theses)
ALTER TABLE "writing_project" ADD COLUMN "kind" text DEFAULT 'thesis' NOT NULL;--> statement-breakpoint
ALTER TABLE "writing_project" ADD COLUMN "goal_id" text;--> statement-breakpoint
ALTER TABLE "writing_project" ADD COLUMN "variant" text DEFAULT 'scientific' NOT NULL;--> statement-breakpoint
ALTER TABLE "writing_project" ADD COLUMN "task_description" text;--> statement-breakpoint
ALTER TABLE "writing_project" ADD CONSTRAINT "writing_project_goal_id_module_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."module_goal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "writing_active_per_goal_uq" ON "writing_project" USING btree ("goal_id") WHERE "writing_project"."kind" = 'term_paper' and "writing_project"."superseded_by_id" is null and "writing_project"."goal_id" is not null;--> statement-breakpoint
-- link each thesis project to its module's `thesis` goal (via program -> module)
UPDATE "writing_project" wp
SET "goal_id" = g."id"
FROM "module_goal" g
JOIN "module" m ON m."id" = g."module_id"
JOIN "semester" s ON s."id" = m."semester_id"
WHERE g."type" = 'thesis'
	AND wp."kind" = 'thesis'
	AND wp."program_id" IS NOT NULL
	AND s."program_id" = wp."program_id";--> statement-breakpoint

-- 7. Drop the superseded tables and columns ---------------------------------------
DROP TABLE "assessment_attempt" CASCADE;--> statement-breakpoint
DROP TABLE "module_assessment" CASCADE;--> statement-breakpoint
ALTER TABLE "module" DROP COLUMN "exam_type";--> statement-breakpoint
ALTER TABLE "module" DROP COLUMN "is_thesis";--> statement-breakpoint
ALTER TABLE "module" DROP COLUMN "max_attempts";--> statement-breakpoint
ALTER TABLE "module" DROP COLUMN "pass_fail";--> statement-breakpoint
ALTER TABLE "module" DROP COLUMN "bonus_type";--> statement-breakpoint
ALTER TABLE "module" DROP COLUMN "bonus_value";--> statement-breakpoint
ALTER TABLE "module" DROP COLUMN "bonus_min_avg_percent";--> statement-breakpoint
ALTER TABLE "module" DROP COLUMN "bonus_min_completed_share";
