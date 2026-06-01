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

  // BytePlus ModelArk — Seedance 2.0 video (sole video provider).
  BYTEPLUS_API_KEY: z.string().min(1),
  BYTEPLUS_BASE_URL: z
    .string()
    .url()
    .default("https://ark.ap-southeast.bytepluses.com"),
  BYTEPLUS_VIDEO_MODEL: z.string().default("dreamina-seedance-2-0-260128"),
  BYTEPLUS_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  BYTEPLUS_POLL_TIMEOUT_MS: z.coerce.number().int().positive().default(600000),

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

  // Runtime
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
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
