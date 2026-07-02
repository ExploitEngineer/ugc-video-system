ALTER TYPE "public"."run_status" ADD VALUE 'awaiting_edit' BEFORE 'regenerating';--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "plainly_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "plainly_edit" jsonb;