// Programmatic migrator — applies everything in ./migrations to the DB
// pointed at by DATABASE_URL, then exits. Run via `pnpm db:migrate`.

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "../config/index.js";

const migrationClient = postgres(env.DATABASE_URL, { max: 1, prepare: false });

await migrate(drizzle(migrationClient), {
  migrationsFolder: "./src/db/migrations",
});

await migrationClient.end();
console.log("✓ migrations applied");
