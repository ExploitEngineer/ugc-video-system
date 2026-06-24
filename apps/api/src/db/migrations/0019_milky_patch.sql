ALTER TYPE "public"."step" ADD VALUE 'creative_brief' BEFORE 'product_sheet';--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "creative_brief" jsonb;