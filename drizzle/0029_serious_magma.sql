CREATE TABLE "material_folder" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"module_id" text NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "material" ADD COLUMN "folder_id" text;--> statement-breakpoint
ALTER TABLE "material_folder" ADD CONSTRAINT "material_folder_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_folder" ADD CONSTRAINT "material_folder_module_id_module_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."module"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_folder" ADD CONSTRAINT "material_folder_parent_id_material_folder_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."material_folder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "material_folder_userId_idx" ON "material_folder" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "material_folder_moduleId_idx" ON "material_folder" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "material_folder_parentId_idx" ON "material_folder" USING btree ("parent_id");--> statement-breakpoint
ALTER TABLE "material" ADD CONSTRAINT "material_folder_id_material_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."material_folder"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "material_folderId_idx" ON "material" USING btree ("folder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "material_folder_sibling_uniq" ON "material_folder" USING btree ("module_id", COALESCE("parent_id", ''), "name");