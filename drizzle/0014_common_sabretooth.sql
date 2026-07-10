CREATE TABLE "assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"module_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_date" date,
	"status" text DEFAULT 'open' NOT NULL,
	"points_achieved" numeric(7, 2),
	"points_max" numeric(7, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignment_material" (
	"assignment_id" text NOT NULL,
	"material_id" text NOT NULL,
	CONSTRAINT "assignment_material_assignment_id_material_id_pk" PRIMARY KEY("assignment_id","material_id")
);
--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_module_id_module_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."module"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_material" ADD CONSTRAINT "assignment_material_assignment_id_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_material" ADD CONSTRAINT "assignment_material_material_id_material_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."material"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignment_module_idx" ON "assignment" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "assignment_user_idx" ON "assignment" USING btree ("user_id");