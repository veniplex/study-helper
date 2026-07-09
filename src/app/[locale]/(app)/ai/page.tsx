import { desc, eq } from "drizzle-orm"
import { MessageSquare, Sparkles } from "lucide-react"
import { getFormatter, getTranslations } from "next-intl/server"
import { db } from "@/db"
import { aiConversation } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { getSetting } from "@/lib/settings"
import { Link } from "@/i18n/navigation"
import { deleteConversation } from "./actions"
import { NewChatButton } from "@/components/ai/new-chat-button"
import { DeleteButton } from "@/components/studies/delete-button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

export default async function AiPage() {
  const session = await requireSession()
  const t = await getTranslations("ai")
  const format = await getFormatter()

  const [conversations, ai] = await Promise.all([
    db.query.aiConversation.findMany({
      where: eq(aiConversation.userId, session.user.id),
      orderBy: [desc(aiConversation.updatedAt)],
      with: { module: true },
    }),
    getSetting("ai"),
  ])

  const configured = (ai?.providers ?? []).some((p) => p.models.length > 0)

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-semibold tracking-tight">{t("title")}</h1>
        {configured && <NewChatButton />}
      </div>

      {!configured ? (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-3 py-10 text-center text-sm">
            <Sparkles className="size-6" />
            {t("notConfigured")}
            {session.user.role === "admin" && (
              <Link href="/admin/ai" className="text-foreground font-medium underline underline-offset-4">
                {t("configureNow")}
              </Link>
            )}
          </CardContent>
        </Card>
      ) : conversations.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            {t("noConversations")}
          </CardContent>
        </Card>
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
              {c.module && <Badge variant="secondary">{c.module.name}</Badge>}
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
