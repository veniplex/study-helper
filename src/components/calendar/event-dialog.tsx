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
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { createEvent, updateEvent } from "@/app/[locale]/(app)/calendar/actions"
import type { EventType } from "@/db/schema/studies"

const EVENT_TYPES: EventType[] = ["exam", "deadline", "lecture", "other"]
const REMINDER_OPTIONS = [10080, 1440, 60] as const

export type EventData = {
  id?: string
  title: string
  type: EventType
  startsAt: string // ISO local "YYYY-MM-DDTHH:mm"
  endsAt: string | null
  location: string | null
  notes: string | null
  moduleId: string | null
  reminderOffsets: number[]
}

export type ModuleOption = { id: string; name: string }

export function EventDialog({
  event,
  modules,
}: {
  event?: EventData
  modules: ModuleOption[]
}) {
  const t = useTranslations("calendar")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [type, setType] = React.useState<EventType>(event?.type ?? "exam")
  const [moduleId, setModuleId] = React.useState<string>(event?.moduleId ?? "")
  const [reminders, setReminders] = React.useState<number[]>(event?.reminderOffsets ?? [1440])
  const isEdit = Boolean(event?.id)

  const typeLabels: Record<EventType, string> = {
    exam: t("event.typeExam"),
    deadline: t("event.typeDeadline"),
    lecture: t("event.typeLecture"),
    other: t("event.typeOther"),
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const payload = {
      title: String(form.get("title")),
      type,
      startsAt: String(form.get("startsAt")),
      endsAt: String(form.get("endsAt") || "") || null,
      location: String(form.get("location") || "") || null,
      notes: String(form.get("notes") || "") || null,
      moduleId: moduleId || null,
      reminderOffsets: reminders,
    }
    setPending(true)
    try {
      if (isEdit) await updateEvent(event!.id!, payload)
      else await createEvent(payload)
      toast.success(tCommon("save"))
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
            {t("newEvent")}
          </>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editEvent") : t("newEvent")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="e-title">{t("event.title")}</Label>
            <Input id="e-title" name="title" defaultValue={event?.title} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("event.type")}</Label>
              <Select value={type} onValueChange={(v) => setType(v as EventType)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{typeLabels[type]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((key) => (
                    <SelectItem key={key} value={key}>
                      {typeLabels[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("event.module")}</Label>
              <Select value={moduleId} onValueChange={(v) => setModuleId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {modules.find((m) => m.id === moduleId)?.name ?? t("event.noModule")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t("event.noModule")}</SelectItem>
                  {modules.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-start">{t("event.startsAt")}</Label>
              <Input
                id="e-start"
                name="startsAt"
                type="datetime-local"
                defaultValue={event?.startsAt}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-end">{t("event.endsAt")}</Label>
              <Input
                id="e-end"
                name="endsAt"
                type="datetime-local"
                defaultValue={event?.endsAt ?? ""}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-location">{t("event.location")}</Label>
            <Input id="e-location" name="location" defaultValue={event?.location ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-notes">{t("event.notes")}</Label>
            <Textarea id="e-notes" name="notes" rows={2} defaultValue={event?.notes ?? ""} />
          </div>
          <div className="space-y-2">
            <Label>{t("event.reminders")}</Label>
            {REMINDER_OPTIONS.map((minutes) => (
              <div key={minutes} className="flex items-center gap-2">
                <Switch
                  id={`rem-${minutes}`}
                  checked={reminders.includes(minutes)}
                  onCheckedChange={(on) =>
                    setReminders((r) =>
                      on ? [...r, minutes] : r.filter((m) => m !== minutes)
                    )
                  }
                />
                <Label htmlFor={`rem-${minutes}`} className="font-normal">
                  {t(`event.reminderOptions.${minutes}`)}
                </Label>
              </div>
            ))}
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
