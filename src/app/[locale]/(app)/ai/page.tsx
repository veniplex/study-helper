import { desc, eq } from "drizzle-orm"
import { getLocale, getTranslations } from "next-intl/server"
import { Sparkles } from "lucide-react"
import { db } from "@/db"
import { aiConversation } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { isAiAvailable } from "@/lib/ai/registry"
import { Card, CardContent } from "@/components/ui/card"
import { Link, redirect } from "@/i18n/navigation"

/** The AI hub page was replaced by the chat dock — /ai now opens the most
 * recent conversation in fullscreen (creating one if none exists). When no AI
 * model is configured it shows a setup hint instead of creating a dead chat. */
export default async function AiPage() {
  const session = await requireSession()
  const locale = await getLocale()

  // AI off: don't insert a conversation into a dead composer — show a friendly
  // "not configured" state pointing at Settings (F5).
  if (!(await isAiAvailable())) {
    const t = await getTranslations("ai.notConfigured")
    return (
      <div className="mx-auto w-full max-w-lg py-12">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Sparkles className="text-muted-foreground size-8" />
            <p className="font-medium">{t("title")}</p>
            <p className="text-muted-foreground text-sm">{t("description")}</p>
            <Link href="/settings" className="text-foreground text-sm underline underline-offset-4">
              {t("cta")}
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const latest = await db.query.aiConversation.findFirst({
    where: eq(aiConversation.userId, session.user.id),
    orderBy: [desc(aiConversation.updatedAt)],
    columns: { id: true },
  })

  if (latest) redirect({ href: `/ai/${latest.id}`, locale })

  const [created] = await db
    .insert(aiConversation)
    .values({ userId: session.user.id })
    .returning({ id: aiConversation.id })
  redirect({ href: `/ai/${created.id}`, locale })
}
