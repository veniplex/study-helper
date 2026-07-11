CREATE TABLE "material_annotation" (
	"id" text PRIMARY KEY NOT NULL,
	"material_id" text NOT NULL,
	"user_id" text NOT NULL,
	"page" integer NOT NULL,
	"rect" jsonb NOT NULL,
	"color" text DEFAULT 'yellow' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "material_annotation" ADD CONSTRAINT "material_annotation_material_id_material_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."material"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_annotation" ADD CONSTRAINT "material_annotation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "material_annotation_material_idx" ON "material_annotation" USING btree ("material_id");