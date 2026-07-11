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
import { createModule, updateModule } from "@/app/[locale]/(app)/studies/actions"
import type { AssessmentType, BonusType, ModuleStatus } from "@/db/schema/studies"
import {
  getModuleColorClasses,
  getModuleIcon,
  MODULE_COLOR_KEYS,
  MODULE_ICON_KEYS,
} from "@/lib/module-visuals"
import { cn } from "@/lib/utils"

const ASSESSMENT_TYPES: AssessmentType[] = [
  "exam",
  "term_paper",
  "oral_presentation",
  "oral_exam",
  "project",
  "other",
]
const ASSESSMENT_LABEL_KEY: Record<AssessmentType, string> = {
  exam: "assessmentExam",
  term_paper: "assessmentTermPaper",
  oral_presentation: "assessmentOralPresentation",
  oral_exam: "assessmentOralExam",
  project: "assessmentProject",
  other: "assessmentOther",
}
const BONUS_TYPES: BonusType[] = ["none", "percent_points", "grade_steps"]
const BONUS_LABEL_KEY: Record<BonusType, string> = {
  none: "bonusNone",
  percent_points: "bonusPercentPoints",
  grade_steps: "bonusGradeSteps",
}

/** Renders a module icon from its stored key (stable, module-scope). */
function IconGlyph({ iconKey, className }: { iconKey?: string | null; className?: string }) {
  return React.createElement(getModuleIcon(iconKey), { className })
}

type ModuleData = {
  id?: string
  name: string
  code: string | null
  ects: number | null
  instructor: string | null
  examType: string | null
  status: ModuleStatus
  notes: string | null
  icon?: string | null
  color?: string | null
  maxAttempts?: number
  passFail?: boolean
  bonusType?: BonusType
  bonusValue?: string | number | null
  bonusMinAvgPercent?: string | number | null
  bonusMinCompletedShare?: string | number | null
  assessmentType?: AssessmentType
}

export function ModuleDialog({
  semesterId,
  module,
  open: controlledOpen,
  onOpenChange,
}: {
  semesterId: string
  module?: ModuleData
  /** Controlled mode (no trigger rendered) — used by the sidebar menus. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const t = useTranslations("studies")
  const tDialog = useTranslations("studies.moduleDialog")
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
  const [status, setStatus] = React.useState<ModuleStatus>(module?.status ?? "planned")
  const [icon, setIcon] = React.useState<string | null>(module?.icon ?? null)
  const [color, setColor] = React.useState<string | null>(module?.color ?? null)
  const [passFail, setPassFail] = React.useState(module?.passFail ?? false)
  const [assessmentType, setAssessmentType] = React.useState<AssessmentType>(
    module?.assessmentType ?? "exam"
  )
  const [bonusType, setBonusType] = React.useState<BonusType>(module?.bonusType ?? "none")
  const isEdit = Boolean(module?.id)

  const statusLabels: Record<ModuleStatus, string> = {
    planned: t("module.statusPlanned"),
    active: t("module.statusActive"),
    passed: t("module.statusPassed"),
    failed: t("module.statusFailed"),
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const numOrNull = (key: string) =>
      form.get(key) !== null && String(form.get(key)).trim() !== ""
        ? Number(form.get(key))
        : null
    const payload = {
      name: String(form.get("name")),
      code: String(form.get("code") || "") || null,
      ects: numOrNull("ects"),
      instructor: String(form.get("instructor") || "") || null,
      examType: String(form.get("examType") || "") || null,
      status,
      notes: String(form.get("notes") || "") || null,
      icon,
      color,
      maxAttempts: Number(form.get("maxAttempts")) || 3,
      passFail,
      assessmentType,
      bonusType,
      bonusValue: bonusType === "none" ? null : numOrNull("bonusValue"),
      bonusMinAvgPercent: bonusType === "none" ? null : numOrNull("bonusMinAvgPercent"),
      bonusMinCompletedShare: bonusType === "none" ? null : numOrNull("bonusMinCompletedShare"),
    }
    setPending(true)
    try {
      if (isEdit) await updateModule(module!.id!, payload)
      else await createModule(semesterId, payload)
      toast.success(isEdit ? t("updated") : t("created"))
      setOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  const previewColor = getModuleColorClasses(color)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!controlled && (
        <DialogTrigger
          render={
            isEdit ? <Button variant="ghost" size="icon-sm" /> : <Button variant="outline" size="sm" />
          }
        >
          {isEdit ? (
            <Pencil className="size-3.5" />
          ) : (
            <>
              <Plus className="size-4" />
              {t("newModule")}
            </>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editModule") : t("newModule")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-lg",
                previewColor.soft,
                previewColor.text
              )}
            >
              <IconGlyph iconKey={icon} className="size-5" />
            </span>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="m-name">{t("module.name")}</Label>
              <Input id="m-name" name="name" defaultValue={module?.name} required />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="m-code">{t("module.code")}</Label>
              <Input id="m-code" name="code" defaultValue={module?.code ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-ects">{t("module.ects")}</Label>
              <Input
                id="m-ects"
                name="ects"
                type="number"
                min={0}
                max={60}
                defaultValue={module?.ects ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-instructor">{t("module.instructor")}</Label>
              <Input id="m-instructor" name="instructor" defaultValue={module?.instructor ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-exam">{t("module.examType")}</Label>
              <Input id="m-exam" name="examType" defaultValue={module?.examType ?? ""} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("module.status")}</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ModuleStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{statusLabels[status]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(statusLabels) as ModuleStatus[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {statusLabels[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Appearance: icon + color */}
          <div className="space-y-2">
            <Label>{tDialog("appearance")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {MODULE_ICON_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setIcon(key === icon ? null : key)}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-md border transition-colors",
                    icon === key
                      ? "border-primary bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent border-transparent"
                  )}
                  aria-label={key}
                  aria-pressed={icon === key}
                >
                  <IconGlyph iconKey={key} className="size-4" />
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {MODULE_COLOR_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setColor(key === color ? null : key)}
                  className={cn(
                    "size-6 rounded-full ring-offset-2 ring-offset-background transition-shadow",
                    getModuleColorClasses(key).dot,
                    color === key && "ring-foreground ring-2"
                  )}
                  aria-label={key}
                  aria-pressed={color === key}
                />
              ))}
            </div>
          </div>

          {/* Grading: assessment, attempts, pass/fail */}
          <div className="space-y-3 border-t pt-4">
            <Label className="text-sm font-semibold">{tDialog("grading")}</Label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="m-assessment">{tDialog("assessmentType")}</Label>
                <Select
                  value={assessmentType}
                  onValueChange={(v) => setAssessmentType(v as AssessmentType)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{tDialog(ASSESSMENT_LABEL_KEY[assessmentType])}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ASSESSMENT_TYPES.map((key) => (
                      <SelectItem key={key} value={key}>
                        {tDialog(ASSESSMENT_LABEL_KEY[key])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-attempts">{tDialog("maxAttempts")}</Label>
                <Input
                  id="m-attempts"
                  name="maxAttempts"
                  type="number"
                  min={1}
                  max={10}
                  defaultValue={module?.maxAttempts ?? 3}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={passFail} onCheckedChange={setPassFail} />
              {tDialog("passFail")}
            </label>
          </div>

          {/* Bonus */}
          <div className="space-y-3 border-t pt-4">
            <Label className="text-sm font-semibold">{tDialog("bonus")}</Label>
            <div className="space-y-1.5">
              <Label>{tDialog("bonusType")}</Label>
              <Select value={bonusType} onValueChange={(v) => setBonusType(v as BonusType)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{tDialog(BONUS_LABEL_KEY[bonusType])}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {BONUS_TYPES.map((key) => (
                    <SelectItem key={key} value={key}>
                      {tDialog(BONUS_LABEL_KEY[key])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {bonusType !== "none" && (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="m-bonus-value">{tDialog("bonusValue")}</Label>
                    <Input
                      id="m-bonus-value"
                      name="bonusValue"
                      type="number"
                      step="0.1"
                      min={0}
                      placeholder={
                        bonusType === "percent_points"
                          ? tDialog("bonusValueHintPercent")
                          : tDialog("bonusValueHintSteps")
                      }
                      defaultValue={module?.bonusValue != null ? String(module.bonusValue) : ""}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="m-bonus-avg">{tDialog("bonusMinAvg")}</Label>
                    <Input
                      id="m-bonus-avg"
                      name="bonusMinAvgPercent"
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={
                        module?.bonusMinAvgPercent != null ? String(module.bonusMinAvgPercent) : ""
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="m-bonus-share">{tDialog("bonusMinShare")}</Label>
                    <Input
                      id="m-bonus-share"
                      name="bonusMinCompletedShare"
                      type="number"
                      step="0.1"
                      min={0}
                      max={1}
                      defaultValue={
                        module?.bonusMinCompletedShare != null
                          ? String(module.bonusMinCompletedShare)
                          : ""
                      }
                    />
                  </div>
                </div>
                <p className="text-muted-foreground text-xs">{tDialog("bonusHint")}</p>
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="m-notes">{t("module.notes")}</Label>
            <Textarea id="m-notes" name="notes" rows={3} defaultValue={module?.notes ?? ""} />
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
