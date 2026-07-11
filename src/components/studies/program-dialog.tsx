"use client"

import * as React from "react"
import { Loader2, Pencil, Plus } from "lucide-react"
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
import { createProgram, updateProgram } from "@/app/[locale]/(app)/studies/actions"

type ProgramData = {
  id?: string
  name: string
  degreeType: string | null
  institution: string | null
  targetEcts: number | null
  /** Max thesis attempts (Studiengang-Regel). */
  thesisMaxAttempts?: number
}

export function ProgramDialog({ program }: { program?: ProgramData }) {
  const t = useTranslations("studies")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const isEdit = Boolean(program?.id)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const payload = {
      name: String(form.get("name")),
      degreeType: String(form.get("degreeType") || "") || null,
      institution: String(form.get("institution") || "") || null,
      targetEcts: form.get("targetEcts") ? Number(form.get("targetEcts")) : null,
      thesisMaxAttempts: Number(form.get("thesisMaxAttempts")) || 2,
    }
    setPending(true)
    try {
      if (isEdit) await updateProgram(program!.id!, payload)
      else await createProgram(payload)
      toast.success(isEdit ? t("updated") : t("created"))
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
      <DialogTrigger
        render={
          isEdit ? (
            <Button variant="ghost" size="icon-sm" />
          ) : (
            <Button />
          )
        }
      >
        {isEdit ? (
          <Pencil className="size-3.5" />
        ) : (
          <>
            <Plus className="size-4" />
            {t("newProgram")}
          </>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editProgram") : t("newProgram")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="p-name">{t("program.name")}</Label>
            <Input id="p-name" name="name" defaultValue={program?.name} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-degree">{t("program.degreeType")}</Label>
              <Input id="p-degree" name="degreeType" defaultValue={program?.degreeType ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-inst">{t("program.institution")}</Label>
              <Input id="p-inst" name="institution" defaultValue={program?.institution ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-ects">{t("program.targetEcts")}</Label>
              <Input
                id="p-ects"
                name="targetEcts"
                type="number"
                min={1}
                defaultValue={program?.targetEcts ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-thesis-attempts">{t("program.thesisMaxAttempts")}</Label>
              <Input
                id="p-thesis-attempts"
                name="thesisMaxAttempts"
                type="number"
                min={1}
                max={5}
                defaultValue={program?.thesisMaxAttempts ?? 2}
              />
            </div>
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
