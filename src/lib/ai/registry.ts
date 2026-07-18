import "server-only"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createMistral } from "@ai-sdk/mistral"
import { createGroq } from "@ai-sdk/groq"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type { EmbeddingModel, LanguageModel } from "ai"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { userAiKey, userPrefs } from "@/db/schema"
import { decrypt } from "@/lib/crypto"
import { getSetting, type AiProvider } from "@/lib/settings"

export type ModelRef = { providerId: string; modelId: string }

export function parseModelRef(ref: string): ModelRef {
  const idx = ref.indexOf(":")
  if (idx < 1) throw new Error(`Invalid model ref: ${ref}`)
  return { providerId: ref.slice(0, idx), modelId: ref.slice(idx + 1) }
}

async function resolveApiKey(provider: AiProvider, userId: string): Promise<string | undefined> {
  const byok = await db.query.userAiKey.findFirst({
    where: and(eq(userAiKey.userId, userId), eq(userAiKey.providerId, provider.id)),
  })
  if (byok) return decrypt(byok.encryptedKey)
  return provider.apiKey
}

function instantiate(provider: AiProvider, apiKey: string | undefined) {
  switch (provider.type) {
    case "anthropic":
      return createAnthropic({ apiKey, baseURL: provider.baseUrl })
    case "openai":
      return createOpenAI({ apiKey, baseURL: provider.baseUrl })
    case "google":
      return createGoogleGenerativeAI({ apiKey, baseURL: provider.baseUrl })
    case "mistral":
      return createMistral({ apiKey, baseURL: provider.baseUrl })
    case "groq":
      return createGroq({ apiKey, baseURL: provider.baseUrl })
    case "ollama":
      return createOpenAICompatible({
        name: provider.id,
        baseURL: `${(provider.baseUrl ?? "http://localhost:11434").replace(/\/$/, "")}/v1`,
        apiKey: apiKey ?? "ollama",
      })
    case "openai-compatible":
      if (!provider.baseUrl) throw new Error("baseUrl required for openai-compatible provider")
      return createOpenAICompatible({ name: provider.id, baseURL: provider.baseUrl, apiKey })
  }
}

/**
 * Fires a minimal real request against a provider to verify its API key /
 * endpoint before it gets saved and fails later deep inside a stream or a
 * background job. Uses the given model (or the provider's default/first) with
 * a one-token completion.
 */
export async function testProviderConnection(
  provider: AiProvider,
  apiKey: string | undefined,
  modelId?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { generateText } = await import("ai")
  const id = modelId || provider.models[0]
  if (!id) return { ok: false, error: "No model configured for this provider" }
  try {
    const sdk = instantiate(provider, apiKey)
    await generateText({ model: sdk.languageModel(id), prompt: "ping", maxOutputTokens: 1 })
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message.slice(0, 300) }
  }
}

async function getProvider(providerId: string): Promise<AiProvider> {
  const ai = await getSetting("ai")
  const provider = ai?.providers.find((p) => p.id === providerId)
  if (!provider) throw new Error(`Unknown AI provider: ${providerId}`)
  return provider
}

/** Resolves "providerId:modelId" to a language model, honoring BYOK keys. */
export async function getLanguageModel(ref: string, userId: string): Promise<LanguageModel> {
  const { providerId, modelId } = parseModelRef(ref)
  const provider = await getProvider(providerId)
  const apiKey = await resolveApiKey(provider, userId)
  const sdk = instantiate(provider, apiKey)
  return sdk.languageModel(modelId)
}

export async function getEmbeddingModel(ref: string, userId: string): Promise<EmbeddingModel> {
  const { providerId, modelId } = parseModelRef(ref)
  const provider = await getProvider(providerId)
  const apiKey = await resolveApiKey(provider, userId)
  const sdk = instantiate(provider, apiKey)
  return sdk.textEmbeddingModel(modelId)
}

/**
 * A language model for image understanding (OCR/description). Modern chat
 * models are multimodal, so we reuse the user's resolved chat model. Returns
 * null when no provider is configured.
 */
export async function getVisionModel(userId: string): Promise<LanguageModel | null> {
  const ref = await resolveModelForUser(userId)
  if (!ref) return null
  return getLanguageModel(ref, userId)
}

/** Default transcription model per provider type that supports audio. */
const TRANSCRIPTION_MODELS: Partial<Record<AiProvider["type"], string>> = {
  openai: "whisper-1",
  groq: "whisper-large-v3-turbo",
}

/**
 * A speech-to-text model from the first configured provider that supports
 * transcription (OpenAI or Groq), honoring BYOK keys. Returns the model plus
 * its "providerId:modelId" ref (for usage logging), or null otherwise.
 */
export async function getTranscriptionModel(
  userId: string
): Promise<{ model: unknown; ref: string } | null> {
  const ai = await getSetting("ai")
  for (const provider of ai?.providers ?? []) {
    const modelId = TRANSCRIPTION_MODELS[provider.type]
    if (!modelId) continue
    const apiKey = await resolveApiKey(provider, userId)
    if (!apiKey) continue
    const sdk = instantiate(provider, apiKey)
    const withTranscription = sdk as { transcription?: (id: string) => unknown }
    if (typeof withTranscription.transcription === "function") {
      return { model: withTranscription.transcription(modelId), ref: `${provider.id}:${modelId}` }
    }
  }
  return null
}

/** All model refs a user may pick from, plus the default. */
export async function listAvailableModels(): Promise<{
  models: { ref: string; label: string }[]
  defaultModel: string | null
}> {
  const ai = await getSetting("ai")
  const models =
    ai?.providers.flatMap((p) =>
      p.models.map((m) => ({ ref: `${p.id}:${m}`, label: `${p.name} · ${m}` }))
    ) ?? []
  const defaultModel =
    ai?.defaultModel && models.some((m) => m.ref === ai.defaultModel)
      ? ai.defaultModel
      : (models[0]?.ref ?? null)
  return { models, defaultModel }
}

/** True when at least one AI provider/model is configured (admin settings). */
export async function isAiAvailable(): Promise<boolean> {
  const { models } = await listAvailableModels()
  return models.length > 0
}

/**
 * The model a user's AI requests should use: their preferred model (if still
 * available), otherwise the admin-configured global default. Null when no
 * provider is configured — AI features are hidden entirely then.
 */
export async function resolveModelForUser(userId: string): Promise<string | null> {
  const { models, defaultModel } = await listAvailableModels()
  if (models.length === 0) return null
  const prefs = await db.query.userPrefs.findFirst({
    where: eq(userPrefs.userId, userId),
    columns: { preferredModel: true },
  })
  const preferred = prefs?.preferredModel
  if (preferred && models.some((m) => m.ref === preferred)) return preferred
  return defaultModel
}
