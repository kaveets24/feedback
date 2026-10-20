CREATE TYPE "public"."release_type" AS ENUM('single', 'ep', 'album', 'compilation');--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "release_type" "release_type" DEFAULT 'single' NOT NULL;