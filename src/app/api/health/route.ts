import { NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { db } from "@/db"
import { deleteFile, saveFile } from "@/lib/storage"

export const dynamic = "force-dynamic"

/**
 * Verifies the storage backend accepts writes. A read-only uploads volume
 * (classic Docker bind-mount ownership problem) is the most common reason
 * "uploads don't work". This performs a real write, so it is NOT run on the
 * default liveness path — it is gated behind `?full=1` + HEALTH_TOKEN and
 * cached for ~30s to avoid a storage write on every hit.
 */
async function checkStorage(): Promise<boolean> {
  const probe = `health-${crypto.randomUUID()}.txt`
  try {
    const path = await saveFile("_health", probe, Buffer.from("ok"))
    await deleteFile(path)
    return true
  } catch (error) {
    console.error("[health] storage write check failed", error)
    return false
  }
}

let storageCache: { at: number; ok: boolean } | null = null

async function cachedStorageCheck(): Promise<boolean> {
  const now = Date.now()
  if (storageCache && now - storageCache.at < 30_000) return storageCache.ok
  const ok = await checkStorage()
  storageCache = { at: now, ok }
  return ok
}

export async function GET(request: Request) {
  let database = "up"
  try {
    await db.execute(sql`select 1`)
  } catch {
    database = "down"
  }

  // The full check writes to storage; require an explicit opt-in AND a token
  // (only honored when HEALTH_TOKEN is configured). Default GET is read-only.
  const url = new URL(request.url)
  const token = process.env.HEALTH_TOKEN
  const wantsFull =
    url.searchParams.get("full") === "1" && !!token && url.searchParams.get("token") === token

  let storage: "up" | "down" | undefined
  if (wantsFull) {
    storage = (await cachedStorageCheck()) ? "up" : "down"
  }

  const ok = database === "up" && storage !== "down"
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", database, ...(storage ? { storage } : {}) },
    { status: ok ? 200 : 503 }
  )
}
