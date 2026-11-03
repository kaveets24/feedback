-- Trigram indexes for search, which matches anywhere in a name. pg_trgm ships with Postgres
-- (contrib) and is available on Neon.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "profiles_handle_trgm_idx" ON "profiles" USING gin ("handle" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "profiles_display_name_trgm_idx" ON "profiles" USING gin ("display_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "tracks_title_trgm_idx" ON "tracks" USING gin ("title" gin_trgm_ops);
