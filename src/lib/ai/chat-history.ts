import { z } from "zod"
import type { UIMessage } from "ai"
import { WRITE_TOOL_NAMES } from "./tools"

/**
 * Helpers for the chat route's server-side history handling. The DB is the
 * source of truth for a conversation; the client only contributes its latest
 * message — either a new user turn or the confirmation outcomes for pending
 * write-tool calls.
 */

export const toolOutputSchema = z.object({
  status: z.enum(["executed", "rejected"]),
  label: z.string().max(300).optional(),
  href: z.string().max(500).optional(),
})

type ToolUIPart = {
  type: `tool-${string}`
  toolCallId: string
  state: string
  input?: unknown
  output?: unknown
}

export function isWriteToolPart(
  part: UIMessage["parts"][number]
): part is ToolUIPart & typeof part {
  return (
    typeof part.type === "string" &&
    part.type.startsWith("tool-") &&
    (WRITE_TOOL_NAMES as readonly string[]).includes(part.type.slice(5))
  )
}

/**
 * Copies user-confirmation outcomes (executed/rejected) from the client's
 * version of the last assistant message onto the stored one. Only write-tool
 * outputs are taken — everything else in the stored message stays
 * authoritative, so a client can't rewrite assistant text or tool inputs.
 */
export function mergeToolOutputs(
  stored: UIMessage["parts"],
  client: UIMessage["parts"]
): { parts: UIMessage["parts"]; changed: boolean } {
  const outputsByCallId = new Map<string, unknown>()
  for (const part of client) {
    if (isWriteToolPart(part) && part.state === "output-available") {
      const parsed = toolOutputSchema.safeParse(part.output)
      if (parsed.success) outputsByCallId.set(part.toolCallId, parsed.data)
    }
  }
  let changed = false
  const parts = stored.map((part) => {
    if (isWriteToolPart(part) && part.state !== "output-available") {
      const output = outputsByCallId.get(part.toolCallId)
      if (output) {
        changed = true
        return { ...part, state: "output-available", output } as UIMessage["parts"][number]
      }
    }
    return part
  })
  return { parts, changed }
}
