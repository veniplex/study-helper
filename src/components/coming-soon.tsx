import { useTranslations } from "next-intl"
import { Construction } from "lucide-react"

export function ComingSoon({ titleKey }: { titleKey: string }) {
  const tNav = useTranslations("nav")
  const tCommon = useTranslations("common")

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <div className="bg-muted flex size-12 items-center justify-center rounded-full">
        <Construction className="text-muted-foreground size-6" />
      </div>
      <h1 className="font-heading text-xl font-semibold">{tNav(titleKey)}</h1>
      <p className="text-muted-foreground text-sm">{tCommon("comingSoon")}</p>
    </div>
  )
}
