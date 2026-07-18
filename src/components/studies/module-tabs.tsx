"use client"

import { Plus } from "lucide-react"
import { useTranslations } from "next-intl"
import { Link, usePathname, useRouter } from "@/i18n/navigation"
import { optionalToolKeys, visibleModuleTabs } from "@/config/module-tabs"
import type { ModuleToolKey } from "@/db/schema/studies"
import { updateModuleTools } from "@/app/[locale]/(app)/studies/actions"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

export function ModuleTabs({
  basePath,
  aiAvailable,
  enabledTools,
  hasThesisGoal,
  moduleId,
}: {
  basePath: string
  aiAvailable: boolean
  /** The optional tools currently enabled (matrix ⊕ overrides). */
  enabledTools: ModuleToolKey[]
  /** Thesis modules keep an extra tab linking to the thesis planner. */
  hasThesisGoal?: boolean
  moduleId: string
}) {
  const t = useTranslations("moduleTabs")
  const pathname = usePathname()
  const router = useRouter()

  const visible = visibleModuleTabs({ aiAvailable, enabledTools })
  const enabledSet = new Set(enabledTools)

  async function toggleTool(key: ModuleToolKey, next: boolean) {
    await updateModuleTools(moduleId, { [key]: next })
    router.refresh()
  }

  return (
    <nav className="flex items-center gap-1 overflow-x-auto border-b pb-px">
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
      {hasThesisGoal && (
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
      {optionalToolKeys.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label={t("moreTools")}
                className="text-muted-foreground hover:text-foreground -mb-px ml-auto shrink-0 rounded p-2 transition-colors"
              >
                <Plus className="size-4" />
              </button>
            }
          />
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{t("moreTools")}</DropdownMenuLabel>
            {optionalToolKeys.map((key) => (
              <label
                key={key}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-1.5 py-1.5 text-sm"
              >
                {t(key)}
                <Switch
                  checked={enabledSet.has(key)}
                  onCheckedChange={(next) => toggleTool(key, next)}
                />
              </label>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </nav>
  )
}
