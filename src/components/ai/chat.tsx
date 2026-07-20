"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai"
import {
  ArrowUp,
  Check,
  FileSearch,
  Loader2,
  RefreshCw,
  Sparkles,
  Square,
  Wrench,
  X,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import { executeAiTool } from "@/app/[locale]/(app)/ai/actions"
import { WRITE_TOOL_NAMES } from "@/lib/ai/tools"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Markdown } from "./markdown"
import { VoiceInputButton } from "./voice-input-button"
import { describePageContext, usePageContext } from "./page-context"
import { cn } from "@/lib/utils"

/**
 * The fields shown on each write-tool confirmation card, in display order.
 * A whitelist keeps opaque ids (goalId, correctIndex, the moduleId uuid) and
 * bulky payloads (raw card/question arrays) out of the card — only the fields a
 * user needs to confirm what will be created are rendered (F7).
 */
const CONFIRM_FIELDS: Record<string, readonly string[]> = {
  createDeckWithCards: ["name", "moduleId", "cards"],
  createQuizWithQuestions: ["title", "moduleId", "questions"],
  createCalendarEvent: ["title", "type", "startsAt", "endsAt", "location", "moduleId"],
  createAssignment: ["title", "moduleId", "dueDate", "pointsMax"],
}

const EVENT_TYPES = ["exam", "deadline", "lecture", "other"] as const

/**
 * Builds the translated, id-free rows for a write-tool confirmation card.
 * `moduleId` is resolved to the module NAME via `resolveModuleName` and hidden
 * when it can't be resolved; arrays collapse to a count; the event `type` and
 * field labels are localized (F7).
 */
function buildConfirmRows(
  toolName: string,
  input: unknown,
  resolveModuleName: (id: string) => string | undefined,
  t: (key: string) => string
): { label: string; value: string }[] {
  if (!input || typeof input !== "object") return []
  const values = input as Record<string, unknown>
  const rows: { label: string; value: string }[] = []
  for (const key of CONFIRM_FIELDS[toolName] ?? []) {
    const v = values[key]
    if (v == null || v === "") continue
    if (key === "moduleId") {
      const name = resolveModuleName(String(v))
      if (!name) continue
      rows.push({ label: t("tool.fields.module"), value: name })
    } else if (Array.isArray(v)) {
      rows.push({ label: t(`tool.fields.${key}`), value: String(v.length) })
    } else if (key === "type") {
      const type = String(v)
      const value = (EVENT_TYPES as readonly string[]).includes(type)
        ? t(`tool.eventTypes.${type}`)
        : type
      rows.push({ label: t("tool.fields.type"), value })
    } else {
      const str = String(v)
      rows.push({ label: t(`tool.fields.${key}`), value: str.length > 120 ? str.slice(0, 120) + "…" : str })
    }
  }
  return rows
}

type ToolOutput =
  | { status: "executed"; label: string; href?: string }
  | { status: "rejected" }

type SourceRef = { index: number; source: string; materialId: string }

/** Collects the searchMaterials results of a message into deduped source refs. */
function collectSources(parts: UIMessage["parts"]): SourceRef[] {
  const seen = new Map<string, SourceRef>()
  for (const part of parts) {
    if (part.type !== "tool-searchMaterials") continue
    const p = part as { state?: string; output?: unknown }
    if (p.state !== "output-available" || !Array.isArray(p.output)) continue
    for (const hit of p.output) {
      const h = hit as { index?: number; source?: string; materialId?: string }
      if (typeof h.index !== "number" || typeof h.materialId !== "string" || !h.source) continue
      const existing = seen.get(h.materialId)
      if (!existing || h.index < existing.index) {
        seen.set(h.materialId, { index: h.index, source: h.source, materialId: h.materialId })
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.index - b.index)
}

/** Numbered, clickable source chips below an assistant answer. */
function SourceChips({ parts }: { parts: UIMessage["parts"] }) {
  const t = useTranslations("ai")
  const sources = collectSources(parts)
  if (sources.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1">
      <span className="text-muted-foreground text-xs">{t("sources")}:</span>
      {sources.map((s) => (
        <Link
          key={s.materialId}
          href={`/materials/${s.materialId}`}
          className="text-muted-foreground hover:text-foreground hover:border-primary/50 max-w-56 truncate rounded-full border px-2 py-0.5 text-xs transition-colors"
        >
          [{s.index}] {s.source}
        </Link>
      ))}
    </div>
  )
}

/** True when the message contains an executed write tool (side effect exists). */
function hasExecutedWriteTool(parts: UIMessage["parts"]): boolean {
  return parts.some((part) => {
    if (!part.type.startsWith("tool-")) return false
    if (!WRITE_TOOL_NAMES.includes(part.type.slice(5) as (typeof WRITE_TOOL_NAMES)[number])) {
      return false
    }
    const p = part as { state?: string; output?: unknown }
    return (
      p.state === "output-available" &&
      (p.output as { status?: string } | undefined)?.status === "executed"
    )
  })
}

function ToolCard({
  toolName,
  part,
  conversationId,
  resolveModuleName,
  onResolve,
}: {
  toolName: string
  part: { state: string; input?: unknown; output?: unknown }
  conversationId: string
  resolveModuleName: (id: string) => string | undefined
  onResolve: (output: ToolOutput) => void
}) {
  const t = useTranslations("ai")
  const [pending, setPending] = React.useState(false)

  const resolvedOutput =
    part.state === "output-available" ? (part.output as ToolOutput) : null

  async function run() {
    setPending(true)
    try {
      const result = await executeAiTool(toolName, part.input, conversationId)
      onResolve({ status: "executed", label: result.label, href: result.href })
    } catch (error) {
      onResolve({ status: "rejected" })
      throw error
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="rounded-lg border px-3.5 py-2.5 text-sm">
      <p className="flex items-center gap-1.5 font-medium">
        <Wrench className="size-3.5" />
        {t(`tool.labels.${toolName}`)}
      </p>
      {part.state !== "output-available" && (
        <dl className="text-muted-foreground mt-1.5 space-y-0.5 text-xs">
          {buildConfirmRows(toolName, part.input, resolveModuleName, t).map(({ label, value }) => (
            <div key={label} className="flex gap-1.5">
              <dt className="shrink-0 font-medium">{label}:</dt>
              <dd className="min-w-0 truncate">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {resolvedOutput ? (
        <p
          className={cn(
            "mt-1.5 flex items-center gap-1.5 text-xs",
            resolvedOutput.status === "executed"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-muted-foreground"
          )}
        >
          {resolvedOutput.status === "executed" ? (
            <>
              <Check className="size-3.5" />
              {t("tool.executed", { label: resolvedOutput.label })}
              {resolvedOutput.href && (
                <Link href={resolvedOutput.href} className="underline underline-offset-2">
                  {t("tool.open")}
                </Link>
              )}
            </>
          ) : (
            <>
              <X className="size-3.5" />
              {t("tool.rejected")}
            </>
          )}
        </p>
      ) : part.state === "input-available" ? (
        <div className="mt-2 flex gap-2">
          <Button size="sm" disabled={pending} onClick={() => void run()}>
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            {t("tool.run")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => onResolve({ status: "rejected" })}
          >
            {t("tool.reject")}
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground mt-1.5 flex items-center gap-1.5 text-xs">
          <Loader2 className="size-3 animate-spin" />
        </p>
      )}
    </div>
  )
}

export function Chat({
  conversationId,
  initialMessages,
  model: modelProp,
  className,
  suggestions,
}: {
  conversationId: string
  initialMessages: UIMessage[]
  /** Fixed chat model reference (no user-facing switcher). */
  model: string | null
  className?: string
  /** Prompt suggestions shown as pills while the chat is empty. */
  suggestions?: string[]
}) {
  const t = useTranslations("ai")
  const locale = useLocale()
  const model = modelProp ?? ""
  const [input, setInput] = React.useState("")
  const bottomRef = React.useRef<HTMLDivElement>(null)

  const pageContext = usePageContext()
  // Resolve a write-tool's moduleId to a human name for the confirmation card,
  // so it never shows a raw uuid (F7). The current page's module is the only
  // reliable client-side lookup; an unknown id resolves to undefined and the
  // row is hidden rather than exposing the id.
  const resolveModuleName = React.useCallback(
    (id: string): string | undefined =>
      pageContext?.moduleId && id === pageContext.moduleId ? pageContext.moduleName : undefined,
    [pageContext]
  )

  // Auto-continued requests (after tool confirmation) go through the transport
  // body; per-send bodies are merged on top for regular sends. A stable holder
  // object (updated in an effect) lets the transport read the latest values at
  // request time.
  const bodyRef = React.useRef({ conversationId, model, pageContext: "", locale })
  React.useEffect(() => {
    bodyRef.current = {
      conversationId,
      model,
      pageContext: describePageContext(pageContext) ?? "",
      locale,
    }
  })
  const [transport] = React.useState(
    // The body callback runs at request time, not during render.
    // eslint-disable-next-line react-hooks/refs
    () =>
      new DefaultChatTransport({
        api: "/api/ai/chat",
        body: () => bodyRef.current,
      })
  )

  const { messages, sendMessage, status, error, addToolResult, stop, regenerate } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  })

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const busy = status === "submitted" || status === "streaming"

  function send(text: string) {
    if (!text || busy || !model) return
    void sendMessage(
      { text },
      {
        body: {
          conversationId,
          model,
          pageContext: describePageContext(pageContext),
          locale,
        },
      }
    )
  }

  function submit() {
    const text = input.trim()
    if (!text) return
    setInput("")
    send(text)
  }

  return (
    // Height comes from the parent (dock panel / fullscreen container).
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 px-2 text-sm">
            <Sparkles className="size-6" />
            {t("emptyChat")}
            {suggestions && suggestions.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5 pt-1">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="hover:border-primary/50 hover:text-foreground rounded-full border px-3 py-1 text-xs transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div
              key={m.id}
              className="bg-primary text-primary-foreground ml-auto w-fit max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm whitespace-pre-wrap"
            >
              {m.parts
                .filter((p): p is { type: "text"; text: string } => p.type === "text")
                .map((p) => p.text)
                .join("")}
            </div>
          ) : (
            <div key={m.id} className="group/msg mr-auto max-w-[85%] space-y-2">
              {m.parts.map((part, i) => {
                if (part.type === "text") {
                  return (
                    <div key={i} className="bg-muted/50 rounded-lg px-3.5 py-2.5">
                      <Markdown>{part.text}</Markdown>
                    </div>
                  )
                }
                if (part.type === "tool-searchMaterials" || part.type === "tool-getContext") {
                  const label =
                    part.type === "tool-searchMaterials"
                      ? t("tool.searchedMaterials", {
                          query:
                            (part.input as { query?: string } | undefined)?.query ?? "…",
                        })
                      : t("tool.usedContext")
                  return (
                    <p
                      key={i}
                      className="text-muted-foreground flex items-center gap-1.5 px-1 text-xs"
                    >
                      <FileSearch className="size-3" />
                      {label}
                    </p>
                  )
                }
                if (
                  part.type.startsWith("tool-") &&
                  WRITE_TOOL_NAMES.includes(
                    part.type.slice(5) as (typeof WRITE_TOOL_NAMES)[number]
                  )
                ) {
                  const toolPart = part as {
                    type: string
                    toolCallId: string
                    state: string
                    input?: unknown
                    output?: unknown
                  }
                  return (
                    <ToolCard
                      key={toolPart.toolCallId}
                      toolName={part.type.slice(5)}
                      part={toolPart}
                      conversationId={conversationId}
                      resolveModuleName={resolveModuleName}
                      onResolve={(output) =>
                        void addToolResult({
                          tool: part.type.slice(5),
                          toolCallId: toolPart.toolCallId,
                          output,
                        })
                      }
                    />
                  )
                }
                return null
              })}
              <SourceChips parts={m.parts} />
              {m.id === messages.at(-1)?.id &&
                status === "ready" &&
                !hasExecutedWriteTool(m.parts) && (
                  <button
                    type="button"
                    onClick={() => void regenerate()}
                    className="text-muted-foreground hover:text-foreground flex items-center gap-1 px-1 text-xs opacity-0 transition-opacity group-hover/msg:opacity-100 focus-visible:opacity-100"
                  >
                    <RefreshCw className="size-3" />
                    {t("regenerate")}
                  </button>
                )}
            </div>
          )
        )}
        {status === "submitted" && (
          <div className="bg-muted/50 mr-auto flex w-fit items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm">
            <Loader2 className="size-3.5 animate-spin" />
            {t("thinking")}
          </div>
        )}
        {error && (
          <p className="text-destructive text-sm">
            {/* Server categorizes stream errors as AI_ERROR:<code>; anything
                else stays generic so provider internals never reach the UI. */}
            {error.message === "AI_ERROR:no-key" ? (
              <>
                {t("errorNoKey")}{" "}
                <Link href="/settings" className="underline underline-offset-2">
                  {t("errorNoKeyCta")}
                </Link>
              </>
            ) : error.message === "AI_ERROR:key-decrypt" ? (
              <>
                {t("errorKeyDecrypt")}{" "}
                <Link href="/settings" className="underline underline-offset-2">
                  {t("errorNoKeyCta")}
                </Link>
              </>
            ) : error.message === "AI_ERROR:auth" ? (
              t("errorAuth")
            ) : error.message === "AI_ERROR:model" ? (
              t("errorModel")
            ) : error.message === "AI_ERROR:rate-limit" ||
              error.message.toLowerCase().includes("limit") ? (
              t("errorLimit")
            ) : (
              t("errorGeneric")
            )}
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t pt-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={t("placeholder")}
            rows={2}
            className="max-h-40 flex-1 resize-none"
          />
          <VoiceInputButton
            disabled={busy}
            onTranscript={(text) => setInput((v) => (v ? `${v} ${text}` : text))}
          />
          {busy ? (
            // Streaming: the send slot becomes a stop button. Note the server
            // deliberately drains the stream for crash-safe persistence, so the
            // DB keeps the full answer; regenerate removes it if unwanted.
            <Button size="icon" variant="outline" onClick={() => void stop()} aria-label={t("stop")}>
              <Square className="size-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={submit}
              disabled={!input.trim() || !model}
              aria-label={t("send")}
            >
              <ArrowUp className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
