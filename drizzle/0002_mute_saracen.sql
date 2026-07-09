CREATE TABLE "degree_program" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"degree_type" text,
	"institution" text,
	"target_ects" integer,
	"grading_system" text DEFAULT 'german' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_resource" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"program_id" text,
	"module_id" text,
	"type" text DEFAULT 'website' NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"username" text,
	"encrypted_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grade" (
	"id" text PRIMARY KEY NOT NULL,
	"module_id" text NOT NULL,
	"value" numeric(5, 2) NOT NULL,
	"weight" numeric(5, 2) DEFAULT '1' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"graded_at" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "semester" (
	"id" text PRIMARY KEY NOT NULL,
	"program_id" text NOT NULL,
	"name" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"module_id" text,
	"type" text DEFAULT 'other' NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"location" text,
	"notes" text,
	"reminder_offsets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module" (
	"id" text PRIMARY KEY NOT NULL,
	"semester_id" text NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"ects" integer,
	"instructor" text,
	"exam_type" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "degree_program" ADD CONSTRAINT "degree_program_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_resource" ADD CONSTRAINT "external_resource_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_resource" ADD CONSTRAINT "external_resource_program_id_degree_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."degree_program"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_resource" ADD CONSTRAINT "external_resource_module_id_module_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."module"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade" ADD CONSTRAINT "grade_module_id_module_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."module"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semester" ADD CONSTRAINT "semester_program_id_degree_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."degree_program"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_module_id_module_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."module"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module" ADD CONSTRAINT "module_semester_id_semester_id_fk" FOREIGN KEY ("semester_id") REFERENCES "public"."semester"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "degree_program_userId_idx" ON "degree_program" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "external_resource_userId_idx" ON "external_resource" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "external_resource_moduleId_idx" ON "external_resource" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "grade_moduleId_idx" ON "grade" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "semester_programId_idx" ON "semester" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "event_userId_idx" ON "event" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "event_startsAt_idx" ON "event" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "module_semesterId_idx" ON "module" USING btree ("semester_id");