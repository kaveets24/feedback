CREATE TYPE "public"."cover_status" AS ENUM('uploading', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "project_covers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"status" "cover_status" DEFAULT 'uploading' NOT NULL,
	"failure_reason" text,
	"original_key" text NOT NULL,
	"original_content_type" text NOT NULL,
	"original_size_bytes" bigint NOT NULL,
	"cover_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_covers_ready_has_cover" CHECK ("project_covers"."status" <> 'ready' or "project_covers"."cover_key" is not null),
	CONSTRAINT "project_covers_failed_has_reason" CHECK ("project_covers"."status" <> 'failed' or "project_covers"."failure_reason" is not null)
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "current_cover_id" uuid;--> statement-breakpoint
ALTER TABLE "project_covers" ADD CONSTRAINT "project_covers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_covers_project_id_id_idx" ON "project_covers" USING btree ("project_id","id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_current_cover_id_project_covers_id_fk" FOREIGN KEY ("current_cover_id") REFERENCES "public"."project_covers"("id") ON DELETE set null ON UPDATE no action;