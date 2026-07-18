"use client"

import Dexie, { type EntityTable } from "dexie"

/**
 * Offline outbox: write actions performed while offline are queued in
 * IndexedDB and replayed when the connection returns.
 */

export type OutboxEntry = {
  id: number
  kind: "review-card" | "toggle-plan-item"
  payload: Record<string, unknown>
  createdAt: number
}

const db = new Dexie("studyhelper-outbox") as Dexie & {
  outbox: EntityTable<OutboxEntry, "id">
}

db.version(1).stores({ outbox: "++id, kind, createdAt" })

export async function enqueue(
  kind: OutboxEntry["kind"],
  payload: Record<string, unknown>
): Promise<void> {
  await db.outbox.add({ kind, payload, createdAt: Date.now() } as OutboxEntry)
}

export async function pendingCount(): Promise<number> {
  return db.outbox.count()
}

/**
 * True for errors that indicate the network is unavailable. Deliberately
 * narrow: only fetch-shaped failures (or an offline browser) count. Treating
 * every TypeError as "offline" would silently queue genuine client bugs into
 * the outbox instead of surfacing them.
 */
export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true
  return (
    error instanceof Error &&
    /fetch failed|networkerror|network request failed|load failed|failed to fetch/i.test(
      error.message
    )
  )
}

type Handlers = {
  [K in OutboxEntry["kind"]]: (payload: Record<string, unknown>) => Promise<unknown>
}

let flushing = false

/** Replays all queued entries in order. Stops at the first network failure. */
export async function flush(handlers: Handlers): Promise<number> {
  if (flushing) return 0
  flushing = true
  let replayed = 0
  try {
    const entries = await db.outbox.orderBy("createdAt").toArray()
    for (const entry of entries) {
      try {
        await handlers[entry.kind](entry.payload)
        await db.outbox.delete(entry.id)
        replayed++
      } catch (error) {
        if (isNetworkError(error)) break // still offline — retry later
        // Permanent failure (e.g. deleted entity): drop the entry
        await db.outbox.delete(entry.id)
      }
    }
  } finally {
    flushing = false
  }
  return replayed
}
