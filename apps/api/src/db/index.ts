// DB client singleton — postgres-js driver wrapped by Drizzle.
//
// First consumer of `src/config`: the validated `DATABASE_URL` is the
// only source of the connection string. Everything in the API/worker
// imports `db` from here so there is exactly one connection pool.

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../config/index.js";
import * as schema from "./schema.js";

// Supabase Postgres requires TLS. `prepare: false` keeps it compatible
// with the transaction-mode pooler (PgBouncer) if that URL is used.
const client = postgres(env.DATABASE_URL, { prepare: false });

export const db = drizzle(client, { schema });

export { schema };
