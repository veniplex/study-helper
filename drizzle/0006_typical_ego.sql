CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "material_chunk" (
	"id" text PRIMARY KEY NOT NULL,
	"material_id" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector,
	"embedding_model" text
);
--> statement-breakpoint
ALTER TABLE "material_chunk" ADD CONSTRAINT "material_chunk_material_id_material_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."material"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "material_chunk_materialId_idx" ON "material_chunk" USING btree ("material_id");