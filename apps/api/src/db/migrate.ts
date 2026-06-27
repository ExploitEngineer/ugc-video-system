// Programmatic migrator — applies everything in ./migrations to the DB
// pointed at by DATABASE_URL. Can be run as a standalone script via
// `pnpm db:migrate`, or imported and called programmatically on startup.

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate as drizzleMigrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { databaseUrl } from "./connection-url.js";

export async function migrate(): Promise<void> {
  const migrationClient = postgres(databaseUrl(), { max: 1, prepare: false });

  await drizzleMigrate(drizzle(migrationClient), {
    migrationsFolder: "./src/db/migrations",
  });

  await migrationClient.end();
  console.log("✓ migrations applied");
}

// Allow running directly as a script: `tsx src/db/migrate.ts`
if (process.argv[1]?.endsWith("migrate.ts") || process.argv[1]?.endsWith("migrate.js")) {
  await migrate();
}
