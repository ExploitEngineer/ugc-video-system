// Server-side config: load `apps/api/.env`, validate with Zod, fail fast.
//
// Importing this module parses + validates immediately. If any required
// secret is missing/invalid the process exits with a readable report,
// so a misconfigured server never boots into a half-broken state.
//
// NOTE: not yet imported by the running server (no consumer until the
// DB/provider layers land in F1+). Wire it in where secrets are needed.
// All values here are SERVER-ONLY — never import this from `apps/web`.

import "dotenv/config";
import { z } from "zod";

const serverEnvSchema = z.object({
  // OpenAI — GPT Image 2 + LLM reasoning/critique
  OPENAI_API_KEY: z.string().min(1),

  // OpenRouter — Claude Sonnet 4.6 for the vision/label-reading steps
  // (describeProduct, derivePersonBrief). OpenAI-SDK-compatible endpoint.
  // Optional: when unset, those steps silently fall back to gpt-4.1, so the
  // server still boots and runs without it.
  OPENROUTER_API_KEY: z.string().min(1).optional(),

  // BytePlus ModelArk — Seedance 2.0 video (sole video provider).
  // The `ark-` key authenticates VIDEO GENERATION (inference) only.
  BYTEPLUS_API_KEY: z.string().min(1),
  BYTEPLUS_BASE_URL: z
    .string()
    .url()
    .default("https://ark.ap-southeast.bytepluses.com"),
  BYTEPLUS_VIDEO_MODEL: z.string().default("dreamina-seedance-2-0-260128"),
  // Output resolution for Seedance. 1080p reads as real phone footage; 720p
  // looks like downsampled AI video. Overridable per-deploy (e.g. "720p" to cut
  // cost/time). Seedance 2.0 supports 480p | 720p | 1080p.
  BYTEPLUS_VIDEO_RESOLUTION: z.string().default("1080p"),
  // Optional FIXED seed — set during prompt iteration so output changes can be
  // attributed to the prompt, not sampling noise. Leave unset in production for
  // per-generation variety (the provider then sends a random seed).
  BYTEPLUS_VIDEO_SEED: z.coerce.number().int().optional(),
  BYTEPLUS_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  // Max wall-clock to keep polling ONE Seedance task before giving up (the
  // dead-man's switch for a stuck job — NOT a network timeout). 30 min: 1080p
  // Seedance 2.0 routinely renders near/over 10 min, worse when N segments share
  // BytePlus capacity, so the old 10-min default false-failed legit clips.
  BYTEPLUS_POLL_TIMEOUT_MS: z.coerce.number().int().positive().default(1800000),

  // BytePlus asset management (real-human/face assets) — OpenAPI, AK/SK-signed.
  // SEPARATE from the `ark-` key above. Required ONLY to register faces so
  // Seedance's face filter accepts them (see docs/byteplus-face-assets.md);
  // when absent the video flow falls back to raw image_url URLs. Optional so
  // the server still boots before the user adds these.
  BYTEPLUS_ACCESS_KEY: z.string().optional(),
  BYTEPLUS_SECRET_KEY: z.string().optional(),
  BYTEPLUS_REGION: z.string().default("ap-southeast-1"),
  // Reuse ONE asset group across runs; auto-created + logged once if unset.
  BYTEPLUS_ASSET_GROUP_ID: z.string().optional(),
  // BytePlus asset-management OpenAPI (verified live: open.byteplusapi.com,
  // service "ark", version "2024-01-01"; region from BYTEPLUS_REGION).
  BYTEPLUS_OPENAPI_HOST: z.string().default("open.byteplusapi.com"),
  BYTEPLUS_ASSET_SERVICE: z.string().default("ark"),
  BYTEPLUS_ASSET_API_VERSION: z.string().default("2024-01-01"),

  // Supabase — Postgres (Drizzle), Storage, Auth (F8)
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().url(),

  // F7 background worker — in-process loop that drives runs through the
  // pipeline. Disable (e.g. in tests) to keep the HTTP server passive.
  WORKER_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1500),
  // Max concurrent Seedance segment-video tasks per 60s run (fan-out throttle).
  // Lower if BytePlus rejects parallel tasks; 4 = all segments at once.
  SEGMENT_VIDEO_CONCURRENCY: z.coerce.number().int().positive().default(4),
  // Max concurrent segment-storyboard generations per 60s run. Each is a GPT
  // Image 2 call that also fetches the shared product/person sheets, so bursting
  // all four at once multiplies concurrent fetches against the same hosts; 3
  // keeps the pipeline moving while avoiding the thundering-herd that surfaced
  // transient "fetch failed" drops.
  SEGMENT_STORYBOARD_CONCURRENCY: z.coerce.number().int().positive().default(3),
  // Optional continuous music bed for the 60s merge. When set, this ONE track is
  // mixed under the full 60s video and ducked beneath the native per-clip audio
  // (sidechain) so on-camera UGC dialogue is never drowned. Unset → the merge
  // keeps native audio as-is, plus the loudnorm + grade normalization.
  MUSIC_BED_URL: z.string().url().optional(),

  // Runtime
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  // Backend log verbosity. Unset → `debug` in development, else `info`.
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),
  PORT: z.coerce.number().int().positive().default(3001),
  // Allowed CORS origin(s) for the browser-facing API. Comma-separate multiple
  // origins; use "*" to allow any. Change the deployed frontend URL here without
  // touching code (e.g. CORS_ORIGIN=https://your-app.vercel.app).
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

const parsed = serverEnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  console.error(
    `\n✗ Invalid server environment. Fix apps/api/.env:\n${issues}\n`,
  );
  process.exit(1);
}

export const env: ServerEnv = parsed.data;
