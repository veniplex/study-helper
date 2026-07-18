-- ============================================================================
-- 0039 — Plan foundation (Phase 6 / Teil B "Lernplan neu")
--
-- ADDITIVE ONLY. Creates the new coordinated-plan tables next to the old plan
-- system (study_plan / study_plan_item / semester_plan_item stay untouched and
-- fully functional; they are rewired/removed in Phase 7):
--   * module_plan   — per-module planning prefs (weight/phase/weekday/…)
--   * plan_session  — scheduled study blocks produced by the deterministic scheduler
--   * plan_task     — goal-derived units of work, assigned to sessions
--   * semester_plan.config — scheduler tuning (sessions/day, session length)
--
-- No DROPs, no data migration. The plan_task ↔ plan_session cycle is expressed
-- as a single FK (plan_task.session_id → plan_session, ON DELETE set null).
-- Not runnable here (no DB in this environment); verified via db:generate,
-- typecheck and the vitest scheduler/tasks suites.
-- ============================================================================
CREATE TABLE "module_plan" (
	"id" text PRIMARY KEY NOT NULL,
	"module_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"weight" numeric(5, 2) DEFAULT '1' NOT NULL,
	"weekly_hours_target" numeric(5, 2),
	"phase" integer DEFAULT 1 NOT NULL,
	"preferred_weekdays" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "module_plan_module_id_unique" UNIQUE("module_id")
);
--> statement-breakpoint
CREATE TABLE "plan_session" (
	"id" text PRIMARY KEY NOT NULL,
	"semester_plan_id" text NOT NULL,
	"module_id" text NOT NULL,
	"date" date NOT NULL,
	"start_time" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_task" (
	"id" text PRIMARY KEY NOT NULL,
	"module_id" text NOT NULL,
	"goal_id" text,
	"session_id" text,
	"title" text NOT NULL,
	"description" text,
	"estimated_minutes" integer DEFAULT 60 NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"due_date" date,
	"source" jsonb DEFAULT '{"kind":"manual"}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "semester_plan" ADD COLUMN "config" jsonb;--> statement-breakpoint
ALTER TABLE "module_plan" ADD CONSTRAINT "module_plan_module_id_module_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."module"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_session" ADD CONSTRAINT "plan_session_semester_plan_id_semester_plan_id_fk" FOREIGN KEY ("semester_plan_id") REFERENCES "public"."semester_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_session" ADD CONSTRAINT "plan_session_module_id_module_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."module"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_task" ADD CONSTRAINT "plan_task_module_id_module_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."module"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_task" ADD CONSTRAINT "plan_task_goal_id_module_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."module_goal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_task" ADD CONSTRAINT "plan_task_session_id_plan_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."plan_session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "module_plan_module_idx" ON "module_plan" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "plan_session_plan_date_idx" ON "plan_session" USING btree ("semester_plan_id","date");--> statement-breakpoint
CREATE INDEX "plan_task_module_idx" ON "plan_task" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "plan_task_session_idx" ON "plan_task" USING btree ("session_id");