import { cookies } from "next/headers"
import { requireSession } from "@/lib/auth/session"
import { listAvailableModels, resolveModelForUser } from "@/lib/ai/registry"
import { getAppName } from "@/lib/settings"
import { getStudyContext } from "@/lib/studies/context"
import { ChatDock } from "@/components/ai/chat-dock"
import { Pomodoro } from "@/components/pomodoro"
import { PageContextProvider } from "@/components/ai/page-context"
import { AppHeader } from "@/components/layout/app-header"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { BottomNav } from "@/components/layout/bottom-nav"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()
  const [context, { models }, initialModel, appName] = await Promise.all([
    getStudyContext(session.user.id),
    listAvailableModels(),
    resolveModelForUser(session.user.id),
    getAppName(),
  ])
  const aiAvailable = models.length > 0
  const user = {
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
    isAdmin: session.user.role === "admin",
  }
  const cookieStore = await cookies()
  const rawWidth = Number(cookieStore.get("sidebar-width")?.value)
  const sidebarWidth = Number.isFinite(rawWidth)
    ? Math.min(400, Math.max(200, rawWidth))
    : 240
  // All modules of the active program (incl. thesis modules), not just the
  // current semester — the chat can be assigned to any of them.
  const allModules = context.tree.flatMap((s) =>
    s.modules.map((m) => ({ id: m.id, name: m.name }))
  )

  return (
    <PageContextProvider>
      <div
        id="app-shell"
        className="flex min-h-dvh flex-col"
        style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
      >
        <AppSidebar
          context={context}
          isAdmin={user.isAdmin}
          aiAvailable={aiAvailable}
          appName={appName}
          user={user}
        />
        <div className="flex flex-1 flex-col pb-16 md:pb-0 md:pl-[var(--sidebar-width,15rem)]">
          <AppHeader user={user} />
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
        <BottomNav context={context} aiAvailable={aiAvailable} />
        <Pomodoro modules={allModules} />
        <ChatDock models={models} initialModel={initialModel} modules={allModules} />
      </div>
    </PageContextProvider>
  )
}
