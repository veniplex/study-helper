import { requireSession } from "@/lib/auth/session"
import { getStudyContext } from "@/lib/studies/context"
import { AppHeader } from "@/components/layout/app-header"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { BottomNav } from "@/components/layout/bottom-nav"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()
  const context = await getStudyContext(session.user.id)
  const user = {
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
    isAdmin: session.user.role === "admin",
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <AppSidebar context={context} />
      <div className="flex flex-1 flex-col pb-16 md:pb-0 md:pl-60">
        <AppHeader user={user} />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
      <BottomNav />
    </div>
  )
}
