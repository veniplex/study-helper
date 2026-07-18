-- Null out dangling supersede pointers before adding the FK (the column had no
-- integrity constraint until now).
UPDATE "thesis_project" t
SET "superseded_by_id" = NULL
WHERE "superseded_by_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "thesis_project" s WHERE s."id" = t."superseded_by_id");--> statement-breakpoint
ALTER TABLE "thesis_project" ADD CONSTRAINT "thesis_project_superseded_by_id_thesis_project_id_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."thesis_project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Already created by 0029_serious_magma.sql on existing databases; the schema
-- file now declares it too, so guard with IF NOT EXISTS for fresh installs.
CREATE UNIQUE INDEX IF NOT EXISTS "material_folder_sibling_uniq" ON "material_folder" USING btree ("module_id",COALESCE("parent_id", ''),"name");--> statement-breakpoint
-- One-off cleanup: generation rows whose polymorphic target (deck/quiz) is gone.
DELETE FROM "generation_coverage" gc
WHERE NOT EXISTS (SELECT 1 FROM "deck" d WHERE d."id" = gc."target_id")
  AND NOT EXISTS (SELECT 1 FROM "quiz" q WHERE q."id" = gc."target_id");--> statement-breakpoint
DELETE FROM "generation_job" gj
WHERE NOT EXISTS (SELECT 1 FROM "deck" d WHERE d."id" = gj."target_id")
  AND NOT EXISTS (SELECT 1 FROM "quiz" q WHERE q."id" = gj."target_id");
