"use client"

import { useTranslations } from "next-intl"
import { Link, usePathname } from "@/i18n/navigation"
import { navItems } from "@/config/nav"
import { ModuleSheet } from "./module-sheet"
import type { StudyContext } from "@/lib/studies/context"
import { cn } from "@/lib/utils"

export function BottomNav({ context }: { context: StudyContext }) {
  const t = useTranslations("nav")
  const pathname = usePathname()
  const items = navItems.filter((i) => i.mobile)

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
      <div
        className="grid h-16 pb-[env(safe-area-inset-bottom)]"
        style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}
      >
        {items.map((item) => {
          if (item.key === "studies") {
            return <ModuleSheet key={item.key} context={context} />
          }
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className={cn("size-5", active && "stroke-[2.25]")} />
              {t(item.key)}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
