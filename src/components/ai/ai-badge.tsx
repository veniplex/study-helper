import { Sparkles } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

/**
 * Marks content created by the AI. Use `iconOnly` in dense lists; the full
 * badge shows the "AI" label with a tooltip-style title.
 */
export function AiBadge({
  className,
  iconOnly = false,
}: {
  className?: string
  iconOnly?: boolean
}) {
  const t = useTranslations("common")
  return (
    <span
      title={t("aiGeneratedHint")}
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600 dark:text-violet-300",
        className
      )}
    >
      <Sparkles className="size-3" />
      {!iconOnly && t("aiGenerated")}
    </span>
  )
}
