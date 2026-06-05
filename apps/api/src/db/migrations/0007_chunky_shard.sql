CREATE TYPE "public"."aspect_ratio" AS ENUM('16:9', '9:16');--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "aspect_ratio" "aspect_ratio" DEFAULT '16:9' NOT NULL;