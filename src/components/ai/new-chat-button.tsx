"use client"

import * as React from "react"
import {
  BookOpenCheck,
  GraduationCap,
  Lightbulb,
  Loader2,
  MessageSquare,
  PenLine,
  Plus,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createConversation } from "@/app/[locale]/(app)/ai/actions"
import type { ChatMode } from "@/lib/ai/modes"

const MODE_ICONS = {
  general: MessageSquare,
  "homework-hints": Lightbulb,
  "homework-solution": BookOpenCheck,
  writing: PenLine,
  thesis: GraduationCap,
} as const

export function NewChatButton({ moduleId }: { moduleId?: string }) {
  const t = useTranslations("ai")
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  async function start(mode: ChatMode) {
    setPending(true)
    try {
      const { id } = await createConversation(moduleId ?? null, mode)
      router.push(`/ai/${id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      setPending(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button disabled={pending} />}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        {t("newChat")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {(Object.keys(MODE_ICONS) as ChatMode[]).map((mode) => {
          const Icon = MODE_ICONS[mode]
          return (
            <DropdownMenuItem key={mode} onClick={() => start(mode)}>
              <Icon className="size-4" />
              <div className="flex flex-col">
                <span>{t(`modes.${mode}.label`)}</span>
                <span className="text-muted-foreground text-xs">
                  {t(`modes.${mode}.description`)}
                </span>
              </div>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
