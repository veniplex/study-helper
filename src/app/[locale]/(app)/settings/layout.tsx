import { getTranslations } from "next-intl/server"
import { SettingsNav } from "@/components/settings/settings-nav"

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("settings")

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <h1 className="font-heading text-xl font-semibold tracking-tight">{t("title")}</h1>
      <SettingsNav />
      {children}
    </div>
  )
}
