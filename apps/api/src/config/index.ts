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

  // Volcengine / BytePlus Ark — Seedance 2.0 video (key starts `ark-`)
  ARK_API_KEY: z.string().min(1),

  // Supabase — Postgres (Drizzle), Storage, Auth (F8)
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().url(),

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
