ALTER TABLE "runs" ALTER COLUMN "ad_type" SET DATA TYPE text USING "ad_type"::text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "ad_type_source" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "hooks" jsonb;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "ad_type_confidence" real;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "detector_meta" jsonb;--> statement-breakpoint
DROP TYPE "public"."ad_type";