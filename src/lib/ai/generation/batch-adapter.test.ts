import { beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

// Neutralise server-only and mock the heavy server deps so the module imports in
// a plain unit-test context. The pure builders/parsers don't touch these; only
// resolveBatchProvider does (via the getSetting / userAiKey mocks below).
vi.mock("server-only", () => ({}))

const getSettingMock = vi.fn()
const findFirstMock = vi.fn().mockResolvedValue(undefined)
vi.mock("@/lib/settings", () => ({ getSetting: (key: string) => getSettingMock(key) }))
vi.mock("@/db", () => ({
  db: { query: { userAiKey: { findFirst: (...args: unknown[]) => findFirstMock(...args) } } },
}))
vi.mock("@/db/schema", () => ({ userAiKey: { userId: {}, providerId: {} } }))
vi.mock("@/lib/crypto", () => ({ decrypt: (s: string) => `decrypted:${s}` }))
vi.mock("@/lib/ai/registry", () => ({
  parseModelRef: (ref: string) => {
    const i = ref.indexOf(":")
    return { providerId: ref.slice(0, i), modelId: ref.slice(i + 1) }
  },
}))

import {
  buildAnthropicRequests,
  buildOpenAiTasks,
  parseAnthropicResults,
  parseOpenAiResults,
  resolveBatchProvider,
  toJsonSchema,
  toStrictJsonSchema,
  type BatchItem,
} from "./batch-adapter"

const items: BatchItem[] = [
  { customId: "topic-1", prompt: "PROMPT", jsonSchema: { type: "object" }, maxTokens: 2000 },
]

describe("toJsonSchema", () => {
  it("converts a Zod object schema to JSON Schema", () => {
    const schema = z.object({ cards: z.array(z.object({ front: z.string(), back: z.string() })) })
    const json = toJsonSchema(schema)
    expect(json.type).toBe("object")
    expect(json).toHaveProperty("properties.cards.type", "array")
  })
})

describe("buildAnthropicRequests", () => {
  it("forces a single tool call carrying the JSON schema", () => {
    const reqs = buildAnthropicRequests(items, "claude-x")
    expect(reqs).toHaveLength(1)
    expect(reqs[0].custom_id).toBe("topic-1")
    expect(reqs[0].params.model).toBe("claude-x")
    expect(reqs[0].params.max_tokens).toBe(2000)
    expect(reqs[0].params.tool_choice).toEqual({ type: "tool", name: "emit_result" })
    expect(reqs[0].params.tools[0].input_schema).toEqual({ type: "object" })
    expect(reqs[0].params.messages).toEqual([{ role: "user", content: "PROMPT" }])
  })
})

describe("buildOpenAiTasks", () => {
  it("builds strict json_schema chat-completion tasks", () => {
    const tasks = buildOpenAiTasks(items, "gpt-x")
    expect(tasks[0].custom_id).toBe("topic-1")
    expect(tasks[0].method).toBe("POST")
    expect(tasks[0].url).toBe("/v1/chat/completions")
    expect(tasks[0].body.model).toBe("gpt-x")
    // Newer OpenAI models reject max_tokens.
    expect(tasks[0].body.max_completion_tokens).toBe(2000)
    expect(tasks[0].body.response_format.json_schema.strict).toBe(true)
    expect(tasks[0].body.messages).toEqual([{ role: "user", content: "PROMPT" }])
  })
})

describe("toStrictJsonSchema", () => {
  it("requires all properties, forbids extras and strips unsupported keywords", () => {
    const strict = toStrictJsonSchema(
      toJsonSchema(
        z.object({
          cards: z
            .array(z.object({ front: z.string(), back: z.string().default("") }))
            .max(60),
        })
      )
    )
    expect(strict.required).toEqual(["cards"])
    expect(strict.additionalProperties).toBe(false)
    const cards = (strict.properties as Record<string, Record<string, unknown>>).cards
    expect(cards.maxItems).toBeUndefined()
    const item = cards.items as Record<string, unknown>
    expect(item.required).toEqual(["front", "back"])
    expect(item.additionalProperties).toBe(false)
    expect((item.properties as Record<string, Record<string, unknown>>).back.default).toBeUndefined()
  })
})

describe("parseAnthropicResults", () => {
  it("extracts the tool_use input and usage for succeeded items, flags errors", () => {
    const parsed = parseAnthropicResults([
      {
        custom_id: "topic-1",
        result: {
          type: "succeeded",
          message: {
            content: [
              { type: "text" },
              { type: "tool_use", input: { cards: [{ front: "a", back: "b" }] } },
            ],
            usage: { input_tokens: 10, output_tokens: 20 },
          },
        },
      },
      { custom_id: "topic-2", result: { type: "errored", error: { message: "bad request" } } },
    ])
    expect(parsed[0]).toEqual({
      customId: "topic-1",
      object: { cards: [{ front: "a", back: "b" }] },
      usage: { inputTokens: 10, outputTokens: 20 },
      error: undefined,
    })
    expect(parsed[1].object).toBeNull()
    expect(parsed[1].error).toBe("bad request")
    expect(parsed[1].usage).toEqual({ inputTokens: 0, outputTokens: 0 })
  })
})

describe("parseOpenAiResults", () => {
  it("parses JSONL output lines, tolerating errored/empty lines", () => {
    const jsonl = [
      JSON.stringify({
        custom_id: "topic-1",
        response: {
          body: {
            choices: [
              { message: { content: JSON.stringify({ cards: [{ front: "a", back: "b" }] }) } },
            ],
            usage: { prompt_tokens: 5, completion_tokens: 7 },
          },
        },
      }),
      "",
      JSON.stringify({ custom_id: "topic-2", error: { message: "boom" } }),
    ].join("\n")
    const parsed = parseOpenAiResults(jsonl)
    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toEqual({
      customId: "topic-1",
      object: { cards: [{ front: "a", back: "b" }] },
      usage: { inputTokens: 5, outputTokens: 7 },
    })
    expect(parsed[1].object).toBeNull()
    expect(parsed[1].error).toBe("batch item error")
  })
})

describe("resolveBatchProvider", () => {
  beforeEach(() => {
    getSettingMock.mockReset()
    findFirstMock.mockReset()
    findFirstMock.mockResolvedValue(undefined)
  })

  it("resolves an Anthropic provider with its admin key", async () => {
    getSettingMock.mockResolvedValue({
      providers: [{ id: "anthropic", type: "anthropic", apiKey: "sk-admin", models: [] }],
    })
    const provider = await resolveBatchProvider("anthropic:claude-x", "user-1")
    expect(provider).toEqual({
      type: "anthropic",
      apiKey: "sk-admin",
      baseUrl: undefined,
      modelId: "claude-x",
    })
  })

  it("prefers a per-user BYOK key over the admin key", async () => {
    getSettingMock.mockResolvedValue({
      providers: [{ id: "openai", type: "openai", apiKey: "sk-admin", models: [] }],
    })
    findFirstMock.mockResolvedValue({ encryptedKey: "enc" })
    const provider = await resolveBatchProvider("openai:gpt-x", "user-1")
    expect(provider?.apiKey).toBe("decrypted:enc")
  })

  it("returns null for a non-batch provider type", async () => {
    getSettingMock.mockResolvedValue({
      providers: [{ id: "google", type: "google", apiKey: "k", models: [] }],
    })
    expect(await resolveBatchProvider("google:gemini", "user-1")).toBeNull()
  })

  it("returns null when the provider has no usable key", async () => {
    getSettingMock.mockResolvedValue({
      providers: [{ id: "anthropic", type: "anthropic", models: [] }],
    })
    expect(await resolveBatchProvider("anthropic:claude-x", "user-1")).toBeNull()
  })
})
