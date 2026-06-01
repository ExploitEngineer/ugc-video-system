// Public web env. ONLY `NEXT_PUBLIC_*` vars — these are inlined into the
// browser bundle, so nothing secret may live here (no service-role key, no
// OpenAI/OpenRouter keys, no DATABASE_URL — those stay server-side in apps/api).
//
// Each var is accessed as a literal `process.env.NEXT_PUBLIC_*` so Next.js
// statically replaces it at build time. A missing var throws at module load.

function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(
      `Missing public env var: ${name} (set it in apps/web/.env.local)`,
    );
  }
  return value;
}

export const env = {
  /** Base URL of the Hono api. */
  apiUrl: required("NEXT_PUBLIC_API_URL", process.env.NEXT_PUBLIC_API_URL),
  /** Supabase project URL (public). */
  supabaseUrl: required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ),
  /** Supabase anon key (public, RLS-gated). */
  supabaseAnonKey: required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
} as const;
