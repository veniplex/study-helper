import "server-only"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { appConfig } from "@/db/schema"
import { decrypt, encrypt } from "./crypto"

// ---- Setting schemas -------------------------------------------------------

export const registrationModeSchema = z.enum(["open", "closed", "invite"])

export const socialProvidersSchema = z.object({
  github: z.object({ clientId: z.string(), clientSecret: z.string() }).optional(),
  google: z.object({ clientId: z.string(), clientSecret: z.string() }).optional(),
})

export const oidcProviderSchema = z.object({
  providerId: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "lowercase letters, digits and dashes only"),
  name: z.string().min(1),
  discoveryUrl: z.string().url(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  scopes: z.array(z.string()).default(["openid", "profile", "email"]),
})
export const oidcProvidersSchema = z.array(oidcProviderSchema)

export const smtpSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean().default(false),
  user: z.string().optional(),
  pass: z.string().optional(),
  from: z.string().min(1),
})

export const brandingSchema = z.object({
  appName: z.string().min(1).default("StudyHelper"),
})

export const uploadsSchema = z.object({
  maxUploadMb: z.number().int().min(1).max(10240).default(200),
  /** Per-user total storage quota in MB (input+output of all files). 0 = unlimited */
  storageQuotaMbPerUser: z.number().int().min(0).default(0),
})

export const vapidSchema = z.object({
  publicKey: z.string().min(1),
  privateKey: z.string().min(1),
})

export const updateCheckSchema = z.object({
  /** Latest release version found on GitHub, e.g. "1.1.0" (no "v" prefix). */
  latestVersion: z.string().min(1),
  /** Link to the release on GitHub. */
  htmlUrl: z.string().url(),
  publishedAt: z.string(),
  /** When this check ran. */
  checkedAt: z.string(),
})

export const aiProviderTypeSchema = z.enum([
  "anthropic",
  "openai",
  "google",
  "mistral",
  "groq",
  "ollama",
  "openai-compatible",
])

export const aiProviderSchema = z.object({
  /** Stable id used in model refs, e.g. "anthropic" or "my-ollama" */
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/),
  type: aiProviderTypeSchema,
  name: z.string().min(1),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  /** Chat model ids the admin enables, e.g. ["claude-sonnet-5"] */
  models: z.array(z.string().min(1)).default([]),
  /** Embedding model id (for RAG), optional */
  embeddingModel: z.string().optional(),
})

export const aiSettingsSchema = z.object({
  providers: z.array(aiProviderSchema).default([]),
  /** "providerId:modelId" */
  defaultModel: z.string().optional(),
  /** "providerId:embeddingModelId" used for RAG */
  defaultEmbeddingModel: z.string().optional(),
  /** Monthly token limit per user (input+output). 0 = unlimited */
  monthlyTokenLimitPerUser: z.number().int().min(0).default(0),
})

export type AiSettings = z.infer<typeof aiSettingsSchema>
export type AiProvider = z.infer<typeof aiProviderSchema>

const settingsSchemas = {
  "auth.registrationMode": registrationModeSchema,
  "auth.socialProviders": socialProvidersSchema,
  "auth.oidcProviders": oidcProvidersSchema,
  smtp: smtpSchema,
  branding: brandingSchema,
  uploads: uploadsSchema,
  ai: aiSettingsSchema,
  "push.vapid": vapidSchema,
  "system.updateCheck": updateCheckSchema,
} as const

export type SettingKey = keyof typeof settingsSchemas
export type SettingValue<K extends SettingKey> = z.infer<(typeof settingsSchemas)[K]>

/** Settings whose values are encrypted at rest because they contain credentials. */
const SECRET_KEYS: SettingKey[] = [
  "auth.socialProviders",
  "auth.oidcProviders",
  "smtp",
  "ai",
  "push.vapid",
]

const defaults: { [K in SettingKey]: SettingValue<K> } = {
  "auth.registrationMode": "open",
  "auth.socialProviders": {},
  "auth.oidcProviders": [],
  smtp: undefined as never, // no default — unset means email disabled
  branding: { appName: "StudyHelper" },
  uploads: { maxUploadMb: 200, storageQuotaMbPerUser: 0 },
  ai: { providers: [], monthlyTokenLimitPerUser: 0 },
  "push.vapid": undefined as never, // generated on first use
  "system.updateCheck": undefined as never, // set once the first check has run
}

// ---- Store -----------------------------------------------------------------

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K> | null> {
  const row = await db.query.appConfig.findFirst({ where: eq(appConfig.key, key) })
  if (!row) return (defaults[key] ?? null) as SettingValue<K> | null
  let raw = row.value
  if (SECRET_KEYS.includes(key) && typeof raw === "string") {
    raw = JSON.parse(decrypt(raw))
  }
  const parsed = settingsSchemas[key].safeParse(raw)
  return parsed.success ? (parsed.data as SettingValue<K>) : null
}

export async function setSetting<K extends SettingKey>(
  key: K,
  value: SettingValue<K>
): Promise<void> {
  const validated = settingsSchemas[key].parse(value)
  const stored = SECRET_KEYS.includes(key) ? encrypt(JSON.stringify(validated)) : validated
  await db
    .insert(appConfig)
    .values({ key, value: stored, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value: stored, updatedAt: new Date() },
    })
}

export async function deleteSetting(key: SettingKey): Promise<void> {
  await db.delete(appConfig).where(eq(appConfig.key, key))
}

/** The configured app name (branding), falling back to "StudyHelper". */
export async function getAppName(): Promise<string> {
  const branding = await getSetting("branding")
  return branding?.appName || "StudyHelper"
}
