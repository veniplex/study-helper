CREATE TABLE "generation_coverage" (
	"id" text PRIMARY KEY NOT NULL,
	"target_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"job_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"produced_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_job" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"module_id" text NOT NULL,
	"kind" text NOT NULL,
	"target_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"outline_version" integer,
	"topics_total" integer DEFAULT 0 NOT NULL,
	"topics_done" integer DEFAULT 0 NOT NULL,
	"produced_count" integer DEFAULT 0 NOT NULL,
	"params" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_outline" (
	"module_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"fingerprint" text,
	"status" text DEFAULT 'idle' NOT NULL,
	"topic_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outline_topic" (
	"id" text PRIMARY KEY NOT NULL,
	"module_id" text NOT NULL,
	"user_id" text NOT NULL,
	"version" integer NOT NULL,
	"parent_id" text,
	"title" text NOT NULL,
	"title_key" text NOT NULL,
	"summary" text,
	"source_material_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"weight" integer DEFAULT 5 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_coverage" ADD CONSTRAINT "generation_coverage_topic_id_outline_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."outline_topic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_coverage" ADD CONSTRAINT "generation_coverage_job_id_generation_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_job"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_module_id_module_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."module"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_outline" ADD CONSTRAINT "module_outline_module_id_module_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."module"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_outline" ADD CONSTRAINT "module_outline_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outline_topic" ADD CONSTRAINT "outline_topic_module_id_module_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."module"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outline_topic" ADD CONSTRAINT "outline_topic_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outline_topic" ADD CONSTRAINT "outline_topic_parent_id_outline_topic_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."outline_topic"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "generation_coverage_target_topic_idx" ON "generation_coverage" USING btree ("target_id","topic_id");--> statement-breakpoint
CREATE INDEX "generation_coverage_job_idx" ON "generation_coverage" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "generation_job_user_idx" ON "generation_job" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "generation_job_target_idx" ON "generation_job" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "outline_topic_module_idx" ON "outline_topic" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "outline_topic_module_version_idx" ON "outline_topic" USING btree ("module_id","version");