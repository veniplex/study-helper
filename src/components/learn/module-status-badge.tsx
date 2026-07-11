import { useTranslations } from "next-intl"
import type { ModuleStatus } from "@/db/schema/studies"
import { STATUS_STYLES } from "@/lib/module-visuals"
import { cn } from "@/lib/utils"

const LABEL_KEY: Record<ModuleStatus, string> = {
  planned: "statusPlanned",
  active: "statusActive",
  passed: "statusPassed",
  failed: "statusFailed",
}

/** Colored status chip for a module (planned / active / passed / failed). */
export function ModuleStatusBadge({
  status,
  className,
}: {
  status: ModuleStatus
  className?: string
}) {
  const t = useTranslations("studies.module")
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
        className
      )}
    >
      {t(LABEL_KEY[status])}
    </span>
  )
}
