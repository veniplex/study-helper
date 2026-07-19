import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

const connectionString =
  process.env.DATABASE_URL ?? "postgres://study:study@localhost:5432/study"

// Reuse the connection across HMR reloads in development
const globalForDb = globalThis as unknown as { dbClient?: ReturnType<typeof postgres> }

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : fallback
}

// Explicit pool bounds instead of postgres.js defaults: cap connections so the
// web + worker tiers don't collectively exhaust Postgres, reap idle sockets, and
// fail fast when the DB is unreachable. `max` defaults to 10 (per importer) and
// is env-tunable (a dedicated worker can raise it). Set DB_TRANSACTION_POOLER=1
// behind a transaction-mode pooler (pgbouncer), which forbids prepared
// statements → `prepare: false`.
const client =
  globalForDb.dbClient ??
  postgres(connectionString, {
    max: intEnv("DB_POOL_MAX", 10),
    idle_timeout: intEnv("DB_IDLE_TIMEOUT", 30),
    connect_timeout: intEnv("DB_CONNECT_TIMEOUT", 10),
    ...(process.env.DB_TRANSACTION_POOLER === "1" ||
    process.env.DB_TRANSACTION_POOLER === "true"
      ? { prepare: false }
      : {}),
  })
if (process.env.NODE_ENV !== "production") globalForDb.dbClient = client

export const db = drizzle(client, { schema })
