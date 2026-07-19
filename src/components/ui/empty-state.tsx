import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Shared empty-state: an optional icon, a title, an optional description and an
 * optional action (button / link). Keeps the app's "nothing here yet" surfaces
 * visually consistent instead of ad-hoc bare `<p>` tags (F15).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-4 py-10 text-center",
        className
      )}
    >
      {Icon && (
        <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
          <Icon className="size-5" />
        </span>
      )}
      <p className="text-sm font-medium">{title}</p>
      {description && (
        <p className="text-muted-foreground max-w-sm text-sm">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
