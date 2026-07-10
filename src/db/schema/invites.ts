import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { user } from "./auth"

/** Invitation links for closed instances (registration mode "invite"). */
export const invite = pgTable("invite", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  token: text("token").notNull().unique(),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  maxUses: integer("max_uses").notNull().default(1),
  usedCount: integer("used_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
