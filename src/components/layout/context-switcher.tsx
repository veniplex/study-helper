"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { setActiveContext } from "@/app/[locale]/(app)/context-actions"
import type { StudyContext } from "@/lib/studies/context"

export function ContextSwitcher({ context }: { context: StudyContext }) {
  const t = useTranslations("context")
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  async function change(programId: string, semesterId: string | null) {
    setPending(true)
    try {
      await setActiveContext({ programId, semesterId })
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  if (context.programs.length === 0) return null

  return (
    <div className="space-y-1.5 border-b p-3">
      <Select
        value={context.activeProgram?.id ?? ""}
        onValueChange={(v) => v && change(v, null)}
        disabled={pending}
      >
        <SelectTrigger className="h-8 w-full text-xs" aria-label={t("program")}>
          <SelectValue>{context.activeProgram?.name ?? t("program")}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {context.programs.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {context.semesters.length > 0 && (
        <Select
          value={context.activeSemester?.id ?? ""}
          onValueChange={(v) =>
            v && context.activeProgram && change(context.activeProgram.id, v)
          }
          disabled={pending}
        >
          <SelectTrigger className="h-8 w-full text-xs" aria-label={t("semester")}>
            <SelectValue>{context.activeSemester?.name ?? t("semester")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {context.semesters.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
