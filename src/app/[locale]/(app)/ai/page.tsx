import { desc, eq } from "drizzle-orm"
import { db } from "@/db"
import { aiConversation } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { redirect } from "@/i18n/navigation"
import { getLocale } from "next-intl/server"

/** The AI hub page was replaced by the chat dock — /ai now opens the most
 * recent conversation in fullscreen (creating one if none exists). */
export default async function AiPage() {
  const session = await requireSession()
  const locale = await getLocale()

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
