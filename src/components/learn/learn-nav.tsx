"use client"

import { useTranslations } from "next-intl"
import { Link, usePathname } from "@/i18n/navigation"
import { cn } from "@/lib/utils"

const items = [
  { key: "tasks", href: "/learn" },
  { key: "goals", href: "/learn/goals" },
  { key: "plans", href: "/learn/plans" },
  { key: "decks", href: "/learn/decks" },
  { key: "quizzes", href: "/learn/quizzes" },
] as const

export function LearnNav() {
  const t = useTranslations("learn.nav")
  const pathname = usePathname()

  return (
    <nav className="flex gap-1 overflow-x-auto border-b pb-px">
      {items.map((item) => {
        const active =
          item.href === "/learn" ? pathname === "/learn" : pathname.startsWith(item.href)
        return (
          <Link
            key={item.key}
            href={item.href}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent"
            )}
          >
            {t(item.key)}
          </Link>
        )
      })}
    </nav>
  )
}
