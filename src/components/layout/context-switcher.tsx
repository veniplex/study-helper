"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Link, useRouter } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { setActiveContext } from "@/app/[locale]/(app)/context-actions"
import { ProgramManageDialog } from "@/components/studies/program-manage-dialog"
import type { StudyContext } from "@/lib/studies/context"

export function ContextSwitcher({ context }: { context: StudyContext }) {
  const t = useTranslations("context")
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  const active = context.programs.find((p) => p.id === context.activeProgram?.id)

  async function change(programId: string) {
    setPending(true)
    try {
      await setActiveContext({ programId })
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  if (context.programs.length === 0) {
    return (
      <div className="space-y-2 border-b px-4 py-3">
        <p className="text-muted-foreground text-xs">{t("noProgram")}</p>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          nativeButton={false}
          render={<Link href="/studies" />}
        >
          <Plus className="size-3.5" />
          {t("createProgram")}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 border-b px-4 py-3">
      <Select
        value={context.activeProgram?.id ?? ""}
        onValueChange={(v) => v && change(v)}
        disabled={pending}
      >
        <SelectTrigger className="h-auto w-full py-1.5 text-xs" aria-label={t("program")}>
          <SelectValue>
            <span className="flex min-w-0 flex-col text-left">
              <span className="truncate font-medium">{active?.name ?? t("program")}</span>
              {active && (active.degreeType || active.institution) && (
                <span className="text-muted-foreground truncate text-[11px]">
                  {[active.degreeType, active.institution].filter(Boolean).join(" · ")}
                </span>
              )}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {context.programs.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{p.name}</span>
                {(p.degreeType || p.institution) && (
                  <span className="text-muted-foreground truncate text-xs">
                    {[p.degreeType, p.institution].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ProgramManageDialog programs={context.programs} />
    </div>
  )
}
