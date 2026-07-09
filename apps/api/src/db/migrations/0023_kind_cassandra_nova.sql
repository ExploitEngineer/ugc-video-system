CREATE TYPE "public"."pipeline" AS ENUM('video', 'template');--> statement-breakpoint
ALTER TYPE "public"."asset_kind" ADD VALUE 'template_image';--> statement-breakpoint
ALTER TYPE "public"."asset_kind" ADD VALUE 'templated_video';--> statement-breakpoint
ALTER TYPE "public"."asset_kind" ADD VALUE 'template_aep';--> statement-breakpoint
ALTER TYPE "public"."step" ADD VALUE 'template_plan';--> statement-breakpoint
ALTER TYPE "public"."step" ADD VALUE 'template_fill';--> statement-breakpoint
ALTER TYPE "public"."step" ADD VALUE 'template_images';--> statement-breakpoint
ALTER TYPE "public"."step" ADD VALUE 'template_render';--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nexrender_template_id" text,
	"content_hash" text NOT NULL,
	"source_type" text NOT NULL,
	"source_filename" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'registering' NOT NULL,
	"structure" jsonb,
	"metadata" jsonb,
	"preview_video_url" text,
	"preview_video_path" text,
	"preview_poster_url" text,
	"preview_poster_path" text,
	"preview_job_id" text,
	"preview_source" text,
	"error" text,
	"use_count" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "templates_status_check" CHECK ("templates"."status" in ('registering', 'introspecting', 'previewing', 'ready', 'failed')),
	CONSTRAINT "templates_source_type_check" CHECK ("templates"."source_type" in ('aep', 'zip', 'mogrt')),
	CONSTRAINT "templates_preview_source_check" CHECK ("templates"."preview_source" is null or "templates"."preview_source" in ('auto', 'admin'))
);
--> statement-breakpoint
ALTER TABLE "templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "pipeline" "pipeline" DEFAULT 'video' NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "template" jsonb;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "template_plan" jsonb;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "template_text_fill" jsonb;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "nexrender_job_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "templates_content_hash_uq" ON "templates" USING btree ("content_hash") WHERE "templates"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "templates_status_idx" ON "templates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "templates_ready_idx" ON "templates" USING btree ("created_at") WHERE "templates"."status" = 'ready' and "templates"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "templates_tags_idx" ON "templates" USING gin ("tags");--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE set null ON UPDATE no action;