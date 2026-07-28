import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

function createDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required before accessing PostgreSQL.");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: process.env.NODE_ENV === "production" ? 10 : 5,
  });

  return {
    db: drizzle(pool, { schema }),
    pool,
  };
}

type DatabaseState = ReturnType<typeof createDatabase>;

const globalForDatabase = globalThis as typeof globalThis & {
  commonTableDatabase?: DatabaseState;
};

export function getDatabase() {
  // Cache the pool during development so hot reloads do not keep opening PostgreSQL connections.
  if (!globalForDatabase.commonTableDatabase) {
    globalForDatabase.commonTableDatabase = createDatabase();
  }

  return globalForDatabase.commonTableDatabase.db;
}

export async function closeDatabase() {
  const state = globalForDatabase.commonTableDatabase;

  if (state) {
    await state.pool.end();
    globalForDatabase.commonTableDatabase = undefined;
  }
}
