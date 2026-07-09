CREATE TYPE "public"."pipeline" AS ENUM('video', 'template');--> statement-breakpoint
ALTER TYPE "public"."asset_kind" ADD VALUE 'templated_video';--> statement-breakpoint
ALTER TYPE "public"."asset_kind" ADD VALUE 'template_aep';--> statement-breakpoint
ALTER TYPE "public"."step" ADD VALUE 'template_fill';--> statement-breakpoint
ALTER TYPE "public"."step" ADD VALUE 'template_render';--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "pipeline" "pipeline" DEFAULT 'video' NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "template" jsonb;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "template_text_fill" jsonb;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "nexrender_job_id" text;