-- ============================================================================
-- 0041 — Plan consolidation window & plan-correctness (audit Phase 2)
--
-- Purely ADDITIVE (CREATE/ALTER only — no DROP): the existing plan tables keep
-- their columns and legacy rows stay valid via defaults. Backs the pre-exam
-- consolidation window, week overrides, plan staleness, persisted scheduler
-- warnings and the idempotent exam-event sync:
--   * plan_session.kind          — study | review | cards (majority category),
--                                  DEFAULT 'study' → existing sessions read as
--                                  study.
--   * semester_plan.week_overrides  — {"2026-W31": 4} per-ISO-week hour caps.
--   * semester_plan.stale_at        — null = fresh; set on plan-relevant edits.
--   * semester_plan.last_warnings   — last recompute's scheduler warnings.
--   * event.goal_id (FK module_goal, ON DELETE CASCADE) + index — lets the exam
--                                  goal own an all-day calendar event keyed by
--                                  goal, so the scheduler blocks the exam day.
-- GoalConfig.reviewDays is a jsonb-only field (no DDL).
--
-- Not runnable here (no DB in this environment); verified via db:generate (no
-- drift), typecheck and tests.
-- ============================================================================
ALTER TABLE "event" ADD COLUMN "goal_id" text;--> statement-breakpoint
ALTER TABLE "semester_plan" ADD COLUMN "week_overrides" jsonb;--> statement-breakpoint
ALTER TABLE "semester_plan" ADD COLUMN "stale_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "semester_plan" ADD COLUMN "last_warnings" jsonb;--> statement-breakpoint
ALTER TABLE "plan_session" ADD COLUMN "kind" text DEFAULT 'study' NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_goal_id_module_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."module_goal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_goalId_idx" ON "event" USING btree ("goal_id");
