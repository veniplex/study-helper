import { getTranslations } from "next-intl/server"
import { requireAdmin } from "@/lib/auth/session"
import { AdminNav } from "@/components/admin/admin-nav"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  const t = await getTranslations("admin")

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <h1 className="font-heading text-xl font-semibold tracking-tight">{t("title")}</h1>
      <AdminNav />
      {children}
    </div>
  )
}
