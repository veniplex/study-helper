"use client"

import { useTranslations } from "next-intl"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type ModuleOption = { id: string; name: string }

export function ModuleSelect({
  modules,
  value,
  onChange,
}: {
  modules: ModuleOption[]
  value: string
  onChange: (value: string) => void
}) {
  const t = useTranslations("learn")

  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? "")}>
      <SelectTrigger className="w-full">
        <SelectValue>
          {modules.find((m) => m.id === value)?.name ?? t("noModule")}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="">{t("noModule")}</SelectItem>
        {modules.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            {m.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
