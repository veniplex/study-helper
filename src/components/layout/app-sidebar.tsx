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
  ScrollText,
  Settings,
  Shield,
  type LucideIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Link, usePathname, useRouter } from "@/i18n/navigation"
import { navItems } from "@/config/nav"
import { setActiveContext } from "@/app/[locale]/(app)/context-actions"
import { ContextSwitcher } from "./context-switcher"
import type { StudyContext, SemesterNode } from "@/lib/studies/context"
import { cn } from "@/lib/utils"

const moduleTabs: { key: string; segment: string; icon: LucideIcon }[] = [
  { key: "materials", segment: "/materials", icon: FileText },
  { key: "tasks", segment: "/tasks", icon: ListChecks },
  { key: "decks", segment: "/decks", icon: Layers },
  { key: "quizzes", segment: "/quizzes", icon: BrainCircuit },
  { key: "plans", segment: "/plans", icon: ClipboardList },
  { key: "chat", segment: "/chat", icon: MessageSquare },
]

const itemClass = (active: boolean) =>
  cn(
    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
  )

function SidebarModule({
  href,
  name,
  open,
  onToggle,
}: {
  href: string
  name: string
  open: boolean
  onToggle: () => void
}) {
  const t = useTranslations("moduleTabs")
  const pathname = usePathname()

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
        <Link
          href={href}
          className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-1.5 text-sm font-medium"
        >
          <BookOpen className="size-4 shrink-0" />
          <span className="truncate">{name}</span>
        </Link>
        <button
          type="button"
          onClick={onToggle}
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

function SidebarSemester({
  semester,
  programId,
  open,
  active,
  onOpen,
}: {
  semester: SemesterNode
  programId: string
  open: boolean
  active: boolean
  onOpen: () => void
}) {
  const tContext = useTranslations("context")
  const pathname = usePathname()
  const [openModule, setOpenModule] = React.useState<string | null>(null)

  // Auto-open the module the user is currently inside
  const currentModule = semester.modules.find((m) =>
    pathname.startsWith(`/studies/${programId}/${m.id}`)
  )
  const [prevPath, setPrevPath] = React.useState(pathname)
  if (prevPath !== pathname) {
    setPrevPath(pathname)
    if (currentModule) setOpenModule(currentModule.id)
  }

  return (
    <div>
      <button
        type="button"
        onClick={onOpen}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm font-medium transition-colors",
          active
            ? "text-foreground"
            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        )}
      >
        <ChevronRight className={cn("size-4 shrink-0 transition-transform", open && "rotate-90")} />
        <span className="truncate">{semester.name}</span>
        {active && <span className="bg-primary ml-auto size-1.5 shrink-0 rounded-full" />}
      </button>
      {open && (
        <div className="mt-0.5 mb-1 ml-3 space-y-0.5">
          {semester.modules.map((mod) => (
            <SidebarModule
              key={mod.id}
              href={`/studies/${programId}/${mod.id}`}
              name={mod.name}
              open={openModule === mod.id || currentModule?.id === mod.id}
              onToggle={() => setOpenModule(openModule === mod.id ? null : mod.id)}
            />
          ))}
          {semester.theses.map((thesis) => (
            <Link
              key={thesis.id}
              href="/thesis"
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                pathname.startsWith("/thesis")
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )}
            >
              <ScrollText className="size-4 shrink-0" />
              <span className="truncate">{thesis.title}</span>
            </Link>
          ))}
          {semester.modules.length === 0 && semester.theses.length === 0 && (
            <p className="text-muted-foreground px-2.5 py-1 text-xs">{tContext("noModules")}</p>
          )}
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
  const router = useRouter()
  const [openSemester, setOpenSemester] = React.useState<string | null>(
    context.activeSemester?.id ?? null
  )

  function openAndActivate(semesterId: string) {
    if (openSemester === semesterId) {
      setOpenSemester(null)
      return
    }
    setOpenSemester(semesterId)
    if (context.activeProgram && semesterId !== context.activeSemester?.id) {
      setActiveContext({ programId: context.activeProgram.id, semesterId })
        .then(() => router.refresh())
        .catch((error: unknown) =>
          toast.error(error instanceof Error ? error.message : String(error))
        )
    }
  }

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
          <div className="mb-3 space-y-0.5">
            {sectionLabel(tContext("semester"))}
            {context.tree.map((sem) => (
              <SidebarSemester
                key={sem.id}
                semester={sem}
                programId={context.activeProgram!.id}
                open={openSemester === sem.id}
                active={context.activeSemester?.id === sem.id}
                onOpen={() => openAndActivate(sem.id)}
              />
            ))}
            {context.tree.length === 0 && (
              <p className="text-muted-foreground px-3 py-1 text-xs">
                {tContext("noSemesters")}
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
              <Link key={item.key} href={item.href} className={itemClass(active)}>
                <item.icon className="size-4.5 shrink-0" />
                {t(item.key)}
              </Link>
            )
          })}
        </div>

        <div className="mt-auto space-y-1 border-t pt-3">
          <Link href="/settings" className={itemClass(pathname.startsWith("/settings"))}>
            <Settings className="size-4.5 shrink-0" />
            {t("settings")}
          </Link>
          {isAdmin && (
            <Link href="/admin" className={itemClass(pathname.startsWith("/admin"))}>
              <Shield className="size-4.5 shrink-0" />
              {t("admin")}
            </Link>
          )}
        </div>
      </nav>
    </aside>
  )
}
