"use client"

import * as React from "react"
import { Loader2, Plus, RotateCcw, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { updateGradeScale } from "@/app/[locale]/(app)/studies/actions"
import { DEFAULT_GERMAN_SCALE } from "@/lib/grades"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Row = { minPercent: number; grade: number }

export function GradeScaleEditor({
  programId,
  initialScale,
}: {
  programId: string
  initialScale: Row[] | null
}) {
  const t = useTranslations("studies.programSettings")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [rows, setRows] = React.useState<Row[]>(initialScale ?? DEFAULT_GERMAN_SCALE)
  const [pending, setPending] = React.useState(false)

  function update(i: number, key: keyof Row, value: number) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)))
  }
  function addRow() {
    setRows((r) => [...r, { minPercent: 0, grade: 4 }])
  }
  function removeRow(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i))
  }

  async function onSave() {
    setPending(true)
    try {
      const sorted = [...rows].sort((a, b) => b.minPercent - a.minPercent)
      await updateGradeScale(programId, sorted)
      toast.success(t("saved"))
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">{t("gradeScaleHint")}</p>
      <div className="space-y-2">
        <div className="text-muted-foreground grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium">
          <span>{t("minPercent")}</span>
          <span>{t("grade")}</span>
          <span />
        </div>
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
            <Input
              type="number"
              min={0}
              max={100}
              value={row.minPercent}
              onChange={(e) => update(i, "minPercent", Number(e.target.value))}
            />
            <Input
              type="number"
              min={1}
              max={6}
              step="0.1"
              value={row.grade}
              onChange={(e) => update(i, "grade", Number(e.target.value))}
            />
            <Button variant="ghost" size="icon-sm" onClick={() => removeRow(i)}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus className="size-4" />
          {t("addRow")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setRows(DEFAULT_GERMAN_SCALE)}>
          <RotateCcw className="size-4" />
          {t("reset")}
        </Button>
        <Button size="sm" onClick={onSave} disabled={pending} className="ml-auto">
          {pending && <Loader2 className="size-4 animate-spin" />}
          {tCommon("save")}
        </Button>
      </div>
    </div>
  )
}
