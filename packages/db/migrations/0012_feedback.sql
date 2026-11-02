CREATE TYPE "public"."feedback_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY NOT NULL,
	"track_version_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"parent_id" uuid,
	"timestamp_ms" integer,
	"body" text NOT NULL,
	"status" "feedback_status" DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_id_track_version_id_unique" UNIQUE("id","track_version_id"),
	CONSTRAINT "feedback_body_not_blank" CHECK (char_length(trim("feedback"."body")) > 0),
	CONSTRAINT "feedback_body_max_length" CHECK (char_length("feedback"."body") <= 2000),
	CONSTRAINT "feedback_timestamp_non_negative" CHECK ("feedback"."timestamp_ms" >= 0),
	CONSTRAINT "feedback_reply_shape" CHECK ("feedback"."parent_id" is null or ("feedback"."timestamp_ms" is null and "feedback"."status" = 'open')),
	CONSTRAINT "feedback_resolved_iff_resolved_at" CHECK (("feedback"."status" = 'resolved') = ("feedback"."resolved_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_track_version_id_track_versions_id_fk" FOREIGN KEY ("track_version_id") REFERENCES "public"."track_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_parent_fk" FOREIGN KEY ("parent_id","track_version_id") REFERENCES "public"."feedback"("id","track_version_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_track_version_id_timestamp_ms_idx" ON "feedback" USING btree ("track_version_id","timestamp_ms");--> statement-breakpoint
CREATE INDEX "feedback_parent_id_idx" ON "feedback" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "feedback_author_id_idx" ON "feedback" USING btree ("author_id");