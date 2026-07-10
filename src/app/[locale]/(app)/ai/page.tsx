import { desc, eq } from "drizzle-orm"
import { BrainCircuit, Layers, MessageSquare, Sparkles } from "lucide-react"
import { getFormatter, getTranslations } from "next-intl/server"
import { db } from "@/db"
import { aiConversation } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { getSetting } from "@/lib/settings"
import { getModuleOptions } from "@/lib/studies/module-options"
import { getStudyContext } from "@/lib/studies/context"
import { Link } from "@/i18n/navigation"
import { deleteConversation } from "./actions"
import { ModeGrid } from "@/components/ai/mode-grid"
import { NewChatButton } from "@/components/ai/new-chat-button"
import { GeneratePlanDialog } from "@/components/learn/plan-dialogs"
import { DeleteButton } from "@/components/studies/delete-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default async function AiPage() {
  const session = await requireSession()
  const t = await getTranslations("ai")
  const format = await getFormatter()

  const [conversations, ai, modules, context] = await Promise.all([
    db.query.aiConversation.findMany({
      where: eq(aiConversation.userId, session.user.id),
      orderBy: [desc(aiConversation.updatedAt)],
      with: { module: true },
    }),
    getSetting("ai"),
    getModuleOptions(session.user.id),
    getStudyContext(session.user.id),
  ])

  const configured = (ai?.providers ?? []).some((p) => p.models.length > 0)
  const firstModule = context.modules[0]
  const moduleBase =
    context.activeProgram && firstModule
      ? `/studies/${context.activeProgram.id}/${firstModule.id}`
      : null

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
      ) : (
        <>
          <ModeGrid />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("hub.quickActions")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-muted-foreground text-sm">{t("hub.quickActionsHint")}</p>
              <div className="flex flex-wrap gap-2">
                <GeneratePlanDialog modules={modules} aiAvailable basePath="" />
                {moduleBase && (
                  <>
                    <Button
                      variant="outline"
                      nativeButton={false}
                      render={<Link href={`${moduleBase}/decks`} />}
                    >
                      <Layers className="size-4" />
                      {t("hub.generateCards")}
                    </Button>
                    <Button
                      variant="outline"
                      nativeButton={false}
                      render={<Link href={`${moduleBase}/quizzes`} />}
                    >
                      <BrainCircuit className="size-4" />
                      {t("hub.generateQuiz")}
                    </Button>
                  </>
                )}
              </div>
              <p className="text-muted-foreground text-xs">{t("hub.ragHint")}</p>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold">{t("hub.history")}</h2>
            {conversations.length === 0 ? (
              <Card>
                <CardContent className="text-muted-foreground py-8 text-center text-sm">
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
                    {c.mode && c.mode !== "general" && (
                      <Badge variant="outline">{t(`modes.${c.mode}.label`)}</Badge>
                    )}
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
        </>
      )}
    </div>
  )
}
