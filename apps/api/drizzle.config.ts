// drizzle-kit config — drives `generate` (SQL migrations) and `migrate`.
// Reads DATABASE_URL straight from apps/api/.env via dotenv.

import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set — fill apps/api/.env");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: { url },
  verbose: true,
  strict: true,
});
