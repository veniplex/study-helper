"use client"

import { useTranslations } from "next-intl"
import { Link, usePathname } from "@/i18n/navigation"
import { cn } from "@/lib/utils"

const tabs = [
  { key: "overview", segment: "" },
  { key: "materials", segment: "/materials" },
  { key: "decks", segment: "/decks" },
  { key: "quizzes", segment: "/quizzes" },
  { key: "chat", segment: "/chat" },
] as const

export function ModuleTabs({ basePath }: { basePath: string }) {
  const t = useTranslations("moduleTabs")
  const pathname = usePathname()

  return (
    <nav className="flex gap-1 overflow-x-auto border-b pb-px">
      {tabs.map((tab) => {
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
    </nav>
  )
}
