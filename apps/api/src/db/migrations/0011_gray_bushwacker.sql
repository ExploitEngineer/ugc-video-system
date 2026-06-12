CREATE TYPE "public"."duration" AS ENUM('15s', '60s');--> statement-breakpoint
ALTER TYPE "public"."asset_kind" ADD VALUE 'segment_video';--> statement-breakpoint
ALTER TYPE "public"."step" ADD VALUE 'narrative_outline';--> statement-breakpoint
ALTER TYPE "public"."step" ADD VALUE 'segment_storyboard';--> statement-breakpoint
ALTER TYPE "public"."step" ADD VALUE 'segment_video';--> statement-breakpoint
ALTER TYPE "public"."step" ADD VALUE 'merge';--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "duration" "duration" DEFAULT '15s' NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "narrative_outline" jsonb;--> statement-breakpoint
ALTER TABLE "storyboard_sheets" ADD COLUMN "segment_index" integer;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "segment_index" integer;--> statement-breakpoint
CREATE INDEX "storyboard_sheets_run_segment_idx" ON "storyboard_sheets" USING btree ("run_id","segment_index");--> statement-breakpoint
CREATE INDEX "videos_run_segment_idx" ON "videos" USING btree ("run_id","segment_index");