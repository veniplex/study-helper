"use client"

import * as React from "react"
import {
  BrainCircuit,
  CalendarClock,
  ChevronRight,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Layers,
  LayoutList,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  ScrollText,
  Settings,
  Shield,
  Trash2,
  type LucideIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Link, usePathname, useRouter } from "@/i18n/navigation"
import { navItems } from "@/config/nav"
import { deleteModule, deleteSemester } from "@/app/[locale]/(app)/studies/actions"
import { ModuleDialog } from "@/components/studies/module-dialog"
import { SemesterDialog } from "@/components/studies/semester-dialog"
import { ContextSwitcher } from "./context-switcher"
import type { SemesterModule, SemesterNode, StudyContext } from "@/lib/studies/context"
import { getModuleColorClasses, getModuleIcon, STATUS_DOT } from "@/lib/module-visuals"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

/** Renders a module's chosen icon (stable, module-scope). */
function ModuleGlyph({ iconKey, className }: { iconKey?: string | null; className?: string }) {
  return React.createElement(getModuleIcon(iconKey), { className })
}

const moduleTabs: { key: string; segment: string; icon: LucideIcon }[] = [
  { key: "overview", segment: "", icon: LayoutList },
  { key: "materials", segment: "/materials", icon: FileText },
  { key: "assignments", segment: "/assignments", icon: ClipboardCheck },
  { key: "decks", segment: "/decks", icon: Layers },
  { key: "quizzes", segment: "/quizzes", icon: BrainCircuit },
  { key: "chat", segment: "/chat", icon: MessageSquare },
]

const itemClass = (active: boolean) =>
  cn(
    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
  )

function ConfirmDeleteDialog({
  open,
  onOpenChange,
  label,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  onConfirm: () => Promise<void>
}) {
  const t = useTranslations("studies")
  const tCommon = useTranslations("common")
  const [pending, setPending] = React.useState(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">{t("deleteConfirm")}</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              setPending(true)
              try {
                await onConfirm()
                onOpenChange(false)
              } catch (error) {
                toast.error(error instanceof Error ? error.message : String(error))
              } finally {
                setPending(false)
              }
            }}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {tCommon("delete")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SidebarModule({
  programId,
  semesterId,
  module: mod,
  open,
  onToggle,
}: {
  programId: string
  semesterId: string
  module: SemesterModule
  open: boolean
  onToggle: () => void
}) {
  const t = useTranslations("moduleTabs")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const pathname = usePathname()
  const href = `/studies/${programId}/${mod.id}`
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  return (
    <div>
      <div
        className={cn(
          "group flex items-center rounded-md transition-colors",
          pathname === href
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-1.5 text-left text-sm font-medium"
        >
          <span className="relative shrink-0">
            <ModuleGlyph
              iconKey={mod.icon}
              className={cn("size-4", getModuleColorClasses(mod.color).text)}
            />
            <span
              className={cn(
                "border-sidebar absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full border",
                STATUS_DOT[mod.status]
              )}
            />
          </span>
          <span className="truncate">{mod.name}</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 data-popup-open:opacity-100"
                aria-label={mod.name}
              />
            }
          >
            <MoreHorizontal className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" />
              {tCommon("edit")}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="size-4" />
              {tCommon("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          onClick={onToggle}
          className="text-muted-foreground hover:text-foreground mr-1 rounded p-1"
          aria-label={mod.name}
          aria-expanded={open}
        >
          <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} />
        </button>
      </div>
      {open && (
        <div className="mt-0.5 mb-1 ml-4 space-y-0.5 border-l pl-2">
          {moduleTabs.map((tab) => {
            const tabHref = `${href}${tab.segment}`
            const active =
              tab.segment === "" ? pathname === href : pathname.startsWith(tabHref)
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
      <ModuleDialog
        semesterId={semesterId}
        module={mod}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        label={mod.name}
        onConfirm={async () => {
          await deleteModule(mod.id)
          router.refresh()
        }}
      />
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
  const tStudies = useTranslations("studies")
  const tCommon = useTranslations("common")
  const tPlan = useTranslations("semesterPlan")
  const router = useRouter()
  const pathname = usePathname()
  const [openModule, setOpenModule] = React.useState<string | null>(null)
  const [editOpen, setEditOpen] = React.useState(false)
  const [addModuleOpen, setAddModuleOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)

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
      <div
        className={cn(
          "group flex items-center rounded-md transition-colors",
          active
            ? "text-foreground"
            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        )}
      >
        <button
          type="button"
          onClick={onOpen}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left text-sm font-medium"
        >
          <ChevronRight
            className={cn("size-4 shrink-0 transition-transform", open && "rotate-90")}
          />
          <span className="truncate">{semester.name}</span>
        </button>
        <button
          type="button"
          onClick={() => setAddModuleOpen(true)}
          className="text-muted-foreground hover:text-foreground rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
          title={tStudies("newModule")}
        >
          <Plus className="size-3.5" />
          <span className="sr-only">{tStudies("newModule")}</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground mr-1 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 data-popup-open:opacity-100"
                aria-label={semester.name}
              />
            }
          >
            <MoreHorizontal className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" />
              {tCommon("edit")}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="size-4" />
              {tCommon("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {open && (
        <div className="mt-0.5 mb-1 ml-3 space-y-0.5">
          <Link
            href={`/plan/${semester.id}`}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
              pathname.startsWith(`/plan/${semester.id}`)
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            )}
          >
            <CalendarClock className="size-4 shrink-0" />
            {tPlan("title")}
          </Link>
          {semester.modules.map((mod) => (
            <SidebarModule
              key={mod.id}
              programId={programId}
              semesterId={semester.id}
              module={mod}
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
      <SemesterDialog
        programId={programId}
        semester={{
          id: semester.id,
          name: semester.name,
          startDate: semester.startDate,
          endDate: semester.endDate,
        }}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <ModuleDialog semesterId={semester.id} open={addModuleOpen} onOpenChange={setAddModuleOpen} />
      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        label={semester.name}
        onConfirm={async () => {
          await deleteSemester(semester.id)
          router.refresh()
        }}
      />
    </div>
  )
}

export function AppSidebar({ context, isAdmin }: { context: StudyContext; isAdmin: boolean }) {
  const t = useTranslations("nav")
  const tApp = useTranslations("app")
  const tContext = useTranslations("context")
  const tStudies = useTranslations("studies")
  const pathname = usePathname()
  // Default-open the semester that contains today's date (falls back to the
  // active one). Pure accordion — no persisted "last opened" selection.
  const [openSemester, setOpenSemester] = React.useState<string | null>(
    context.currentSemesterId ?? context.activeSemester?.id ?? null
  )
  const [newSemesterOpen, setNewSemesterOpen] = React.useState(false)

  function toggleSemester(semesterId: string) {
    setOpenSemester((cur) => (cur === semesterId ? null : semesterId))
  }

  const topItems = navItems.filter((item) => item.key !== "ai")

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
        <div className="mb-3 space-y-1">
          {topItems.map((item) => {
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

        {context.activeProgram && (
          <div className="space-y-0.5 border-t pt-3">
            <div className="flex items-center justify-between px-3 pb-1">
              <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                {tContext("semester")}
              </p>
              <button
                type="button"
                onClick={() => setNewSemesterOpen(true)}
                className="text-muted-foreground hover:text-foreground rounded p-0.5"
                title={tStudies("newSemester")}
              >
                <Plus className="size-3.5" />
                <span className="sr-only">{tStudies("newSemester")}</span>
              </button>
            </div>
            {context.tree.map((sem) => (
              <SidebarSemester
                key={sem.id}
                semester={sem}
                programId={context.activeProgram!.id}
                open={openSemester === sem.id}
                active={context.currentSemesterId === sem.id}
                onOpen={() => toggleSemester(sem.id)}
              />
            ))}
            {context.tree.length === 0 && (
              <p className="text-muted-foreground px-3 py-1 text-xs">
                {tContext("noSemesters")}
              </p>
            )}
            <SemesterDialog
              programId={context.activeProgram.id}
              open={newSemesterOpen}
              onOpenChange={setNewSemesterOpen}
            />
          </div>
        )}

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
