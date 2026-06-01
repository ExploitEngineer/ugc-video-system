CREATE TYPE "public"."ad_type" AS ENUM('ugc', 'inspirational');--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "ad_type" "ad_type";