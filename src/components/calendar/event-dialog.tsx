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
import { ConfirmDeleteDialog } from "@/components/studies/confirm-delete-dialog"
import { createEvent, deleteEvent, updateEvent } from "@/app/[locale]/(app)/calendar/actions"
import { Trash2 } from "lucide-react"
import type { EventRecurrence, EventType } from "@/db/schema/studies"

const EVENT_TYPES: EventType[] = ["exam", "deadline", "lecture", "other"]
const RECURRENCE_OPTIONS: EventRecurrence[] = ["none", "weekly", "biweekly", "custom"]
const REMINDER_OPTIONS = [10080, 1440, 60] as const
// Monday-first display order; values are JS getDay() numbers.
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const
const INTERVAL_OPTIONS = [1, 2, 3, 4] as const

export type EventData = {
  id?: string
  title: string
  type: EventType
  startsAt: string // ISO local "YYYY-MM-DDTHH:mm" (or "YYYY-MM-DD" for all-day)
  endsAt: string | null
  location: string | null
  notes: string | null
  moduleId: string | null
  allDay?: boolean
  reminderOffsets: number[]
  recurrence?: EventRecurrence
  recurrenceUntil?: string | null
  recurrenceWeekdays?: number[] | null
  recurrenceInterval?: number | null
  /** Local ISO dates of individually-deleted occurrences (E18). */
  skipDates?: string[] | null
}

export type ModuleOption = { id: string; name: string }

export function EventDialog({
  event,
  modules,
  open: controlledOpen,
  onOpenChange,
}: {
  event?: EventData
  modules: ModuleOption[]
  /** Controlled mode (no trigger rendered) — used by the calendar view. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const t = useTranslations("calendar")
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
  const [type, setType] = React.useState<EventType>(event?.type ?? "exam")
  const [allDay, setAllDay] = React.useState(event?.allDay ?? false)
  const [moduleId, setModuleId] = React.useState<string>(event?.moduleId ?? "")
  const [reminders, setReminders] = React.useState<number[]>(event?.reminderOffsets ?? [1440])
  const [recurrence, setRecurrence] = React.useState<EventRecurrence>(event?.recurrence ?? "none")
  const [recurWeekdays, setRecurWeekdays] = React.useState<number[]>(
    event?.recurrenceWeekdays ?? []
  )
  const [recurInterval, setRecurInterval] = React.useState<number>(
    event?.recurrenceInterval ?? 1
  )
  const [confirmDelete, setConfirmDelete] = React.useState(false)
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
      allDay,
      startsAt: String(form.get("startsAt")),
      endsAt: String(form.get("endsAt") || "") || null,
      location: String(form.get("location") || "") || null,
      notes: String(form.get("notes") || "") || null,
      moduleId: moduleId || null,
      reminderOffsets: reminders,
      recurrence,
      recurrenceUntil:
        recurrence !== "none" ? String(form.get("recurrenceUntil") || "") || null : null,
      recurrenceWeekdays: recurrence === "custom" ? recurWeekdays : null,
      recurrenceInterval: recurrence === "custom" ? recurInterval : null,
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
      {!controlled && (
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
      )}
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
            <div className="col-span-full flex items-center gap-2">
              <Switch id="e-allday" checked={allDay} onCheckedChange={setAllDay} />
              <Label htmlFor="e-allday" className="font-normal">
                {t("event.allDay")}
              </Label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-start">{t("event.startsAt")}</Label>
              <Input
                key={allDay ? "start-date" : "start-dt"}
                id="e-start"
                name="startsAt"
                type={allDay ? "date" : "datetime-local"}
                defaultValue={
                  allDay ? event?.startsAt.slice(0, 10) : event?.startsAt
                }
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-end">{t("event.endsAt")}</Label>
              <Input
                key={allDay ? "end-date" : "end-dt"}
                id="e-end"
                name="endsAt"
                type={allDay ? "date" : "datetime-local"}
                defaultValue={allDay ? (event?.endsAt?.slice(0, 10) ?? "") : (event?.endsAt ?? "")}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("event.recurrence")}</Label>
              <Select value={recurrence} onValueChange={(v) => setRecurrence(v as EventRecurrence)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{t(`event.recurrenceOptions.${recurrence}`)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {RECURRENCE_OPTIONS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {t(`event.recurrenceOptions.${key}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {recurrence !== "none" && (
              <div className="space-y-1.5">
                <Label htmlFor="e-recur-until">{t("event.recurrenceUntil")}</Label>
                <Input
                  id="e-recur-until"
                  name="recurrenceUntil"
                  type="date"
                  defaultValue={event?.recurrenceUntil ?? ""}
                />
              </div>
            )}
            {recurrence === "custom" && (
              <>
                <div className="space-y-1.5">
                  <Label>{t("event.recurrenceWeekdays")}</Label>
                  <div className="flex gap-1">
                    {WEEKDAY_ORDER.map((day) => (
                      <button
                        key={day}
                        type="button"
                        aria-pressed={recurWeekdays.includes(day)}
                        onClick={() =>
                          setRecurWeekdays((prev) =>
                            prev.includes(day)
                              ? prev.filter((d) => d !== day)
                              : [...prev, day]
                          )
                        }
                        className={
                          recurWeekdays.includes(day)
                            ? "bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md text-xs font-medium"
                            : "hover:bg-muted flex size-8 items-center justify-center rounded-md border text-xs"
                        }
                      >
                        {t(`event.weekdaysShort.${day}`)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("event.recurrenceInterval")}</Label>
                  <Select
                    value={String(recurInterval)}
                    onValueChange={(v) => setRecurInterval(Number(v) || 1)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {t("event.recurrenceIntervalLabel", { weeks: recurInterval })}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {INTERVAL_OPTIONS.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {t("event.recurrenceIntervalLabel", { weeks: n })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
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
          <div className="flex items-center justify-end gap-2">
            {isEdit && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-destructive mr-auto"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-4" />
                <span className="sr-only">{tCommon("delete")}</span>
              </Button>
            )}
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
      {isEdit && (
        <ConfirmDeleteDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          label={event!.title}
          onConfirm={async () => {
            await deleteEvent(event!.id!)
            setOpen(false)
            router.refresh()
          }}
        />
      )}
    </Dialog>
  )
}
