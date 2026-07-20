/**
 * Runs drizzle-kit migrations under a Postgres advisory lock.
 *
 * Every container started from this image migrates on boot, so two app replicas
 * (or an app and a worker) coming up together would otherwise run the same DDL
 * concurrently — drizzle-kit takes no lock of its own. That ends in "relation
 * already exists" / duplicate-key errors and a crash loop in the middle of an
 * upgrade. The advisory lock serializes them: the first process migrates, the
 * others wait and then find nothing left to do.
 */
import { spawnSync } from "node:child_process"
import postgres from "postgres"

/** Arbitrary but fixed — only processes using this same key serialize. */
const LOCK_KEY = 8147326501

const url = process.env.DATABASE_URL
if (!url) {
  console.error("[migrate] DATABASE_URL is not set")
  process.exit(1)
}

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} })
let status = 1

try {
  await sql`SELECT pg_advisory_lock(${LOCK_KEY})`
  status =
    spawnSync(process.execPath, ["node_modules/drizzle-kit/bin.cjs", "migrate"], {
      stdio: "inherit",
    }).status ?? 1
} catch (error) {
  console.error("[migrate] failed", error)
} finally {
  // Best-effort: closing the connection releases the lock in any case.
  await sql`SELECT pg_advisory_unlock(${LOCK_KEY})`.catch(() => {})
  await sql.end({ timeout: 5 }).catch(() => {})
}

process.exit(status)
