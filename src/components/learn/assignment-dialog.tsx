"use client"

import * as React from "react"
import { Loader2, Pencil, Plus } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import {
  createAssignment,
  updateAssignment,
} from "@/app/[locale]/(app)/assignment-actions"
import type { AssignmentKind, AssignmentStatus } from "@/db/schema/assignments"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

const STATUSES: AssignmentStatus[] = ["open", "submitted", "graded"]
const KINDS: AssignmentKind[] = ["graded", "practice"]

export type AssignmentData = {
  id?: string
  title: string
  description: string | null
  dueDate: string | null
  status: AssignmentStatus
  kind: AssignmentKind
  pointsAchieved: string | null
  pointsMax: string | null
  materialIds: string[]
}

export function AssignmentDialog({
  moduleId,
  assignment,
  materials,
}: {
  moduleId: string
  assignment?: AssignmentData
  materials: { id: string; name: string }[]
}) {
  const t = useTranslations("assignments")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [status, setStatus] = React.useState<AssignmentStatus>(assignment?.status ?? "open")
  const [kind, setKind] = React.useState<AssignmentKind>(assignment?.kind ?? "graded")
  const [materialIds, setMaterialIds] = React.useState<string[]>(assignment?.materialIds ?? [])
  const isEdit = Boolean(assignment?.id)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const payload = {
      title: String(form.get("title")),
      description: String(form.get("description") || "") || null,
      dueDate: String(form.get("dueDate") || "") || null,
      status,
      kind,
      pointsAchieved: form.get("pointsAchieved")
        ? Number(form.get("pointsAchieved"))
        : null,
      pointsMax: form.get("pointsMax") ? Number(form.get("pointsMax")) : null,
      materialIds,
    }
    setPending(true)
    try {
      if (isEdit) await updateAssignment(assignment!.id!, payload)
      else await createAssignment(moduleId, payload)
      setOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={isEdit ? <Button variant="ghost" size="icon-sm" /> : <Button />}>
        {isEdit ? (
          <Pencil className="size-3.5" />
        ) : (
          <>
            <Plus className="size-4" />
            {t("new")}
          </>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("edit") : t("new")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="a-title">{t("fields.title")}</Label>
            <Input id="a-title" name="title" defaultValue={assignment?.title} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a-desc">{t("fields.description")}</Label>
            <Textarea
              id="a-desc"
              name="description"
              rows={2}
              defaultValue={assignment?.description ?? ""}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="a-due">{t("fields.dueDate")}</Label>
              <Input
                id="a-due"
                name="dueDate"
                type="date"
                defaultValue={assignment?.dueDate ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("fields.status")}</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as AssignmentStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{t(`status.${status}`)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`status.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("fields.kind")}</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as AssignmentKind)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{t(`kind.${kind}`)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {t(`kind.${k}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-points">{t("fields.pointsAchieved")}</Label>
              <Input
                id="a-points"
                name="pointsAchieved"
                type="number"
                step="0.5"
                min={0}
                defaultValue={assignment?.pointsAchieved ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-max">{t("fields.pointsMax")}</Label>
              <Input
                id="a-max"
                name="pointsMax"
                type="number"
                step="0.5"
                min={0}
                defaultValue={assignment?.pointsMax ?? ""}
              />
            </div>
          </div>
          {materials.length > 0 && (
            <div className="space-y-1.5">
              <Label>{t("fields.materials")}</Label>
              <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-md border p-2.5">
                {materials.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={materialIds.includes(m.id)}
                      onCheckedChange={(on) =>
                        setMaterialIds((ids) =>
                          on ? [...ids, m.id] : ids.filter((id) => id !== m.id)
                        )
                      }
                    />
                    <span className="truncate">{m.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {tCommon("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
