"use client"

import { ThemeProvider } from "next-themes"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { OfflineSync } from "@/components/offline-sync"
import { SwRegister } from "@/components/sw-register"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider>{children}</TooltipProvider>
      <OfflineSync />
      <SwRegister />
      <Toaster />
    </ThemeProvider>
  )
}
