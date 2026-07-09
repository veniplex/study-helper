import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

/**
 * Key-value store for everything the admin panel manages
 * (SMTP, AI providers, registration mode, upload limits, branding, …).
 */
export const appConfig = pgTable("app_config", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})
