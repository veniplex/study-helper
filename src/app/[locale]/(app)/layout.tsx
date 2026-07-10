import { requireSession } from "@/lib/auth/session"
import { listAvailableModels } from "@/lib/ai/registry"
import { getStudyContext } from "@/lib/studies/context"
import { ChatDock } from "@/components/ai/chat-dock"
import { PageContextProvider } from "@/components/ai/page-context"
import { AppHeader } from "@/components/layout/app-header"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { BottomNav } from "@/components/layout/bottom-nav"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()
  const [context, { models, defaultModel }] = await Promise.all([
    getStudyContext(session.user.id),
    listAvailableModels(),
  ])
  const user = {
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
    isAdmin: session.user.role === "admin",
  }

  return (
    <PageContextProvider>
      <div className="flex min-h-dvh flex-col">
        <AppSidebar context={context} isAdmin={user.isAdmin} />
        <div className="flex flex-1 flex-col pb-16 md:pb-0 md:pl-60">
          <AppHeader
            user={user}
            modules={context.modules.map((m) => ({ id: m.id, name: m.name }))}
          />
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
        <BottomNav context={context} />
        <ChatDock
          models={models}
          initialModel={defaultModel}
          modules={context.modules.map((m) => ({ id: m.id, name: m.name }))}
        />
      </div>
    </PageContextProvider>
  )
}
