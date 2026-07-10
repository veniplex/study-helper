"use client"

import * as React from "react"
import {
  BookOpen,
  BrainCircuit,
  ChevronRight,
  ClipboardList,
  FileText,
  GraduationCap,
  Layers,
  ListChecks,
  MessageSquare,
  Settings,
  Shield,
  type LucideIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { Link, usePathname } from "@/i18n/navigation"
import { navItems } from "@/config/nav"
import { ContextSwitcher } from "./context-switcher"
import type { StudyContext } from "@/lib/studies/context"
import { cn } from "@/lib/utils"

const moduleTabs: { key: string; segment: string; icon: LucideIcon }[] = [
  { key: "materials", segment: "/materials", icon: FileText },
  { key: "tasks", segment: "/tasks", icon: ListChecks },
  { key: "decks", segment: "/decks", icon: Layers },
  { key: "quizzes", segment: "/quizzes", icon: BrainCircuit },
  { key: "plans", segment: "/plans", icon: ClipboardList },
  { key: "chat", segment: "/chat", icon: MessageSquare },
]

function SidebarModule({
  href,
  name,
}: {
  href: string
  name: string
}) {
  const t = useTranslations("moduleTabs")
  const pathname = usePathname()
  const inModule = pathname.startsWith(href)
  const [expanded, setExpanded] = React.useState<boolean | null>(null)
  const open = expanded ?? inModule

  return (
    <div>
      <div
        className={cn(
          "flex items-center rounded-md transition-colors",
          pathname === href
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        )}
      >
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-sm font-medium">
          <BookOpen className="size-4 shrink-0" />
          <span className="truncate">{name}</span>
        </Link>
        <button
          type="button"
          onClick={() => setExpanded(!open)}
          className="text-muted-foreground hover:text-foreground mr-1 rounded p-1"
          aria-label={name}
          aria-expanded={open}
        >
          <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} />
        </button>
      </div>
      {open && (
        <div className="mt-0.5 mb-1 ml-4 space-y-0.5 border-l pl-2">
          {moduleTabs.map((tab) => {
            const tabHref = `${href}${tab.segment}`
            const active = pathname.startsWith(tabHref)
            return (
              <Link
                key={tab.key}
                href={tabHref}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                )}
              >
                <tab.icon className="size-3.5 shrink-0" />
                {t(tab.key)}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function AppSidebar({ context, isAdmin }: { context: StudyContext; isAdmin: boolean }) {
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

  const sectionLabel = (label: string) => (
    <p className="text-muted-foreground px-3 pb-1 text-[11px] font-medium tracking-wide uppercase">
      {label}
    </p>
  )

  const mainItems = navItems.filter((item) => item.key !== "settings")

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
        {context.activeProgram && (
          <div className="mb-3 space-y-1">
            {sectionLabel(tContext("modules"))}
            {context.modules.map((mod) => (
              <SidebarModule
                key={mod.id}
                href={`/studies/${context.activeProgram!.id}/${mod.id}`}
                name={mod.name}
              />
            ))}
            {context.modules.length === 0 && (
              <p className="text-muted-foreground px-3 py-1 text-xs">
                {tContext("noModules")}
              </p>
            )}
          </div>
        )}

        <div className="space-y-1 border-t pt-3">
          {sectionLabel(tContext("general"))}
          {mainItems.map((item) => {
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

        <div className="mt-auto space-y-1 border-t pt-3">
          <Link href="/settings" className={linkClass(pathname.startsWith("/settings"))}>
            <Settings className="size-4.5 shrink-0" />
            {t("settings")}
          </Link>
          {isAdmin && (
            <Link href="/admin" className={linkClass(pathname.startsWith("/admin"))}>
              <Shield className="size-4.5 shrink-0" />
              {t("admin")}
            </Link>
          )}
        </div>
      </nav>
    </aside>
  )
}
