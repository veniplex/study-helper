CREATE TABLE "semester_plan" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"semester_id" text NOT NULL,
	"availability" jsonb NOT NULL,
	"generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "semester_plan_semester_id_unique" UNIQUE("semester_id")
);
--> statement-breakpoint
CREATE TABLE "semester_plan_item" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"module_id" text,
	"assignment_id" text,
	"kind" text DEFAULT 'study' NOT NULL,
	"title" text NOT NULL,
	"date" date NOT NULL,
	"start_time" text,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "semester_plan" ADD CONSTRAINT "semester_plan_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semester_plan" ADD CONSTRAINT "semester_plan_semester_id_semester_id_fk" FOREIGN KEY ("semester_id") REFERENCES "public"."semester"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semester_plan_item" ADD CONSTRAINT "semester_plan_item_plan_id_semester_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."semester_plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semester_plan_item" ADD CONSTRAINT "semester_plan_item_module_id_module_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."module"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semester_plan_item" ADD CONSTRAINT "semester_plan_item_assignment_id_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "semester_plan_user_idx" ON "semester_plan" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "semester_plan_item_plan_idx" ON "semester_plan_item" USING btree ("plan_id","date");