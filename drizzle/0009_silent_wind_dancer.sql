CREATE TABLE "thesis_milestone" (
	"id" text PRIMARY KEY NOT NULL,
	"thesis_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_date" date,
	"done" boolean DEFAULT false NOT NULL,
	"sort_order" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thesis_project" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"thesis_type" text,
	"phase" text DEFAULT 'topic' NOT NULL,
	"research_question" text,
	"outline" text,
	"notes" text,
	"due_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "thesis_milestone" ADD CONSTRAINT "thesis_milestone_thesis_id_thesis_project_id_fk" FOREIGN KEY ("thesis_id") REFERENCES "public"."thesis_project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thesis_project" ADD CONSTRAINT "thesis_project_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "thesis_milestone_thesisId_idx" ON "thesis_milestone" USING btree ("thesis_id");--> statement-breakpoint
CREATE INDEX "thesis_project_userId_idx" ON "thesis_project" USING btree ("user_id");