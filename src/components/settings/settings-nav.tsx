"use client"

import { useTranslations } from "next-intl"
import { Link, usePathname } from "@/i18n/navigation"
import { cn } from "@/lib/utils"

const tabs = [
  { key: "general", href: "/settings" },
  { key: "audit", href: "/settings/audit" },
] as const

export function SettingsNav() {
  const t = useTranslations("settings.nav")
  const pathname = usePathname()

  return (
    <nav className="flex gap-1 border-b pb-px">
      {tabs.map((tab) => {
        const active = tab.href === "/settings" ? pathname === "/settings" : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
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
