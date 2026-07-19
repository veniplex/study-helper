import { and, desc, eq } from "drizzle-orm"
import { MessageSquare, Sparkles } from "lucide-react"
import { getFormatter, getTranslations } from "next-intl/server"
import { db } from "@/db"
import { aiConversation } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { ownModule } from "@/lib/studies/access"
import { getSetting } from "@/lib/settings"
import { Link } from "@/i18n/navigation"
import { deleteConversation } from "@/app/[locale]/(app)/ai/actions"
import { NewChatButton } from "@/components/ai/new-chat-button"
import { DeleteButton } from "@/components/studies/delete-button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"

export default async function ModuleChatPage({
  params,
}: {
  params: Promise<{ programId: string; moduleId: string }>
}) {
  const { moduleId } = await params
  const session = await requireSession()
  const mod = await ownModule(moduleId, session.user.id)
  const t = await getTranslations("ai")
  const format = await getFormatter()

  const [conversations, ai] = await Promise.all([
    db.query.aiConversation.findMany({
      where: and(
        eq(aiConversation.userId, session.user.id),
        eq(aiConversation.moduleId, moduleId)
      ),
      orderBy: [desc(aiConversation.updatedAt)],
    }),
    getSetting("ai"),
  ])

  const configured = (ai?.providers ?? []).some((p) => p.models.length > 0)

  return (
    <div className="space-y-4">
      {configured && (
        <div className="flex justify-end">
          <NewChatButton moduleId={mod.id} />
        </div>
      )}
      {!configured ? (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-3 py-10 text-center text-sm">
            <Sparkles className="size-6" />
            {t("notConfigured")}
            {session.user.role === "admin" && (
              <Link
                href="/admin/ai"
                className="text-foreground font-medium underline underline-offset-4"
              >
                {t("configureNow")}
              </Link>
            )}
          </CardContent>
        </Card>
      ) : conversations.length === 0 ? (
        <EmptyState icon={MessageSquare} title={t("noConversations")} />
      ) : (
        <ul className="space-y-2">
          {conversations.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-sm"
            >
              <MessageSquare className="text-muted-foreground size-4 shrink-0" />
              <Link
                href={`/ai/${c.id}`}
                className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline"
              >
                {c.title}
              </Link>
              <span className="text-muted-foreground text-xs">
                {format.dateTime(c.updatedAt, { dateStyle: "medium" })}
              </span>
              <DeleteButton action={deleteConversation.bind(null, c.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
