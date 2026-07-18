-- Switch full-text search to the 'german' config (stemming + stop words).
-- A generated column cannot be altered in place; drop + re-add rewrites the
-- table and recomputes the vectors. Dropping the column also drops the GIN
-- index, so it is recreated afterwards.
ALTER TABLE "material_chunk" drop column "content_tsv";--> statement-breakpoint
ALTER TABLE "material_chunk" ADD COLUMN "content_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('german', "material_chunk"."content")) STORED;--> statement-breakpoint
CREATE INDEX "material_chunk_tsv_idx" ON "material_chunk" USING gin ("content_tsv");
