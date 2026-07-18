-- ============================================================================
-- 0040 — Plan cutover (Phase 7 / Teil B "Lernplan neu", removal of old system)
--
-- The drizzle-generated end-state is captured in meta/0040_snapshot.json and is
-- correct as-is (study_plan / study_plan_item / semester_plan_item dropped; the
-- new module_plan / plan_session / plan_task tables were already added in 0039).
-- drizzle-kit could only express this as a bare DROP TABLE ... CASCADE; this
-- hand-written migration first MAPS the old rows onto the new coordinated-plan
-- tables (lossy-but-reasonable) and only then drops the old tables, mirroring
-- the plan's "Migrationen" for 0039/0040:
--   * semester_plan_item -> one plan_session + one plan_task per item
--       (kind study/review -> source {kind:'ai'}, assignment -> {kind:'assignment'})
--   * study_plan_item     -> plan_task (unscheduled; module from its study_plan)
--   * backfill a module_plan row for every module that received data
--   * DROP semester_plan_item, study_plan_item, study_plan
--
-- Items/plans without a module are dropped (the new session/task tables require
-- a module) — an acceptable loss for a dev-stage cutover. Not runnable here (no
-- DB in this environment); verified via db:generate, typecheck and tests. Uses
-- gen_random_uuid() (Postgres 13+ core).
-- ============================================================================

-- 1. semester_plan_item -> plan_session (+ one plan_task each) ---------------------
WITH mapped AS (
	SELECT
		gen_random_uuid() AS session_id,
		spi.plan_id,
		spi.module_id,
		spi.assignment_id,
		spi.kind,
		spi.title,
		spi.date,
		spi.start_time,
		spi.duration_minutes,
		spi.done,
		spi.sort_order
	FROM "semester_plan_item" spi
	WHERE spi.module_id IS NOT NULL
), inserted_sessions AS (
	INSERT INTO "plan_session"
		("id", "semester_plan_id", "module_id", "date", "start_time", "duration_minutes", "pinned", "done", "created_at", "updated_at")
	SELECT
		session_id, plan_id, module_id, date, COALESCE(start_time, '09:00'), duration_minutes, false, done, now(), now()
	FROM mapped
)
INSERT INTO "plan_task"
	("id", "module_id", "goal_id", "session_id", "title", "description", "estimated_minutes", "done", "due_date", "source", "sort_order", "ai_generated", "created_at", "updated_at")
SELECT
	gen_random_uuid(),
	module_id,
	NULL,
	session_id,
	title,
	NULL,
	duration_minutes,
	done,
	NULL,
	jsonb_build_object('kind', CASE WHEN kind = 'assignment' THEN 'assignment' ELSE 'ai' END)
		|| CASE WHEN assignment_id IS NOT NULL THEN jsonb_build_object('refId', assignment_id) ELSE '{}'::jsonb END,
	sort_order,
	CASE WHEN kind = 'assignment' THEN false ELSE true END,
	now(),
	now()
FROM mapped;
--> statement-breakpoint

-- 2. study_plan_item -> plan_task (unscheduled, module from the study_plan) --------
INSERT INTO "plan_task"
	("id", "module_id", "goal_id", "session_id", "title", "description", "estimated_minutes", "done", "due_date", "source", "sort_order", "ai_generated", "created_at", "updated_at")
SELECT
	gen_random_uuid(),
	sp.module_id,
	NULL,
	NULL,
	spi.title,
	spi.description,
	COALESCE(spi.duration_minutes, 60),
	spi.done,
	spi.scheduled_date,
	'{"kind":"ai"}'::jsonb,
	spi.sort_order,
	sp.ai_generated,
	now(),
	now()
FROM "study_plan_item" spi
JOIN "study_plan" sp ON sp.id = spi.plan_id
WHERE sp.module_id IS NOT NULL;
--> statement-breakpoint

-- 3. Ensure every module that received data has a module_plan row ------------------
INSERT INTO "module_plan" ("id", "module_id", "active", "weight", "phase", "created_at", "updated_at")
SELECT gen_random_uuid(), m.module_id, true, '1', 1, now(), now()
FROM (
	SELECT DISTINCT module_id FROM "plan_session"
	UNION
	SELECT DISTINCT module_id FROM "plan_task" WHERE module_id IS NOT NULL
) m
ON CONFLICT ("module_id") DO NOTHING;
--> statement-breakpoint

-- 4. Drop the old plan system -----------------------------------------------------
DROP TABLE "semester_plan_item" CASCADE;--> statement-breakpoint
DROP TABLE "study_plan_item" CASCADE;--> statement-breakpoint
DROP TABLE "study_plan" CASCADE;
