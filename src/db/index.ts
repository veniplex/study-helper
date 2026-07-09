import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

const connectionString =
  process.env.DATABASE_URL ?? "postgres://study:study@localhost:5432/study"

// Reuse the connection across HMR reloads in development
const globalForDb = globalThis as unknown as { dbClient?: ReturnType<typeof postgres> }

const client = globalForDb.dbClient ?? postgres(connectionString)
if (process.env.NODE_ENV !== "production") globalForDb.dbClient = client

export const db = drizzle(client, { schema })
