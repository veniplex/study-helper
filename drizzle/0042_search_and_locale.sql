-- ============================================================================
-- 0042 — Bounded search & reminder locale (audit Phase 5)
--
-- Purely ADDITIVE (CREATE/ALTER only — no DROP):
--   * material.text_content_tsv  — STORED generated tsvector over text_content
--                                  ('german' config, coalesced for the nullable
--                                  column) + GIN index. Replaces the ILIKE
--                                  seq-scan in the command-palette search route
--                                  with websearch_to_tsquery('german', …) @@.
--                                  Mirrors material_chunk.content_tsv (0033).
--   * user_prefs.locale          — preferred locale; reminder job localizes
--                                  push/email through it (R4 seam).
--   * event.skip_dates jsonb     — ISO dates of individually-deleted recurring
--                                  occurrences; expandOccurrences skips them
--                                  (E18 single-occurrence delete, no series drop).
--
-- Not runnable here (no DB in this environment); verified via db:generate (no
-- drift), typecheck and tests.
-- ============================================================================
ALTER TABLE "event" ADD COLUMN "skip_dates" jsonb;--> statement-breakpoint
ALTER TABLE "user_prefs" ADD COLUMN "locale" text;--> statement-breakpoint
ALTER TABLE "material" ADD COLUMN "text_content_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('german', coalesce("material"."text_content", ''))) STORED;--> statement-breakpoint
CREATE INDEX "material_text_content_tsv_idx" ON "material" USING gin ("text_content_tsv");