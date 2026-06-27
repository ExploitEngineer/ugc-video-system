ALTER TABLE "runs" ADD COLUMN "character_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "supporting_cast" jsonb;