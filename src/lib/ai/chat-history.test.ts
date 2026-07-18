import { describe, expect, it } from "vitest"
import type { UIMessage } from "ai"
import { mergeToolOutputs } from "./chat-history"

type Parts = UIMessage["parts"]

const pendingToolCall = {
  type: "tool-createDeckWithCards",
  toolCallId: "call-1",
  state: "input-available",
  input: { name: "Deck", cards: [{ front: "f", back: "b" }] },
} as unknown as Parts[number]

describe("mergeToolOutputs", () => {
  it("adopts a valid confirmation outcome for a pending write-tool call", () => {
    const stored: Parts = [{ type: "text", text: "creating…" }, pendingToolCall]
    const client: Parts = [
      {
        ...pendingToolCall,
        state: "output-available",
        output: { status: "executed", label: "Deck (1)" },
      } as unknown as Parts[number],
    ]
    const { parts, changed } = mergeToolOutputs(stored, client)
    expect(changed).toBe(true)
    const tool = parts[1] as { state: string; output: unknown }
    expect(tool.state).toBe("output-available")
    expect(tool.output).toEqual({ status: "executed", label: "Deck (1)" })
  })

  it("keeps stored text and inputs authoritative", () => {
    const stored: Parts = [{ type: "text", text: "original" }, pendingToolCall]
    const client: Parts = [
      { type: "text", text: "spoofed" },
      {
        ...pendingToolCall,
        input: { name: "Spoofed" },
        state: "output-available",
        output: { status: "rejected" },
      } as unknown as Parts[number],
    ]
    const { parts } = mergeToolOutputs(stored, client)
    expect((parts[0] as { text: string }).text).toBe("original")
    expect((parts[1] as { input: { name: string } }).input.name).toBe("Deck")
  })

  it("ignores malformed outputs and reports no change", () => {
    const stored: Parts = [pendingToolCall]
    const client: Parts = [
      {
        ...pendingToolCall,
        state: "output-available",
        output: { status: "hacked", extra: "x" },
      } as unknown as Parts[number],
    ]
    const { parts, changed } = mergeToolOutputs(stored, client)
    expect(changed).toBe(false)
    expect((parts[0] as { state: string }).state).toBe("input-available")
  })

  it("never downgrades an already-resolved tool call", () => {
    const resolved = {
      ...pendingToolCall,
      state: "output-available",
      output: { status: "executed", label: "done" },
    } as unknown as Parts[number]
    const client: Parts = [
      { ...pendingToolCall, state: "output-available", output: { status: "rejected" } } as unknown as Parts[number],
    ]
    const { parts, changed } = mergeToolOutputs([resolved], client)
    expect(changed).toBe(false)
    expect((parts[0] as { output: { status: string } }).output.status).toBe("executed")
  })
})
