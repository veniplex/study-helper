"use client"

import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { deletePlanItem, togglePlanItem } from "@/app/[locale]/(app)/learn/actions"
import { DeleteButton } from "@/components/studies/delete-button"
import { cn } from "@/lib/utils"

export function PlanItemRow({
  item,
}: {
  item: {
    id: string
    title: string
    description: string | null
    scheduledDate: string | null
    durationMinutes: number | null
    done: boolean
  }
}) {
  const t = useTranslations("learn.plans")
  const router = useRouter()

  async function onToggle() {
    try {
      await togglePlanItem(item.id, !item.done)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <li className="rounded-md border px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={item.done}
          onChange={onToggle}
          className="accent-primary size-4 cursor-pointer"
        />
        <span className={cn("font-medium", item.done && "text-muted-foreground line-through")}>
          {item.title}
        </span>
        <span className="text-muted-foreground ml-auto text-xs">
          {item.scheduledDate ?? ""}
          {item.durationMinutes ? ` · ${item.durationMinutes} min` : ""}
        </span>
        <DeleteButton action={deletePlanItem.bind(null, item.id)} />
      </div>
      {item.description && (
        <p className="text-muted-foreground mt-1 pl-6.5 text-xs whitespace-pre-wrap">
          {item.description}
        </p>
      )}
      <span className="sr-only">{t("items")}</span>
    </li>
  )
}
