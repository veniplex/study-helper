-- Custom SQL migration file, put your code below! --
-- Backfill the new material_folder tree from the legacy material.folder text
-- column. Existing folders are single-level, so every backfilled folder is a
-- root (parent_id = NULL). Idempotent: skips folders that already exist.
CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint

INSERT INTO "material_folder" ("id", "user_id", "module_id", "parent_id", "name", "created_at", "updated_at")
SELECT gen_random_uuid()::text, s.user_id, s.module_id, NULL, s.folder, now(), now()
FROM (
  SELECT DISTINCT "user_id", "module_id", "folder"
  FROM "material"
  WHERE "folder" IS NOT NULL AND "folder" <> ''
) s
WHERE NOT EXISTS (
  SELECT 1 FROM "material_folder" f
  WHERE f."module_id" = s.module_id AND f."parent_id" IS NULL AND f."name" = s.folder
);--> statement-breakpoint

UPDATE "material" m
SET "folder_id" = f."id"
FROM "material_folder" f
WHERE m."folder" IS NOT NULL
  AND m."folder" <> ''
  AND m."folder_id" IS NULL
  AND f."parent_id" IS NULL
  AND f."module_id" = m."module_id"
  AND f."name" = m."folder";
