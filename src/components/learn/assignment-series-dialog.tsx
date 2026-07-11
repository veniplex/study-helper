"use client"

import * as React from "react"
import { CopyPlus, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { createAssignmentSeries } from "@/app/[locale]/(app)/assignment-actions"
import type { AssignmentKind } from "@/db/schema/assignments"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

/** Creates a numbered series of assignments, e.g. "Blatt 1" … "Blatt 12". */
export function AssignmentSeriesDialog({ moduleId }: { moduleId: string }) {
  const t = useTranslations("assignments.series")
  const tCommon = useTranslations("common")
  const tKind = useTranslations("assignments.kind")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [kind, setKind] = React.useState<AssignmentKind>("graded")
  const [interval, setInterval] = React.useState(1)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    try {
      const result = await createAssignmentSeries(moduleId, {
        title: String(form.get("title")),
        kind,
        firstDueDate: String(form.get("firstDueDate")),
        count: Number(form.get("count")),
        intervalWeeks: interval,
        pointsMax: form.get("pointsMax") ? Number(form.get("pointsMax")) : null,
      })
      toast.success(t("done", { count: result.count }))
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
      <DialogTrigger render={<Button variant="outline" />}>
        <CopyPlus className="size-4" />
        {t("button")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="s-title">{t("baseTitle")}</Label>
            <Input id="s-title" name="title" placeholder={t("baseTitlePlaceholder")} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="s-due">{t("firstDueDate")}</Label>
              <Input id="s-due" name="firstDueDate" type="date" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-count">{t("count")}</Label>
              <Input
                id="s-count"
                name="count"
                type="number"
                min={2}
                max={30}
                defaultValue={12}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("interval")}</Label>
              <Select value={String(interval)} onValueChange={(v) => setInterval(Number(v) || 1)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{t("intervalLabel", { weeks: interval })}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {t("intervalLabel", { weeks: n })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("kind")}</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as AssignmentKind)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{tKind(kind)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="graded">{tKind("graded")}</SelectItem>
                  <SelectItem value="practice">{tKind("practice")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-points">{t("pointsMax")}</Label>
              <Input id="s-points" name="pointsMax" type="number" min={0} step="0.5" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {t("create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
