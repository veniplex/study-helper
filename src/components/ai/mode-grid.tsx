"use client"

import * as React from "react"
import {
  BookOpenCheck,
  GraduationCap,
  Lightbulb,
  Loader2,
  MessageSquare,
  PenLine,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { createConversation } from "@/app/[locale]/(app)/ai/actions"
import type { ChatMode } from "@/lib/ai/modes"
import { cn } from "@/lib/utils"

const MODES: { mode: ChatMode; icon: typeof MessageSquare }[] = [
  { mode: "general", icon: MessageSquare },
  { mode: "homework-hints", icon: Lightbulb },
  { mode: "homework-solution", icon: BookOpenCheck },
  { mode: "writing", icon: PenLine },
  { mode: "thesis", icon: GraduationCap },
]

/** Tile grid on the AI hub: one click starts a conversation in the given mode. */
export function ModeGrid() {
  const t = useTranslations("ai")
  const router = useRouter()
  const [pending, setPending] = React.useState<ChatMode | null>(null)

  async function start(mode: ChatMode) {
    setPending(mode)
    try {
      const { id } = await createConversation(null, mode)
      router.push(`/ai/${id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      setPending(null)
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {MODES.map(({ mode, icon: Icon }) => (
        <button
          key={mode}
          type="button"
          disabled={pending !== null}
          onClick={() => start(mode)}
          className={cn(
            "hover:border-primary/50 hover:bg-accent/40 flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors",
            pending !== null && "opacity-60"
          )}
        >
          <span className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-md">
            {pending === mode ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Icon className="size-4" />
            )}
          </span>
          <span className="text-sm font-medium">{t(`modes.${mode}.label`)}</span>
          <span className="text-muted-foreground text-xs">{t(`modes.${mode}.description`)}</span>
        </button>
      ))}
    </div>
  )
}
