CREATE TYPE "public"."city" AS ENUM('san-francisco', 'seattle', 'los-angeles', 'chicago', 'philadelphia', 'new-york', 'miami', 'portland-or');--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "handle" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "city" "city";