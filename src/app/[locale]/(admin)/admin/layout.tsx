import { ArrowLeft } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { requireAdmin } from "@/lib/auth/session"
import { Link } from "@/i18n/navigation"
import { AdminNav } from "@/components/admin/admin-nav"
import { Button } from "@/components/ui/button"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  const t = await getTranslations("admin")
  const tCommon = await getTranslations("common")

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" nativeButton={false} render={<Link href="/" />}>
          <ArrowLeft className="size-4.5" />
          <span className="sr-only">{tCommon("back")}</span>
        </Button>
        <h1 className="font-heading text-xl font-semibold tracking-tight">{t("title")}</h1>
      </div>
      <AdminNav />
      {children}
    </div>
  )
}
