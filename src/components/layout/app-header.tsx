import { Pomodoro } from "@/components/pomodoro"
import type { ModuleOption } from "@/components/learn/module-select"
import { CommandPalette } from "./command-palette"
import { LocaleSwitcher } from "./locale-switcher"
import { ThemeToggle } from "./theme-toggle"
import { UserMenu } from "./user-menu"

export function AppHeader({
  user,
  modules = [],
}: {
  user: { name: string; email: string; image?: string | null; isAdmin: boolean }
  modules?: ModuleOption[]
}) {
  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-4 backdrop-blur md:px-6">
      <div className="flex flex-1 items-center gap-2">
        <CommandPalette />
      </div>
      <Pomodoro modules={modules} />
      <LocaleSwitcher />
      <ThemeToggle />
      <UserMenu {...user} />
    </header>
  )
}
