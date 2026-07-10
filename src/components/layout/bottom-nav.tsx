"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Link, usePathname } from "@/i18n/navigation"
import { navItems } from "@/config/nav"
import { CHAT_OPEN_EVENT } from "@/components/ai/chat-dock"
import { ModuleSheet } from "./module-sheet"
import type { StudyContext } from "@/lib/studies/context"
import { cn } from "@/lib/utils"

export function BottomNav({ context }: { context: StudyContext }) {
  const t = useTranslations("nav")
  const pathname = usePathname()
  const items = navItems.filter((i) => i.mobile)

  const linkClass = (active: boolean) =>
    cn(
      "flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
      active ? "text-primary" : "text-muted-foreground hover:text-foreground"
    )

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
      <div
        className="grid h-16 pb-[env(safe-area-inset-bottom)]"
        style={{ gridTemplateColumns: `repeat(${items.length + 1}, 1fr)` }}
      >
        {items.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          const link =
            item.key === "ai" ? (
              <button
                key={item.key}
                type="button"
                className={linkClass(false)}
                onClick={() => window.dispatchEvent(new Event(CHAT_OPEN_EVENT))}
              >
                <item.icon className="size-5" />
                {t(item.key)}
              </button>
            ) : (
              <Link key={item.key} href={item.href} className={linkClass(active)}>
                <item.icon className={cn("size-5", active && "stroke-[2.25]")} />
                {t(item.key)}
              </Link>
            )
          // Module sheet sits between dashboard and calendar
          if (item.key === "dashboard") {
            return (
              <React.Fragment key={item.key}>
                {link}
                <ModuleSheet context={context} />
              </React.Fragment>
            )
          }
          return link
        })}
      </div>
    </nav>
  )
}
