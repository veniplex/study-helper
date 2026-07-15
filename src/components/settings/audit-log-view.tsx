"use client"

import * as React from "react"
import { Bot, Loader2, RotateCcw, User } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { undoAuditEntry } from "@/app/[locale]/(app)/settings/audit-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type AuditEntry = {
  id: string
  actor: "user" | "ai"
  operation: string
  entityType: string
  entityLabel: string
  undone: boolean
  createdAt: string
  undoable: boolean
  /** Token count for AI operations (null for non-AI CRUD). */
  tokens: number | null
  model: string | null
  feature: string | null
}

const OPERATIONS = [
  "create",
  "update",
  "delete",
  "undo",
  "ai_read",
  "ai_generate",
  "ai_embed",
  "ai_summarize",
  "ai_transcribe",
  "ai_extract",
] as const
const KNOWN_ENTITIES = [
  "deck",
  "flashcard",
  "quiz",
  "question",
  "goal",
  "event",
  "material",
  "plan",
  "thesis",
  "assignment",
] as const

export function AuditLogView({ entries }: { entries: AuditEntry[] }) {
  const t = useTranslations("audit")
  const format = useFormatter()
  const router = useRouter()
  const [actorFilter, setActorFilter] = React.useState("")
  const [operationFilter, setOperationFilter] = React.useState("")
  const [confirmEntry, setConfirmEntry] = React.useState<AuditEntry | null>(null)
  const [pending, setPending] = React.useState(false)

  const filtered = entries.filter(
    (e) =>
      (!actorFilter || e.actor === actorFilter) &&
      (!operationFilter || e.operation === operationFilter)
  )

  async function onUndo(entry: AuditEntry) {
    setPending(true)
    try {
      await undoAuditEntry(entry.id)
      toast.success(t("undone"))
      setConfirmEntry(null)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Select value={actorFilter} onValueChange={(v) => setActorFilter(v ?? "")}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue>
              {actorFilter ? t(`actor.${actorFilter}`) : t("filterActor")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t("filterActor")}</SelectItem>
            <SelectItem value="user">{t("actor.user")}</SelectItem>
            <SelectItem value="ai">{t("actor.ai")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={operationFilter} onValueChange={(v) => setOperationFilter(v ?? "")}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue>
              {operationFilter ? t(`operation.${operationFilter}`) : t("filterOperation")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t("filterOperation")}</SelectItem>
            {OPERATIONS.map((op) => (
              <SelectItem key={op} value={op}>
                {t(`operation.${op}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">{t("empty")}</p>
      ) : (
        <ul className="space-y-1.5">
          {filtered.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <Badge variant={entry.actor === "ai" ? "default" : "secondary"} className="gap-1">
                {entry.actor === "ai" ? <Bot className="size-3" /> : <User className="size-3" />}
                {t(`actor.${entry.actor}`)}
              </Badge>
              <Badge variant="outline">{t(`operation.${entry.operation}`)}</Badge>
              <span className="text-muted-foreground text-xs">
                {(KNOWN_ENTITIES as readonly string[]).includes(entry.entityType)
                  ? t(`entity.${entry.entityType}`)
                  : entry.entityType}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{entry.entityLabel}</span>
              {entry.tokens != null && (
                <Badge
                  variant="outline"
                  className="text-muted-foreground gap-1"
                  title={[entry.feature, entry.model].filter(Boolean).join(" · ") || undefined}
                >
                  {format.number(entry.tokens)} {t("tokens")}
                </Badge>
              )}
              <span className="text-muted-foreground text-xs">
                {format.dateTime(new Date(entry.createdAt), {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </span>
              {entry.undone ? (
                <Badge variant="outline" className="text-muted-foreground">
                  {t("undoneBadge")}
                </Badge>
              ) : entry.undoable ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title={t("undo")}
                  onClick={() => setConfirmEntry(entry)}
                >
                  <RotateCcw className="size-3.5" />
                  <span className="sr-only">{t("undo")}</span>
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={confirmEntry !== null} onOpenChange={(v) => !v && setConfirmEntry(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("undo")}</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            {confirmEntry &&
              t("undoConfirm", {
                operation: t(`operation.${confirmEntry.operation}`),
                label: confirmEntry.entityLabel,
              })}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmEntry(null)}>
              {t("cancel")}
            </Button>
            <Button
              disabled={pending}
              onClick={() => confirmEntry && void onUndo(confirmEntry)}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              {t("undo")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
