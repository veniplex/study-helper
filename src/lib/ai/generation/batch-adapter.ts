import "server-only"
import { and, eq } from "drizzle-orm"
import type { z } from "zod"
import { z as zod } from "zod"
import { db } from "@/db"
import { userAiKey } from "@/db/schema"
import { decrypt } from "@/lib/crypto"
import { getSetting } from "@/lib/settings"
import { parseModelRef } from "@/lib/ai/registry"

/**
 * Optional Batch-API adapter for the coverage-generation MAP step. Anthropic
 * Message Batches and OpenAI Batch run the same per-topic requests
 * asynchronously at ~50% of the cost. This module is split into pure, testable
 * builders/parsers and thin network calls; the vendor SDKs are imported lazily
 * so deployments that don't use batching never load them. Everything here is
 * opt-in (settings flag `ai.useBatchApi`) with the synchronous live path as the
 * default and the fallback.
 */

export type BatchProviderType = "anthropic" | "openai"

export type BatchProvider = {
  type: BatchProviderType
  apiKey: string
  baseUrl?: string
  modelId: string
}

export type BatchItem = {
  /** Correlates the request with an outline topic id. */
  customId: string
  prompt: string
  jsonSchema: Record<string, unknown>
  maxTokens: number
}

export type BatchUsage = { inputTokens: number; outputTokens: number }

export type BatchResult = {
  customId: string
  /** The parsed structured object, or null when the item errored. */
  object: unknown | null
  usage: BatchUsage
  error?: string
}

export type BatchPollStatus = "processing" | "completed" | "failed"

const TOOL_NAME = "emit_result"

// ---- Provider resolution --------------------------------------------------------

/**
 * Resolves a "providerId:modelId" ref to batch credentials, or null when the
 * provider isn't batch-capable (only anthropic/openai) or has no usable key.
 * Mirrors the BYOK precedence of registry.resolveApiKey. A null result means
 * the caller must fall back to the live path.
 */
export async function resolveBatchProvider(
  modelRef: string,
  userId: string
): Promise<BatchProvider | null> {
  const { providerId, modelId } = parseModelRef(modelRef)
  const ai = await getSetting("ai")
  const provider = ai?.providers.find((p) => p.id === providerId)
  if (!provider || (provider.type !== "anthropic" && provider.type !== "openai")) return null
  const byok = await db.query.userAiKey.findFirst({
    where: and(eq(userAiKey.userId, userId), eq(userAiKey.providerId, provider.id)),
  })
  const apiKey = byok ? decrypt(byok.encryptedKey) : provider.apiKey
  if (!apiKey) return null
  return { type: provider.type, apiKey, baseUrl: provider.baseUrl, modelId }
}

/** Converts a Zod schema to a JSON Schema for the batch request body. */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return zod.toJSONSchema(schema) as Record<string, unknown>
}

// ---- Anthropic Message Batches --------------------------------------------------

type AnthropicRequest = {
  custom_id: string
  params: {
    model: string
    max_tokens: number
    tools: { name: string; description: string; input_schema: Record<string, unknown> }[]
    tool_choice: { type: "tool"; name: string }
    messages: { role: "user"; content: string }[]
  }
}

/** Builds Anthropic batch requests that force a single tool call whose input is
 *  the structured result (the batch equivalent of `generateObject`). */
export function buildAnthropicRequests(items: BatchItem[], modelId: string): AnthropicRequest[] {
  return items.map((item) => ({
    custom_id: item.customId,
    params: {
      model: modelId,
      max_tokens: item.maxTokens,
      tools: [
        {
          name: TOOL_NAME,
          description: "Return the requested structured result.",
          input_schema: item.jsonSchema,
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [{ role: "user", content: item.prompt }],
    },
  }))
}

type AnthropicResultEntry = {
  custom_id: string
  result?: {
    type: string
    message?: {
      content?: { type: string; input?: unknown }[]
      usage?: { input_tokens?: number; output_tokens?: number }
    }
    error?: { type?: string; message?: string }
  }
}

/** Parses Anthropic batch result entries into the shared BatchResult shape. */
export function parseAnthropicResults(entries: AnthropicResultEntry[]): BatchResult[] {
  return entries.map((entry) => {
    const result = entry.result
    if (!result || result.type !== "succeeded" || !result.message) {
      return {
        customId: entry.custom_id,
        object: null,
        usage: { inputTokens: 0, outputTokens: 0 },
        error: result?.error?.message ?? result?.type ?? "no result",
      }
    }
    const toolUse = (result.message.content ?? []).find((b) => b.type === "tool_use")
    const usage: BatchUsage = {
      inputTokens: result.message.usage?.input_tokens ?? 0,
      outputTokens: result.message.usage?.output_tokens ?? 0,
    }
    return {
      customId: entry.custom_id,
      object: toolUse?.input ?? null,
      usage,
      error: toolUse ? undefined : "no tool_use block in result",
    }
  })
}

// ---- OpenAI Batch ---------------------------------------------------------------

type OpenAiTask = {
  custom_id: string
  method: "POST"
  url: "/v1/chat/completions"
  body: {
    model: string
    max_tokens: number
    messages: { role: "user"; content: string }[]
    response_format: {
      type: "json_schema"
      json_schema: { name: string; schema: Record<string, unknown>; strict: boolean }
    }
  }
}

/** Builds OpenAI batch task lines (one JSONL entry per topic) that request a
 *  json_schema-shaped response (the batch equivalent of `generateObject`). */
export function buildOpenAiTasks(items: BatchItem[], modelId: string): OpenAiTask[] {
  return items.map((item) => ({
    custom_id: item.customId,
    method: "POST",
    url: "/v1/chat/completions",
    body: {
      model: modelId,
      max_tokens: item.maxTokens,
      messages: [{ role: "user", content: item.prompt }],
      response_format: {
        type: "json_schema",
        json_schema: { name: "result", schema: item.jsonSchema, strict: false },
      },
    },
  }))
}

type OpenAiResultLine = {
  custom_id: string
  response?: {
    body?: {
      choices?: { message?: { content?: string } }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
  }
  error?: unknown
}

/** Parses an OpenAI batch output file (JSONL) into the shared BatchResult shape. */
export function parseOpenAiResults(jsonl: string): BatchResult[] {
  const lines = jsonl
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
  return lines.map((line) => {
    const parsed = JSON.parse(line) as OpenAiResultLine
    const body = parsed.response?.body
    const usage: BatchUsage = {
      inputTokens: body?.usage?.prompt_tokens ?? 0,
      outputTokens: body?.usage?.completion_tokens ?? 0,
    }
    const content = body?.choices?.[0]?.message?.content
    if (parsed.error || !content) {
      return {
        customId: parsed.custom_id,
        object: null,
        usage,
        error: parsed.error ? "batch item error" : "no content in response",
      }
    }
    try {
      return { customId: parsed.custom_id, object: JSON.parse(content), usage }
    } catch {
      return { customId: parsed.custom_id, object: null, usage, error: "invalid JSON content" }
    }
  })
}

// ---- Network calls (lazy vendor SDKs) -------------------------------------------

async function anthropicClient(provider: BatchProvider) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk")
  return new Anthropic({
    apiKey: provider.apiKey,
    ...(provider.baseUrl ? { baseURL: provider.baseUrl } : {}),
  })
}

async function openaiClient(provider: BatchProvider) {
  const { default: OpenAI } = await import("openai")
  return new OpenAI({
    apiKey: provider.apiKey,
    ...(provider.baseUrl ? { baseURL: provider.baseUrl } : {}),
  })
}

/** Submits all items as one vendor batch and returns the vendor batch id. */
export async function submitBatch(provider: BatchProvider, items: BatchItem[]): Promise<string> {
  if (provider.type === "anthropic") {
    const client = await anthropicClient(provider)
    const requests = buildAnthropicRequests(items, provider.modelId)
    const batch = await client.messages.batches.create({
      requests: requests as Parameters<typeof client.messages.batches.create>[0]["requests"],
    })
    return batch.id
  }
  const { default: OpenAI, toFile } = await import("openai")
  const client = new OpenAI({
    apiKey: provider.apiKey,
    ...(provider.baseUrl ? { baseURL: provider.baseUrl } : {}),
  })
  const jsonl = buildOpenAiTasks(items, provider.modelId)
    .map((t) => JSON.stringify(t))
    .join("\n")
  const file = await client.files.create({
    file: await toFile(Buffer.from(jsonl), "batch.jsonl"),
    purpose: "batch",
  })
  const batch = await client.batches.create({
    input_file_id: file.id,
    endpoint: "/v1/chat/completions",
    completion_window: "24h",
  })
  return batch.id
}

/** Polls a vendor batch's lifecycle state. */
export async function pollBatch(
  provider: BatchProvider,
  batchRef: string
): Promise<BatchPollStatus> {
  if (provider.type === "anthropic") {
    const client = await anthropicClient(provider)
    const batch = await client.messages.batches.retrieve(batchRef)
    // "ended" means all requests finished (individual items may still have errored).
    return batch.processing_status === "ended" ? "completed" : "processing"
  }
  const client = await openaiClient(provider)
  const batch = await client.batches.retrieve(batchRef)
  if (batch.status === "completed") return "completed"
  if (["failed", "expired", "cancelled", "cancelling"].includes(batch.status)) return "failed"
  return "processing"
}

/** Fetches and parses a completed vendor batch's results. */
export async function fetchBatchResults(
  provider: BatchProvider,
  batchRef: string
): Promise<BatchResult[]> {
  if (provider.type === "anthropic") {
    const client = await anthropicClient(provider)
    const entries: AnthropicResultEntry[] = []
    for await (const entry of await client.messages.batches.results(batchRef)) {
      entries.push(entry as unknown as AnthropicResultEntry)
    }
    return parseAnthropicResults(entries)
  }
  const client = await openaiClient(provider)
  const batch = await client.batches.retrieve(batchRef)
  if (!batch.output_file_id) return []
  const content = await client.files.content(batch.output_file_id)
  return parseOpenAiResults(await content.text())
}
