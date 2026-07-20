DROP INDEX "ai_usage_userId_idx";--> statement-breakpoint
CREATE INDEX "ai_usage_user_created_idx" ON "ai_usage_log" USING btree ("user_id","created_at");--> statement-breakpoint
--> Drop duplicate BYOK keys before the unique index below can be created.
--> Without a constraint, a double-submit could store several rows for the same
--> (user, provider); keep the newest, which is the one the user last saved.
DELETE FROM "user_ai_key" a
  USING "user_ai_key" b
  WHERE a."user_id" = b."user_id"
    AND a."provider_id" = b."provider_id"
    AND (a."created_at" < b."created_at" OR (a."created_at" = b."created_at" AND a."id" < b."id"));--> statement-breakpoint
CREATE UNIQUE INDEX "user_ai_key_user_provider_uq" ON "user_ai_key" USING btree ("user_id","provider_id");--> statement-breakpoint
CREATE INDEX "assignment_goal_idx" ON "assignment" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "assignment_due_open_idx" ON "assignment" USING btree ("due_date") WHERE "assignment"."status" <> 'graded' AND "assignment"."due_date" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "generation_coverage_topic_idx" ON "generation_coverage" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "event_moduleId_idx" ON "event" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "material_chunk_parent_idx" ON "material_chunk" USING btree ("parent_chunk_id");--> statement-breakpoint
CREATE INDEX "answer_log_questionId_idx" ON "answer_log" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "plan_task_goal_idx" ON "plan_task" USING btree ("goal_id");--> statement-breakpoint
--> Dead since 0042: material text search moved to the generated tsvector column
--> (material_text_content_tsv_idx). This trigram index still had to be
--> maintained on every material write, over a column holding up to 200k
--> characters, while nothing ever read it. ILIKE on material.name is served by
--> material_name_trgm_idx, which stays.
DROP INDEX IF EXISTS "material_text_trgm_idx";
