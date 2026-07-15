ALTER TABLE "material" ADD COLUMN "text_storage_path" text;--> statement-breakpoint
ALTER TABLE "material" ADD COLUMN "char_count" integer;--> statement-breakpoint
ALTER TABLE "material" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "material" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "material" ADD COLUMN "extraction_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "material" ADD COLUMN "extraction_error" text;--> statement-breakpoint
ALTER TABLE "material" ADD COLUMN "chunks_total" integer;--> statement-breakpoint
ALTER TABLE "material" ADD COLUMN "chunks_embedded" integer;--> statement-breakpoint
ALTER TABLE "material_chunk" ADD COLUMN "level" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "material_chunk" ADD COLUMN "parent_chunk_id" text;--> statement-breakpoint
ALTER TABLE "material_chunk" ADD CONSTRAINT "material_chunk_parent_chunk_id_material_chunk_id_fk" FOREIGN KEY ("parent_chunk_id") REFERENCES "public"."material_chunk"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "material_contentHash_idx" ON "material" USING btree ("user_id","content_hash");--> statement-breakpoint
CREATE INDEX "material_chunk_material_level_idx" ON "material_chunk" USING btree ("material_id","level");--> statement-breakpoint
-- Backfill: materials that already have extracted text are ready, not pending.
UPDATE "material" SET "extraction_status" = 'ready' WHERE "text_content" IS NOT NULL;