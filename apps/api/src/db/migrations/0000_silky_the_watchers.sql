CREATE TYPE "public"."artifact_status" AS ENUM('draft', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."asset_kind" AS ENUM('product_upload', 'person_upload', 'product_sheet', 'person_sheet', 'storyboard_sheet', 'final_video');--> statement-breakpoint
CREATE TYPE "public"."mode" AS ENUM('automatic', 'confirm');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'awaiting_confirmation', 'regenerating', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."step" AS ENUM('product_sheet', 'person_sheet', 'product_inspection', 'storyboard', 'storyboard_inspection', 'video');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"storage_path" text NOT NULL,
	"url" text,
	"mime" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "person_reference_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"views" jsonb,
	"person_details" jsonb,
	"prompt_used" text,
	"status" "artifact_status" DEFAULT 'draft' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "person_reference_sheets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "product_reference_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"views" jsonb,
	"prompt_used" text,
	"status" "artifact_status" DEFAULT 'draft' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_reference_sheets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"ad_style" text,
	"mode" "mode" NOT NULL,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"current_step" "step",
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "step_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"step" "step" NOT NULL,
	"status" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "step_events_status_check" CHECK ("step_events"."status" in ('started', 'passed', 'failed', 'regenerated'))
);
--> statement-breakpoint
ALTER TABLE "step_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "storyboard_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"scenes" jsonb,
	"prompt_used" text,
	"status" "artifact_status" DEFAULT 'draft' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "storyboard_sheets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"duration_sec" numeric,
	"has_audio" boolean DEFAULT true NOT NULL,
	"provider_meta" jsonb,
	"status" text DEFAULT 'processing' NOT NULL,
	CONSTRAINT "videos_status_check" CHECK ("videos"."status" in ('processing', 'completed', 'failed')),
	CONSTRAINT "videos_duration_sec_check" CHECK ("videos"."duration_sec" > 0)
);
--> statement-breakpoint
ALTER TABLE "videos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_reference_sheets" ADD CONSTRAINT "person_reference_sheets_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_reference_sheets" ADD CONSTRAINT "person_reference_sheets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reference_sheets" ADD CONSTRAINT "product_reference_sheets_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_reference_sheets" ADD CONSTRAINT "product_reference_sheets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_events" ADD CONSTRAINT "step_events_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storyboard_sheets" ADD CONSTRAINT "storyboard_sheets_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storyboard_sheets" ADD CONSTRAINT "storyboard_sheets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_run_id_idx" ON "assets" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "person_reference_sheets_run_id_idx" ON "person_reference_sheets" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "person_reference_sheets_asset_id_idx" ON "person_reference_sheets" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "product_reference_sheets_run_id_idx" ON "product_reference_sheets" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "product_reference_sheets_asset_id_idx" ON "product_reference_sheets" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "runs_project_id_idx" ON "runs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "runs_status_idx" ON "runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "step_events_run_id_idx" ON "step_events" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "storyboard_sheets_run_id_idx" ON "storyboard_sheets" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "storyboard_sheets_asset_id_idx" ON "storyboard_sheets" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "videos_run_id_idx" ON "videos" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "videos_asset_id_idx" ON "videos" USING btree ("asset_id");