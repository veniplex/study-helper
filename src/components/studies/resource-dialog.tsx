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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createResource, updateResource } from "@/app/[locale]/(app)/studies/actions"
import type { ResourceType } from "@/db/schema/studies"

export type ResourceData = {
  id: string
  type: ResourceType
  name: string
  url: string
  username: string | null
  note: string | null
}

const RESOURCE_TYPES: ResourceType[] = [
  "moodle",
  "ilias",
  "fileshare",
  "discord",
  "teams",
  "website",
  "other",
]

export function ResourceDialog({
  moduleId,
  programId,
  resource,
  open: controlledOpen,
  onOpenChange,
}: {
  moduleId?: string
  programId?: string
  /** Edit mode: the resource to update. */
  resource?: ResourceData
  /** Controlled mode (no trigger) — used by the context menu. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const t = useTranslations("studies.resources")
  const tStudies = useTranslations("studies")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const controlled = controlledOpen !== undefined
  const open = controlled ? controlledOpen : uncontrolledOpen
  const setOpen = (v: boolean) => {
    if (controlled) onOpenChange?.(v)
    else setUncontrolledOpen(v)
  }
  const [pending, setPending] = React.useState(false)
  const [type, setType] = React.useState<ResourceType>(resource?.type ?? "moodle")
  const isEdit = Boolean(resource)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const payload = {
      type,
      name: String(form.get("name")),
      url: String(form.get("url")),
      username: String(form.get("username") || "") || null,
      note: String(form.get("note") || "") || null,
    }
    setPending(true)
    try {
      if (isEdit) await updateResource(resource!.id, payload)
      else await createResource({ moduleId, programId }, payload)
      toast.success(isEdit ? tCommon("save") : tStudies("created"))
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
      {!controlled && isEdit && (
        <DialogTrigger render={<Button variant="ghost" size="icon" className="size-7" />}>
          <Pencil className="size-3.5" />
          <span className="sr-only">{t("edit")}</span>
        </DialogTrigger>
      )}
      {!controlled && !isEdit && (
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <Plus className="size-4" />
          {t("add")}
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("edit") : t("add")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("type")}</Label>
              <Select value={type} onValueChange={(v) => setType(v as ResourceType)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{t(`types.${type}`)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {RESOURCE_TYPES.map((key) => (
                    <SelectItem key={key} value={key}>
                      {t(`types.${key}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-name">{t("name")}</Label>
              <Input id="r-name" name="name" defaultValue={resource?.name} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-url">{t("url")}</Label>
            <Input
              id="r-url"
              name="url"
              type="url"
              placeholder="https://"
              defaultValue={resource?.url}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-user">{t("username")}</Label>
            <Input id="r-user" name="username" defaultValue={resource?.username ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-note">{t("note")}</Label>
            <Textarea id="r-note" name="note" rows={2} defaultValue={resource?.note ?? ""} />
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
