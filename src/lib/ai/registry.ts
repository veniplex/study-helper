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
import { userAiKey } from "@/db/schema"
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
