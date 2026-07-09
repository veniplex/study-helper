CREATE TABLE "material" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"module_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"storage_path" text,
	"mime_type" text,
	"size_bytes" bigint,
	"folder" text,
	"text_content" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "material" ADD CONSTRAINT "material_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material" ADD CONSTRAINT "material_module_id_module_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."module"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "material_userId_idx" ON "material" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "material_moduleId_idx" ON "material" USING btree ("module_id");