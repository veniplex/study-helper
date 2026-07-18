"use client"

import { useTranslations } from "next-intl"
import { Link, usePathname } from "@/i18n/navigation"
import { visibleModuleTabs } from "@/config/module-tabs"
import { cn } from "@/lib/utils"

export function ModuleTabs({
  basePath,
  aiAvailable,
  isThesis,
}: {
  basePath: string
  aiAvailable: boolean
  /** Thesis modules get an extra tab linking to the thesis planner. */
  isThesis?: boolean
}) {
  const t = useTranslations("moduleTabs")
  const pathname = usePathname()

  const visible = visibleModuleTabs(aiAvailable)

  return (
    <nav className="flex gap-1 overflow-x-auto border-b pb-px">
      {visible.map((tab) => {
        const href = `${basePath}${tab.segment}`
        const active = tab.segment === "" ? pathname === basePath : pathname.startsWith(href)
        return (
          <Link
            key={tab.key}
            href={href}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent"
            )}
          >
            {t(tab.key)}
          </Link>
        )
      })}
      {isThesis && (
        <Link
          href="/thesis"
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            pathname.startsWith("/thesis")
              ? "border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground border-transparent"
          )}
        >
          {t("thesisPlanner")}
        </Link>
      )}
    </nav>
  )
}
