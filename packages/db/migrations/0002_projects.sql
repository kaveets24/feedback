CREATE TYPE "public"."project_status" AS ENUM('idea', 'demo', 'mixing', 'done');--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "project_status" DEFAULT 'idea' NOT NULL,
	"visibility" "visibility" DEFAULT 'private' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_id_owner_id_unique" UNIQUE("id","owner_id")
);
--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "position" integer;--> statement-breakpoint
ALTER TABLE "tracks" ADD COLUMN "visibility_override" "visibility";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_owner_id_id_idx" ON "projects" USING btree ("owner_id","id");--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_project_owner_fk" FOREIGN KEY ("project_id","owner_id") REFERENCES "public"."projects"("id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tracks_project_id_position_idx" ON "tracks" USING btree ("project_id","position");--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_position_iff_project" CHECK (("tracks"."project_id" is null) = ("tracks"."position" is null));--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_position_non_negative" CHECK ("tracks"."position" >= 0);