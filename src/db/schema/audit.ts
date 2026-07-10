import { boolean, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { user } from "./auth"

export type AuditActor = "user" | "ai"
export type AuditOperation = "create" | "update" | "delete" | "undo" | "ai_read"

/**
 * Per-user activity log of all CRUD operations (by the user or the AI agent)
 * plus AI read access to materials. `before`/`after` hold row snapshots so
 * operations can be undone.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    actor: text("actor").$type<AuditActor>().notNull().default("user"),
    operation: text("operation").$type<AuditOperation>().notNull(),
    /** e.g. "deck", "quiz", "material", "event", "goal", "assignment" */
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    /** Human-readable label of the affected entity at the time of the operation */
    entityLabel: text("entity_label").notNull(),
    /** Row snapshot before the operation (update/delete) */
    before: jsonb("before"),
    /** Row snapshot after the operation (create/update) */
    after: jsonb("after"),
    undone: boolean("undone").notNull().default(false),
    /** Chat conversation that triggered an AI operation */
    conversationId: text("conversation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_user_created_idx").on(t.userId, t.createdAt)]
)
