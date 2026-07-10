"use client"

import * as React from "react"
import { BookOpen, GraduationCap, ScrollText, Settings } from "lucide-react"
import { useTranslations } from "next-intl"
import { Link, usePathname } from "@/i18n/navigation"
import { ContextSwitcher } from "./context-switcher"
import type { StudyContext } from "@/lib/studies/context"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

/** Mobile bottom-nav entry: opens a sheet with context switcher + modules + secondary links. */
export function ModuleSheet({ context }: { context: StudyContext }) {
  const t = useTranslations("nav")
  const tContext = useTranslations("context")
  const pathname = usePathname()
  const [open, setOpen] = React.useState(false)

  // Close when navigation happened
  const [prevPath, setPrevPath] = React.useState(pathname)
  if (prevPath !== pathname) {
    setPrevPath(pathname)
    setOpen(false)
  }

  const active = pathname.startsWith("/studies")

  const itemClass = (isActive: boolean) =>
    cn(
      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
      isActive
        ? "bg-accent text-accent-foreground"
        : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground"
    )

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className={cn(
          "flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
          active ? "text-primary" : "text-muted-foreground hover:text-foreground"
        )}
      >
        <GraduationCap className={cn("size-5", active && "stroke-[2.25]")} />
        {t("studies")}
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        <SheetHeader className="pb-0">
          <SheetTitle>{t("studies")}</SheetTitle>
        </SheetHeader>
        <ContextSwitcher context={context} />
        <div className="space-y-1 px-4 pb-4">
          {context.activeProgram &&
            context.modules.map((mod) => {
              const href = `/studies/${context.activeProgram!.id}/${mod.id}`
              return (
                <Link key={mod.id} href={href} className={itemClass(pathname.startsWith(href))}>
                  <BookOpen className="size-4 shrink-0" />
                  <span className="truncate">{mod.name}</span>
                </Link>
              )
            })}
          <div className="mt-2 space-y-1 border-t pt-2">
            <Link href="/studies" className={itemClass(pathname === "/studies")}>
              <GraduationCap className="size-4 shrink-0" />
              {t("studies")}
            </Link>
            <Link href="/thesis" className={itemClass(pathname.startsWith("/thesis"))}>
              <ScrollText className="size-4 shrink-0" />
              {t("thesis")}
            </Link>
            <Link href="/settings" className={itemClass(pathname.startsWith("/settings"))}>
              <Settings className="size-4 shrink-0" />
              {t("settings")}
            </Link>
          </div>
          {context.modules.length === 0 && (
            <p className="text-muted-foreground px-3 py-1 text-xs">{tContext("noModules")}</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
