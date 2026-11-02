CREATE TYPE "public"."avatar_status" AS ENUM('uploading', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "avatars" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "avatar_status" DEFAULT 'uploading' NOT NULL,
	"failure_reason" text,
	"original_key" text NOT NULL,
	"original_content_type" text NOT NULL,
	"original_size_bytes" bigint NOT NULL,
	"image_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "avatars_ready_has_image" CHECK ("avatars"."status" <> 'ready' or "avatars"."image_key" is not null),
	CONSTRAINT "avatars_failed_has_reason" CHECK ("avatars"."status" <> 'failed' or "avatars"."failure_reason" is not null)
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "current_avatar_id" uuid;--> statement-breakpoint
ALTER TABLE "avatars" ADD CONSTRAINT "avatars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "avatars_user_id_id_idx" ON "avatars" USING btree ("user_id","id");--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_current_avatar_id_avatars_id_fk" FOREIGN KEY ("current_avatar_id") REFERENCES "public"."avatars"("id") ON DELETE set null ON UPDATE no action;