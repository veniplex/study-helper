import "server-only"
import { and, eq, lt } from "drizzle-orm"
import type { PgTable } from "drizzle-orm/pg-core"
import { db } from "@/db"
import {
  auditLog,
  deck,
  flashcard,
  material,
  question,
  quiz,
  studyEvent,
  studyPlan,
  thesisProject,
  type AuditActor,
  type AuditOperation,
} from "@/db/schema"

const RETENTION_DAYS = 90

/** Tables that support undo, keyed by audit entityType. */
const ENTITY_TABLES: Record<string, PgTable> = {
  deck,
  flashcard,
  quiz,
  question,
  event: studyEvent,
  material,
  plan: studyPlan,
  thesis: thesisProject,
}

export type LogAuditInput = {
  userId: string
  actor?: AuditActor
  operation: AuditOperation
  entityType: string
  entityId: string
  entityLabel: string
  before?: unknown
  after?: unknown
  conversationId?: string | null
}

/** Records an operation in the per-user audit log. Never throws (logging must
 * not break the actual operation). */
export async function logAudit(input: LogAuditInput): Promise<void> {
  try {
    await db.insert(auditLog).values({
      userId: input.userId,
      actor: input.actor ?? "user",
      operation: input.operation,
      entityType: input.entityType,
      entityId: input.entityId,
      entityLabel: input.entityLabel.slice(0, 300),
      before: input.before ?? null,
      after: input.after ?? null,
      conversationId: input.conversationId ?? null,
    })
  } catch (error) {
    console.error("audit log failed", error)
  }
}

/** Deletes audit entries older than the retention window. */
export async function pruneAuditLog(): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
  await db.delete(auditLog).where(lt(auditLog.createdAt, cutoff))
}

function reviveRow(row: Record<string, unknown>): Record<string, unknown> {
  // Timestamps come back from jsonb as ISO strings — convert for insert/update.
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) &&
      !Number.isNaN(Date.parse(value))
    ) {
      out[key] = new Date(value)
    } else {
      out[key] = value
    }
  }
  return out
}

/**
 * Undoes a logged operation: create → delete the row, delete → re-insert the
 * `before` snapshot, update → restore the `before` snapshot. Records an
 * `undo` entry for traceability.
 */
export async function undoAudit(entryId: string, userId: string) {
  const entry = await db.query.auditLog.findFirst({
    where: and(eq(auditLog.id, entryId), eq(auditLog.userId, userId)),
  })
  if (!entry) throw new Error("Not found")
  if (entry.undone) throw new Error("Already undone")
  if (entry.operation === "ai_read" || entry.operation === "undo") {
    throw new Error("Not undoable")
  }
  const table = ENTITY_TABLES[entry.entityType]
  if (!table) throw new Error("Not undoable")

  const tableId = (table as unknown as { id: unknown }).id

  if (entry.operation === "create") {
    await db.delete(table).where(eq(tableId as never, entry.entityId as never))
  } else if (entry.operation === "delete") {
    if (!entry.before) throw new Error("No snapshot")
    await db.insert(table).values(reviveRow(entry.before as Record<string, unknown>) as never)
  } else if (entry.operation === "update") {
    if (!entry.before) throw new Error("No snapshot")
    const { id: _id, ...rest } = reviveRow(entry.before as Record<string, unknown>) // eslint-disable-line @typescript-eslint/no-unused-vars
    await db
      .update(table)
      .set(rest as never)
      .where(eq(tableId as never, entry.entityId as never))
  }

  await db.update(auditLog).set({ undone: true }).where(eq(auditLog.id, entry.id))
  await logAudit({
    userId,
    actor: "user",
    operation: "undo",
    entityType: entry.entityType,
    entityId: entry.entityId,
    entityLabel: entry.entityLabel,
  })
  return { ok: true as const }
}
