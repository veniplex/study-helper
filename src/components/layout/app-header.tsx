import { CommandPalette } from "./command-palette"
import { LocaleSwitcher } from "./locale-switcher"
import { ThemeToggle } from "./theme-toggle"
import { UserMenu } from "./user-menu"

export function AppHeader({
  user,
  aiAvailable,
}: {
  user: { name: string; email: string; image?: string | null; isAdmin: boolean }
  aiAvailable: boolean
}) {
  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-20 grid h-14 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b px-4 backdrop-blur md:px-6">
      <div />
      <div className="flex justify-center">
        <CommandPalette aiAvailable={aiAvailable} />
      </div>
      {/* On desktop these controls live in the sidebar footer; keep them here
          for mobile where the sidebar is hidden. */}
      <div className="flex items-center justify-end gap-2 md:hidden">
        <LocaleSwitcher />
        <ThemeToggle />
        <UserMenu {...user} />
      </div>
      <div className="hidden md:block" />
    </header>
  )
}
