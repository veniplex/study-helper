import { bigint, index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { user } from "./auth"
import { material } from "./materials"
import { studyModule } from "./studies"

export const aiConversation = pgTable(
  "ai_conversation",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    moduleId: text("module_id").references(() => studyModule.id, { onDelete: "set null" }),
    /** When set, the conversation is scoped to ONE material ("chat with this
     *  document"): searchMaterials retrieves from this material only. */
    materialId: text("material_id").references(() => material.id, { onDelete: "set null" }),
    title: text("title").notNull().default("New conversation"),
    /** "providerId:modelId" of the last used model */
    model: text("model"),
    /** Assistant mode: general | homework-hints | homework-solution | writing | thesis */
    mode: text("mode").notNull().default("general"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("ai_conversation_userId_idx").on(t.userId)]
)

export const aiMessage = pgTable(
  "ai_message",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => aiConversation.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "assistant" | "system">().notNull(),
    /** AI SDK UIMessage parts */
    parts: jsonb("parts").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_message_conversationId_idx").on(t.conversationId)]
)

export const aiUsageLog = pgTable(
  "ai_usage_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    feature: text("feature").notNull().default("chat"),
    inputTokens: bigint("input_tokens", { mode: "number" }).notNull().default(0),
    outputTokens: bigint("output_tokens", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Composite, because every cap check aggregates one user's rows for the
    // current month — the single-column userId index made that scan the user's
    // entire history, on a table that grows with every AI call and is never
    // pruned. Kept alongside createdAt for the admin-wide usage views.
    index("ai_usage_user_created_idx").on(t.userId, t.createdAt),
    index("ai_usage_createdAt_idx").on(t.createdAt),
  ]
)

/** User-provided API keys (BYOK) that take precedence over admin keys. */
export const userAiKey = pgTable(
  "user_ai_key",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    encryptedKey: text("encrypted_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // One key per user and provider. Without this, a double-submit could store two
  // rows and the lookup (findFirst) would then pick between them arbitrarily —
  // so a rotated key could keep failing while the old one was silently used.
  (t) => [uniqueIndex("user_ai_key_user_provider_uq").on(t.userId, t.providerId)]
)

export const aiConversationRelations = relations(aiConversation, ({ many, one }) => ({
  messages: many(aiMessage),
  module: one(studyModule, {
    fields: [aiConversation.moduleId],
    references: [studyModule.id],
  }),
  material: one(material, {
    fields: [aiConversation.materialId],
    references: [material.id],
  }),
}))

export const aiMessageRelations = relations(aiMessage, ({ one }) => ({
  conversation: one(aiConversation, {
    fields: [aiMessage.conversationId],
    references: [aiConversation.id],
  }),
}))
