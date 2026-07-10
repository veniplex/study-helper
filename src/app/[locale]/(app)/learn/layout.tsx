import { getTranslations } from "next-intl/server"
import { LearnNav } from "@/components/learn/learn-nav"

export default async function LearnLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("learn")

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <h1 className="font-heading text-xl font-semibold tracking-tight">{t("title")}</h1>
      <LearnNav />
      {children}
    </div>
  )
}
