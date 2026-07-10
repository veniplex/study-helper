import { desc, eq } from "drizzle-orm"
import { db } from "@/db"
import { auditLog } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { pruneAuditLog } from "@/lib/audit"
import { AuditLogView } from "@/components/settings/audit-log-view"

const UNDOABLE_OPS = new Set(["create", "update", "delete"])

export default async function AuditPage() {
  const session = await requireSession()
  // Opportunistic retention cleanup (90 days)
  void pruneAuditLog().catch(() => {})

  const entries = await db.query.auditLog.findMany({
    where: eq(auditLog.userId, session.user.id),
    orderBy: [desc(auditLog.createdAt)],
    limit: 200,
  })

  return (
    <AuditLogView
      entries={entries.map((e) => ({
        id: e.id,
        actor: e.actor,
        operation: e.operation,
        entityType: e.entityType,
        entityLabel: e.entityLabel,
        undone: e.undone,
        createdAt: e.createdAt.toISOString(),
        undoable: UNDOABLE_OPS.has(e.operation),
      }))}
    />
  )
}
