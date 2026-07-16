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

  // OpenRouter — Claude Sonnet 4.6 is now the DEFAULT reasoning/vision backend
  // for every `chat()` call (image gen stays gpt-image-2). OpenAI-SDK-compatible
  // endpoint. Optional: when unset, all reasoning/vision silently falls back to
  // gpt-4.1, so the server still boots and runs without it.
  OPENROUTER_API_KEY: z.string().min(1).optional(),

  // Reasoning/vision model ids — overridable per-deploy without touching code.
  // `OPENAI_CHAT_MODEL` = the gpt-4.1 fallback (used when OPENROUTER_API_KEY is
  // unset or a caller forces backend:"openai"). `OPENROUTER_CLAUDE_MODEL` = the
  // default Claude backend slug (VERIFY live via GET …/v1/models before deploy).
  OPENAI_CHAT_MODEL: z.string().min(1).default("gpt-4.1"),
  OPENROUTER_CLAUDE_MODEL: z
    .string()
    .min(1)
    .default("anthropic/claude-sonnet-4.6"),
  /**
   * The SMALL reasoning model (`backend: "small"`), for short, mechanical,
   * high-volume calls where the big model's judgement buys nothing: the template
   * pipeline's per-slot plan and its on-screen copy.
   *
   * Same OpenRouter endpoint as `OPENROUTER_CLAUDE_MODEL`, so it needs no extra
   * key, and it degrades to the default backend when `OPENROUTER_API_KEY` is
   * unset. Swap the slug per-deploy if quality disappoints.
   */
  OPENROUTER_SMALL_MODEL: z
    .string()
    .min(1)
    .default("anthropic/claude-haiku-4.5"),

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

  // Nexrender Cloud — After Effects template rendering, the `pipeline:
  // "template"` run kind. Cloud is the only viable host on this Linux stack
  // (self-host needs AE on Windows/macOS). The user registers a template
  // BEFORE the run exists (`POST /templates/register`); once the ad clip
  // generates, `template_fill` (LLM text) → `template_render` (Nexrender
  // composite) run automatically. All keys OPTIONAL so the server boots
  // without them; when the key is absent (or NEXRENDER_STUB=true) the provider
  // falls back to a STUB that echoes the input clip as the "render", so the
  // whole flow is testable without credits.
  // Master switch for the whole template pipeline. OFF by default — `POST
  // /runs` rejects `pipeline: "template"` until this is flipped, so the
  // pipeline stays dark until it's been smoke-tested end to end.
  TEMPLATE_STEP_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  // Which provider ANALYZES the template in `template_plan`. `claude` (default)
  // = Claude Sonnet vision over the preview poster + frames sampled from the
  // preview clip (still images). `gemini` = true frame-by-frame .mp4 understanding
  // (deferred — the provider is a stub) and only takes effect with a live
  // GEMINI_API_KEY, else it degrades back to Claude.
  TEMPLATE_VISION_PROVIDER: z.enum(["claude", "gemini"]).default("claude"),
  GEMINI_API_KEY: z.string().min(1).optional(),
  // Which Gemini model runs the video analysis when TEMPLATE_VISION_PROVIDER=gemini.
  // Env-swappable — any video-capable Gemini slug (gemini-2.5-pro for the richest
  // read, gemini-2.5-flash for a cheaper/faster pass).
  GEMINI_VISION_MODEL: z.string().default("gemini-2.5-pro"),
  // How many frames to sample from the preview clip for the Claude vision pass.
  // Adapts to clip length (~1/sec) up to this cap; 0 disables sampling (poster
  // only). Bounded so a long template can't blow the vision call's token budget.
  TEMPLATE_VISION_FRAME_COUNT: z.coerce
    .number()
    .int()
    .min(0)
    .max(16)
    .default(12),
  /**
   * Shared secret for the `/admin/*` routes (template library management),
   * sent as an `x-admin-key` header. Auth (F8) is not started and the rest of
   * the API is unauthenticated, so this is a SOFT GUARD — it stops a stranger
   * who finds the URL from uploading a 200MB .aep and burning Nexrender
   * credits. It is not real auth and must never be described as such.
   *
   * Optional so the server still boots without it, but the admin routes then
   * return 503 in EVERY environment rather than defaulting open: a misread
   * NODE_ENV in a deploy must not silently expose template upload.
   */
  ADMIN_API_KEY: z.string().min(16).optional(),
  NEXRENDER_API_KEY: z.string().optional(),
  NEXRENDER_BASE_URL: z.string().url().default("https://api.nexrender.com"),
  NEXRENDER_STUB: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  NEXRENDER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  // Dead-man's switch for one stuck Nexrender job (NOT a network timeout).
  // AE renders can take minutes; 30 min mirrors the BytePlus poll timeout.
  NEXRENDER_POLL_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(1800000),

  // Supabase — Postgres (Drizzle), Storage, Auth (F8)
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().url(),
  // Run pending migrations on server startup. Default true (dev + single-instance
  // deploys). Set "false" in production when the app connects through a connection
  // POOLER that can't run DDL (the Supabase transaction pooler can't `CREATE
  // SCHEMA`), and apply migrations out-of-band via a direct/session connection
  // (`pnpm --filter api db:migrate`). Keeps a pooler-only boot from crash-looping.
  DB_MIGRATE_ON_BOOT: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  // F7 background worker — in-process loop that drives runs through the
  // pipeline. Disable (e.g. in tests) to keep the HTTP server passive.
  WORKER_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1500),
  // Large-media downloads (renders, clips, masters) are governed by a STALL
  // timeout, not a total-duration cap: abort only after this many ms of NO
  // received bytes (a silent socket), so a healthy slow-but-progressing 100MB+
  // download is never killed mid-transfer. See lib/download.ts.
  MEDIA_DOWNLOAD_IDLE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(120_000),
  // Absolute backstop for a single media download so a bytes-trickle can't hang
  // forever. Generous — the stall timeout is the real guard.
  MEDIA_DOWNLOAD_MAX_MS: z.coerce.number().int().positive().default(1_800_000),
  // Whole-download attempts, each on a fresh connection. A stall is usually a
  // network TRANSITION (a resume's DHCP lease, a wifi reconnect) rather than a
  // dead host, and it outlives a couple of quick retries — so retry a few times
  // with a seconds-scale backoff instead of giving up in under 5s.
  MEDIA_DOWNLOAD_ATTEMPTS: z.coerce.number().int().positive().default(5),
  // Hold an OS sleep inhibitor while a run is in flight (best-effort, needs
  // systemd — a no-op elsewhere). A run costs real OpenAI/BytePlus money and
  // takes ~20min, which is far longer than a laptop's idle-suspend timer: one
  // `systemctl suspend` mid-run kills every socket the worker holds and can
  // fail the run outright. See lib/sleep-inhibitor.ts.
  WORKER_INHIBIT_SLEEP: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  // Files larger than this are NOT uploaded to Supabase Storage — the hosted
  // project rejects an object over its global cap (~50MB by default, raisable
  // only on a paid plan). A render past this is kept at the provider's own URL
  // (e.g. the ~14d Nexrender output) so a big video is still viewable rather than
  // failing the run on the upload. Raise this once you raise the Supabase limit.
  STORAGE_UPLOAD_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(50 * 1024 * 1024),
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
