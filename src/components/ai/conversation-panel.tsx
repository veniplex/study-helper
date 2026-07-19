"use client"

import * as React from "react"
import {
  Check,
  ChevronDown,
  Loader2,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import type { UIMessage } from "ai"
import { useRouter } from "@/i18n/navigation"
import {
  createConversation,
  deleteConversation,
  getConversationMessages,
  listConversations,
  renameConversation,
  updateConversationMode,
  updateConversationModule,
} from "@/app/[locale]/(app)/ai/actions"
import { Chat } from "@/components/ai/chat"
import { usePageContext } from "@/components/ai/page-context"
import { ModuleSelect, type ModuleOption } from "@/components/learn/module-select"
import { CHAT_MODES } from "@/lib/ai/modes"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ConfirmDeleteDialog } from "@/components/studies/confirm-delete-dialog"
import { CHAT_OPEN_EVENT, LAST_CHAT_KEY } from "@/components/ai/chat-events"

export type ConversationMeta = {
  id: string
  title: string
  moduleName: string | null
  moduleId: string | null
  /** Tutor mode; older callers may omit it — treated as "general". */
  mode?: string
}

/**
 * Full conversation UI (header with conversation switcher, new/rename/delete,
 * module assignment, chat) — shared by the floating dock and the fullscreen
 * page so both offer the same functionality.
 */
export function ConversationPanel({
  variant,
  model,
  modules,
  initialConversation,
  initialMessages: initialMessagesProp,
  targetConversationId,
  onClose,
}: {
  variant: "dock" | "page"
  /** Fixed chat model (the model switcher was removed). */
  model: string | null
  modules: ModuleOption[]
  /** Page variant: conversation preloaded on the server. */
  initialConversation?: ConversationMeta
  initialMessages?: UIMessage[]
  /** Dock variant: switch to this conversation when the value changes. */
  targetConversationId?: string | null
  onClose?: () => void
}) {
  const t = useTranslations("ai")
  const router = useRouter()
  const rawPageContext = usePageContext()
  const pageContext = rawPageContext ?? { moduleId: null, moduleName: null }

  const [pending, setPending] = React.useState(false)
  const [conversations, setConversations] = React.useState<ConversationMeta[]>([])
  const [current, setCurrent] = React.useState<ConversationMeta | null>(
    initialConversation ?? null
  )
  const [initialMessages, setInitialMessages] = React.useState<UIMessage[]>(
    initialMessagesProp ?? []
  )
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

  const switchTo = React.useCallback(async (meta: ConversationMeta) => {
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
  }, [])

  const startNew = React.useCallback(
    async (list?: ConversationMeta[]) => {
      const moduleId = pageContext.moduleId ?? null
      const { id } = await createConversation(moduleId, "general")
      const meta: ConversationMeta = {
        id,
        title: t("newConversation"),
        moduleId,
        moduleName: pageContext.moduleName ?? null,
        mode: "general",
      }
      setConversations([meta, ...(list ?? conversations)])
      setInitialMessages([])
      setCurrent(meta)
      window.localStorage.setItem(LAST_CHAT_KEY, id)
    },
    [pageContext.moduleId, pageContext.moduleName, conversations, t]
  )

  // Initial load: fetch the conversation list; without a preloaded
  // conversation also open the last-used (or a fresh) one.
  const loadedRef = React.useRef(false)
  React.useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    void (async () => {
      setPending(true)
      try {
        const list = await listConversations()
        setConversations(list)
        if (initialConversation) {
          window.localStorage.setItem(LAST_CHAT_KEY, initialConversation.id)
          return
        }
        const lastId = window.localStorage.getItem(LAST_CHAT_KEY)
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
    })()
  }, [initialConversation, startNew])

  // Dock: external requests (bottom-nav tab, minimize button) target a
  // specific conversation while the panel is already mounted.
  React.useEffect(() => {
    if (!targetConversationId || targetConversationId === current?.id) return
    const meta = conversations.find((c) => c.id === targetConversationId)
    // Deferred: switchTo does a server round-trip before setting state.
    if (meta) queueMicrotask(() => void switchTo(meta))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetConversationId])

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

  async function onModeChange(mode: string) {
    if (!current) return
    try {
      await updateConversationMode(current.id, mode)
      setCurrent({ ...current, mode })
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

  function expand() {
    if (!current) return
    onClose?.()
    router.push(`/ai/${current.id}`)
  }

  function minimize() {
    if (!current) return
    window.localStorage.setItem(LAST_CHAT_KEY, current.id)
    if (window.history.length > 1) router.back()
    else router.push("/")
    window.dispatchEvent(
      new CustomEvent(CHAT_OPEN_EVENT, { detail: { conversationId: current.id } })
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
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
        {variant === "dock" && current && (
          <Button
            variant="ghost"
            size="icon-sm"
            title={t("expand")}
            className="hidden lg:inline-flex"
            onClick={expand}
          >
            <Maximize2 className="size-3.5" />
            <span className="sr-only">{t("expand")}</span>
          </Button>
        )}
        {variant === "page" && current && (
          <Button variant="ghost" size="icon-sm" title={t("minimize")} onClick={minimize}>
            <Minimize2 className="size-4" />
            <span className="sr-only">{t("minimize")}</span>
          </Button>
        )}
        {variant === "dock" && (
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="size-4" />
            <span className="sr-only">{t("close")}</span>
          </Button>
        )}
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
      <ConfirmDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        label={current?.title ?? t("deleteChat")}
        onConfirm={onDelete}
      />

      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-1.5">
        <span className="text-muted-foreground text-xs">{t("module")}</span>
        <ModuleSelect
          modules={modules}
          value={current?.moduleId ?? ""}
          onChange={(v) => void onModuleChange(v)}
        />
        <span className="text-muted-foreground ml-2 text-xs">{t("modeLabel")}</span>
        <select
          value={current?.mode ?? "general"}
          onChange={(e) => void onModeChange(e.target.value)}
          className="border-input bg-background h-7 rounded-md border px-1.5 text-xs"
          aria-label={t("modeLabel")}
        >
          {CHAT_MODES.map((m) => (
            <option key={m} value={m}>
              {t(`modes.${m}.label`)}
            </option>
          ))}
        </select>
      </div>

      <div className="min-h-0 flex-1 p-3">
        {current ? (
          <Chat
            key={current.id}
            conversationId={current.id}
            initialMessages={initialMessages}
            model={model}
            className="h-full min-h-0"
            suggestions={suggestions}
          />
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          </div>
        )}
      </div>
    </div>
  )
}
