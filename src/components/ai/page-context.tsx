"use client"

import * as React from "react"
import { usePathname } from "@/i18n/navigation"

export type PageContext = {
  pathname: string
  moduleId?: string
  moduleName?: string
  pageTitle?: string
}

type Ctx = {
  context: PageContext
  setModuleContext: (ctx: { moduleId?: string; moduleName?: string; pageTitle?: string }) => void
}

const PageContextCtx = React.createContext<Ctx | null>(null)

export function PageContextProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [moduleCtx, setModuleCtx] = React.useState<{
    moduleId?: string
    moduleName?: string
    pageTitle?: string
  }>({})

  const value = React.useMemo<Ctx>(
    () => ({ context: { pathname, ...moduleCtx }, setModuleContext: setModuleCtx }),
    [pathname, moduleCtx]
  )

  return <PageContextCtx.Provider value={value}>{children}</PageContextCtx.Provider>
}

export function usePageContext(): PageContext | null {
  return React.useContext(PageContextCtx)?.context ?? null
}

/** Mounted by the module workspace layout to announce the current module. */
export function PageContextSetter({
  moduleId,
  moduleName,
}: {
  moduleId: string
  moduleName: string
}) {
  const ctx = React.useContext(PageContextCtx)
  const setModuleContext = ctx?.setModuleContext

  React.useEffect(() => {
    if (!setModuleContext) return
    setModuleContext({ moduleId, moduleName })
    return () => setModuleContext({})
  }, [setModuleContext, moduleId, moduleName])

  return null
}

/** Serialize the page context for the chat API. */
export function describePageContext(ctx: PageContext | null): string | undefined {
  if (!ctx) return undefined
  const parts = [`path: ${ctx.pathname}`]
  if (ctx.moduleName) parts.push(`module: ${ctx.moduleName}`)
  if (ctx.moduleId) parts.push(`moduleId: ${ctx.moduleId}`)
  if (ctx.pageTitle) parts.push(`page: ${ctx.pageTitle}`)
  return parts.join(" · ")
}
