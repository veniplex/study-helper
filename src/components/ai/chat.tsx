"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { ArrowUp, Loader2, Sparkles } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Markdown } from "./markdown"
import { cn } from "@/lib/utils"

export function Chat({
  conversationId,
  initialMessages,
  models,
  initialModel,
}: {
  conversationId: string
  initialMessages: UIMessage[]
  models: { ref: string; label: string }[]
  initialModel: string | null
}) {
  const t = useTranslations("ai")
  const [model, setModel] = React.useState(initialModel ?? models[0]?.ref ?? "")
  const [input, setInput] = React.useState("")
  const bottomRef = React.useRef<HTMLDivElement>(null)

  const { messages, sendMessage, status, error } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/ai/chat",
      body: () => ({ conversationId, model }),
    }),
  })

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const busy = status === "submitted" || status === "streaming"

  function submit() {
    const text = input.trim()
    if (!text || busy || !model) return
    setInput("")
    void sendMessage({ text })
  }

  return (
    <div className="flex h-[calc(100dvh-10rem)] flex-col md:h-[calc(100dvh-9rem)]">
      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-sm">
            <Sparkles className="size-6" />
            {t("emptyChat")}
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "max-w-[85%] rounded-lg px-3.5 py-2.5",
              m.role === "user"
                ? "bg-primary text-primary-foreground ml-auto w-fit whitespace-pre-wrap text-sm"
                : "bg-muted/50 mr-auto"
            )}
          >
            {m.role === "user" ? (
              m.parts
                .filter((p): p is { type: "text"; text: string } => p.type === "text")
                .map((p) => p.text)
                .join("")
            ) : (
              <Markdown>
                {m.parts
                  .filter((p): p is { type: "text"; text: string } => p.type === "text")
                  .map((p) => p.text)
                  .join("")}
              </Markdown>
            )}
          </div>
        ))}
        {status === "submitted" && (
          <div className="bg-muted/50 mr-auto flex w-fit items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm">
            <Loader2 className="size-3.5 animate-spin" />
            {t("thinking")}
          </div>
        )}
        {error && (
          <p className="text-destructive text-sm">
            {t("error")}: {error.message}
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="space-y-2 border-t pt-3">
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
          <Button size="icon" onClick={submit} disabled={busy || !input.trim() || !model}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
          </Button>
        </div>
        <Select value={model} onValueChange={(v) => setModel(v ?? "")}>
          <SelectTrigger className="h-7 w-fit gap-1 border-none px-2 text-xs shadow-none">
            <SelectValue>
              {models.find((m) => m.ref === model)?.label ?? t("noModel")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.ref} value={m.ref}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
