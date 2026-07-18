import { getTranslations } from "next-intl/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default async function ModulePaperPage({
  params,
}: {
  params: Promise<{ programId: string; moduleId: string }>
}) {
  await params
  const t = await getTranslations("moduleTabs")
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("paper")}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">{t("comingSoon")}</CardContent>
    </Card>
  )
}
