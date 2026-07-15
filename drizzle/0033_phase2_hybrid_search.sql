ALTER TABLE "material_chunk" ADD COLUMN "contextual_header" text;--> statement-breakpoint
ALTER TABLE "material_chunk" ADD COLUMN "content_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', "material_chunk"."content")) STORED;--> statement-breakpoint
CREATE INDEX "material_chunk_tsv_idx" ON "material_chunk" USING gin ("content_tsv");