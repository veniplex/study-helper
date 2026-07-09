"use client"

import * as React from "react"
import { Loader2, Plus } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { addGrade } from "@/app/[locale]/(app)/studies/actions"

export function GradeDialog({ moduleId }: { moduleId: string }) {
  const t = useTranslations("studies.grades")
  const tStudies = useTranslations("studies")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const payload = {
      value: Number(String(form.get("value")).replace(",", ".")),
      weight: form.get("weight") ? Number(String(form.get("weight")).replace(",", ".")) : 1,
      attempt: form.get("attempt") ? Number(form.get("attempt")) : 1,
      gradedAt: String(form.get("gradedAt") || "") || null,
      note: String(form.get("note") || "") || null,
    }
    setPending(true)
    try {
      await addGrade(moduleId, payload)
      toast.success(tStudies("created"))
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
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Plus className="size-4" />
        {t("add")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("add")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="g-value">{t("value")}</Label>
              <Input id="g-value" name="value" inputMode="decimal" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-weight">{t("weight")}</Label>
              <Input id="g-weight" name="weight" inputMode="decimal" defaultValue="1" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-attempt">{t("attempt")}</Label>
              <Input id="g-attempt" name="attempt" type="number" min={1} defaultValue={1} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-date">{t("date")}</Label>
            <Input id="g-date" name="gradedAt" type="date" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-note">{t("note")}</Label>
            <Input id="g-note" name="note" />
          </div>
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
