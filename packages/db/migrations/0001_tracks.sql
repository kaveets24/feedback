CREATE TYPE "public"."track_version_status" AS ENUM('uploading', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('private', 'shared', 'unlisted', 'public');--> statement-breakpoint
CREATE TABLE "track_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"track_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"change_notes" text,
	"feedback_prompt" text,
	"status" "track_version_status" DEFAULT 'uploading' NOT NULL,
	"failure_reason" text,
	"original_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"original_content_type" text NOT NULL,
	"original_size_bytes" bigint NOT NULL,
	"stream_key" text,
	"duration_ms" integer,
	"waveform_peaks" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "track_versions_version_number_positive" CHECK ("track_versions"."version_number" >= 1),
	CONSTRAINT "track_versions_ready_has_outputs" CHECK ("track_versions"."status" <> 'ready' or ("track_versions"."stream_key" is not null and "track_versions"."duration_ms" is not null and "track_versions"."waveform_peaks" is not null)),
	CONSTRAINT "track_versions_failed_has_reason" CHECK ("track_versions"."status" <> 'failed' or "track_versions"."failure_reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"visibility" "visibility" DEFAULT 'private' NOT NULL,
	"current_version_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "track_versions" ADD CONSTRAINT "track_versions_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_current_version_id_track_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."track_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "track_versions_track_id_version_number_idx" ON "track_versions" USING btree ("track_id","version_number");--> statement-breakpoint
CREATE INDEX "tracks_owner_id_created_at_idx" ON "tracks" USING btree ("owner_id","created_at");