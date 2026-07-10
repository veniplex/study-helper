"use client"

import { BookOpen, GraduationCap } from "lucide-react"
import { useTranslations } from "next-intl"
import { Link, usePathname } from "@/i18n/navigation"
import { navItems } from "@/config/nav"
import { ContextSwitcher } from "./context-switcher"
import type { StudyContext } from "@/lib/studies/context"
import { cn } from "@/lib/utils"

export function AppSidebar({ context }: { context: StudyContext }) {
  const t = useTranslations("nav")
  const tApp = useTranslations("app")
  const tContext = useTranslations("context")
  const pathname = usePathname()

  const linkClass = (active: boolean) =>
    cn(
      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
      active
        ? "bg-sidebar-accent text-sidebar-accent-foreground"
        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
    )

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-14 items-center gap-2.5 border-b px-5">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <GraduationCap className="size-4.5" />
        </div>
        <span className="font-heading text-base font-semibold tracking-tight">{tApp("name")}</span>
      </div>

      <ContextSwitcher context={context} />

      <nav className="flex flex-1 flex-col overflow-y-auto p-3">
        {context.modules.length > 0 && context.activeProgram && (
          <div className="mb-3 space-y-1">
            <p className="text-muted-foreground px-3 pb-1 text-[11px] font-medium tracking-wide uppercase">
              {tContext("modules")}
            </p>
            {context.modules.map((mod) => {
              const href = `/studies/${context.activeProgram!.id}/${mod.id}`
              return (
                <Link key={mod.id} href={href} className={linkClass(pathname.startsWith(href))}>
                  <BookOpen className="size-4 shrink-0" />
                  <span className="truncate">{mod.name}</span>
                </Link>
              )
            })}
          </div>
        )}

        <div className="space-y-1 border-t pt-3">
          {navItems.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
            return (
              <Link key={item.key} href={item.href} className={linkClass(active)}>
                <item.icon className="size-4.5 shrink-0" />
                {t(item.key)}
              </Link>
            )
          })}
        </div>
      </nav>
    </aside>
  )
}
