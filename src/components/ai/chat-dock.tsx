"use client"

import * as React from "react"
import {
  Check,
  ChevronDown,
  Loader2,
  Maximize2,
  MessageCircle,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import type { UIMessage } from "ai"
import { usePathname, useRouter } from "@/i18n/navigation"
import {
  createConversation,
  deleteConversation,
  getConversationMessages,
  listConversations,
  renameConversation,
  updateConversationModule,
} from "@/app/[locale]/(app)/ai/actions"
import { Chat } from "@/components/ai/chat"
import { usePageContext } from "@/components/ai/page-context"
import { ModuleSelect, type ModuleOption } from "@/components/learn/module-select"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

const LAST_CHAT_KEY = "studyhelper.lastChatId"
export const CHAT_OPEN_EVENT = "studyhelper:chat-open"

type ConversationMeta = {
  id: string
  title: string
  moduleName: string | null
  moduleId: string | null
}

export function ChatDock({
  models,
  initialModel,
  modules,
}: {
  models: { ref: string; label: string }[]
  initialModel: string | null
  modules: ModuleOption[]
}) {
  const t = useTranslations("ai")
  const router = useRouter()
  const pathname = usePathname()
  const isFullscreenChat = pathname.startsWith("/ai/")
  const rawPageContext = usePageContext()
  const pageContext = rawPageContext ?? { moduleId: null, moduleName: null }
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [conversations, setConversations] = React.useState<ConversationMeta[]>([])
  const [current, setCurrent] = React.useState<ConversationMeta | null>(null)
  const [initialMessages, setInitialMessages] = React.useState<UIMessage[]>([])
  const [renaming, setRenaming] = React.useState(false)
  const [renameValue, setRenameValue] = React.useState("")
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  const suggestions = [
    pageContext.moduleName
      ? t("suggestions.quizModule", { module: pageContext.moduleName })
      : t("suggestions.quiz"),
    pageContext.moduleName
      ? t("suggestions.explainModule", { module: pageContext.moduleName })
      : t("suggestions.explain"),
    t("suggestions.homeworkHints"),
    t("suggestions.writing"),
    t("suggestions.plan"),
  ]

  async function switchTo(meta: ConversationMeta) {
    setPending(true)
    try {
      const messages = await getConversationMessages(meta.id)
      if (messages == null) throw new Error("Not found")
      setInitialMessages(messages as UIMessage[])
      setCurrent(meta)
      window.localStorage.setItem(LAST_CHAT_KEY, meta.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  const startNew = React.useCallback(
    async (list?: ConversationMeta[]) => {
      const moduleId = pageContext.moduleId ?? null
      const { id } = await createConversation(moduleId, "general")
      const meta: ConversationMeta = {
        id,
        title: t("newConversation"),
        moduleId,
        moduleName: pageContext.moduleName ?? null,
      }
      setConversations([meta, ...(list ?? conversations)])
      setInitialMessages([])
      setCurrent(meta)
      window.localStorage.setItem(LAST_CHAT_KEY, id)
    },
    [pageContext.moduleId, pageContext.moduleName, conversations, t]
  )

  async function openDock(targetId?: string) {
    setOpen(true)
    if (current && !targetId) return
    if (current && targetId === current.id) return
    setPending(true)
    try {
      const list = await listConversations()
      setConversations(list)
      const lastId = targetId ?? window.localStorage.getItem(LAST_CHAT_KEY)
      const target = list.find((c) => c.id === lastId) ?? list[0]
      if (target) {
        const messages = await getConversationMessages(target.id)
        if (messages != null) {
          setInitialMessages(messages as UIMessage[])
          setCurrent(target)
          return
        }
      }
      await startNew(list)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  // Bottom-nav "AI" tab and the fullscreen page's minimize button open the dock
  React.useEffect(() => {
    const handler = (e: Event) =>
      void openDock((e as CustomEvent<{ conversationId?: string }>).detail?.conversationId)
    window.addEventListener(CHAT_OPEN_EVENT, handler)
    return () => window.removeEventListener(CHAT_OPEN_EVENT, handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

  async function onRename() {
    if (!current) return
    const title = renameValue.trim()
    if (!title) return
    try {
      await renameConversation(current.id, title)
      setCurrent({ ...current, title })
      setConversations((list) =>
        list.map((c) => (c.id === current.id ? { ...c, title } : c))
      )
      setRenaming(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  async function onDelete() {
    if (!current) return
    try {
      await deleteConversation(current.id)
      const rest = conversations.filter((c) => c.id !== current.id)
      setConversations(rest)
      setConfirmDelete(false)
      window.localStorage.removeItem(LAST_CHAT_KEY)
      if (rest[0]) await switchTo(rest[0])
      else await startNew(rest)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  async function onModuleChange(moduleId: string) {
    if (!current) return
    try {
      await updateConversationModule(current.id, moduleId || null)
      const moduleName = modules.find((m) => m.id === moduleId)?.name ?? null
      setCurrent({ ...current, moduleId: moduleId || null, moduleName })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  if (models.length === 0) return null

  return (
    <div className="print:hidden">
      {open && (
        <div
          className={cn(
            "bg-background fixed z-50 flex flex-col border shadow-xl",
            // mobile: fullscreen; desktop: floating panel
            "inset-0 lg:inset-auto lg:right-5 lg:bottom-20 lg:h-[620px] lg:max-h-[calc(100dvh-8rem)] lg:w-[420px] lg:rounded-xl"
          )}
        >
          <div className="flex items-center gap-1 border-b p-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className="hover:bg-accent flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm font-semibold"
                  />
                }
              >
                <span className="truncate">{current?.title ?? t("quickChat")}</span>
                {current?.moduleName && (
                  <span className="bg-secondary text-secondary-foreground shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium">
                    {current.moduleName}
                  </span>
                )}
                <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-80 w-72 overflow-y-auto">
                {conversations.map((c) => (
                  <DropdownMenuItem key={c.id} onClick={() => switchTo(c)}>
                    <span className="min-w-0 flex-1 truncate">{c.title}</span>
                    {c.moduleName && (
                      <span className="text-muted-foreground shrink-0 text-[10px]">
                        {c.moduleName}
                      </span>
                    )}
                    {current?.id === c.id && <Check className="size-3.5 shrink-0" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon-sm"
              title={t("newChat")}
              onClick={() => void startNew()}
            >
              <Plus className="size-4" />
              <span className="sr-only">{t("newChat")}</span>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title={t("rename")}
              onClick={() => {
                setRenameValue(current?.title ?? "")
                setRenaming((v) => !v)
              }}
            >
              <Pencil className="size-3.5" />
              <span className="sr-only">{t("rename")}</span>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title={t("deleteChat")}
              onClick={() => setConfirmDelete((v) => !v)}
            >
              <Trash2 className="size-3.5" />
              <span className="sr-only">{t("deleteChat")}</span>
            </Button>
            {current && (
              <Button
                variant="ghost"
                size="icon-sm"
                title={t("expand")}
                className="hidden lg:inline-flex"
                onClick={() => {
                  setOpen(false)
                  router.push(`/ai/${current.id}`)
                }}
              >
                <Maximize2 className="size-3.5" />
                <span className="sr-only">{t("expand")}</span>
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)}>
              <X className="size-4" />
              <span className="sr-only">{t("close")}</span>
            </Button>
          </div>

          {renaming && (
            <div className="flex items-center gap-2 border-b p-2">
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void onRename()}
                className="h-8"
                autoFocus
              />
              <Button size="sm" onClick={() => void onRename()}>
                {t("rename")}
              </Button>
            </div>
          )}
          {confirmDelete && (
            <div className="flex items-center justify-between gap-2 border-b p-2 text-sm">
              <span className="text-muted-foreground">{t("deleteChatConfirm")}</span>
              <div className="flex gap-1.5">
                <Button variant="destructive" size="sm" onClick={() => void onDelete()}>
                  {t("deleteChat")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                  {t("close")}
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 border-b px-3 py-1.5">
            <span className="text-muted-foreground text-xs">{t("module")}</span>
            <ModuleSelect
              modules={modules}
              value={current?.moduleId ?? ""}
              onChange={(v) => void onModuleChange(v)}
            />
          </div>

          <div className="min-h-0 flex-1 p-3">
            {current ? (
              <Chat
                key={current.id}
                conversationId={current.id}
                initialMessages={initialMessages}
                models={models}
                initialModel={initialModel}
                className="h-full min-h-0"
                suggestions={suggestions}
              />
            ) : (
              <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
                <Loader2 className="size-4 animate-spin" />
              </div>
            )}
          </div>
        </div>
      )}
      <div
        className={cn(
          "fixed right-5 bottom-5 z-50 hidden lg:block",
          isFullscreenChat && "lg:hidden"
        )}
      >
        <Button
          size="icon"
          className="size-12 rounded-full shadow-lg"
          onClick={() => (open ? setOpen(false) : void openDock())}
        >
          {pending ? (
            <Loader2 className="size-5 animate-spin" />
          ) : open ? (
            <X className="size-5" />
          ) : (
            <MessageCircle className="size-5" />
          )}
          <span className="sr-only">{t("quickChat")}</span>
        </Button>
      </div>
    </div>
  )
}
