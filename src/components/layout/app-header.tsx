import { CommandPalette } from "./command-palette"
import { LocaleSwitcher } from "./locale-switcher"
import { ThemeToggle } from "./theme-toggle"

export function AppHeader() {
  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-4 backdrop-blur md:px-6">
      <div className="flex flex-1 items-center gap-2">
        <CommandPalette />
      </div>
      <LocaleSwitcher />
      <ThemeToggle />
    </header>
  )
}
