"use client"

import Dexie, { type EntityTable } from "dexie"

/**
 * Offline outbox: write actions performed while offline are queued in
 * IndexedDB and replayed when the connection returns.
 */

export type OutboxEntry = {
  id: number
  kind: "review-card" | "toggle-session"
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

/**
 * True for the Next.js redirect a server action throws when the session has
 * expired (`requireSession()` → `redirect("/login")`). The client rejects the
 * action promise with this error, carrying a `NEXT_REDIRECT` digest.
 */
function isRedirectError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")
}

/**
 * True when a replay failure says "not now" rather than "never": the network is
 * gone, or the session expired. Both are temporary, so the entry stays queued.
 * Anything else is permanent (e.g. the entity was deleted on another device)
 * and the entry is dropped — reported, never silently.
 */
export function isRetryable(error: unknown): boolean {
  return isNetworkError(error) || isRedirectError(error)
}

type Handlers = {
  [K in OutboxEntry["kind"]]: (payload: Record<string, unknown>) => Promise<unknown>
}

let flushing = false

export type FlushResult = { replayed: number; dropped: number }

/**
 * Replays all queued entries in order. Stops at the first retryable failure and
 * reports how many entries had to be discarded, so the caller can tell the user
 * that some of their offline work did not make it.
 */
export async function flush(handlers: Handlers): Promise<FlushResult> {
  if (flushing) return { replayed: 0, dropped: 0 }
  flushing = true
  let replayed = 0
  let dropped = 0
  try {
    const entries = await db.outbox.orderBy("createdAt").toArray()
    for (const entry of entries) {
      try {
        await handlers[entry.kind](entry.payload)
        await db.outbox.delete(entry.id)
        replayed++
      } catch (error) {
        if (isRetryable(error)) break // offline or signed out — retry later
        console.error("[outbox] discarding unreplayable entry", entry.kind, error)
        await db.outbox.delete(entry.id)
        dropped++
      }
    }
  } finally {
    flushing = false
  }
  return { replayed, dropped }
}
