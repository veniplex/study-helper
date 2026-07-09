"use client"

import * as React from "react"
import { Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"

export function DeleteButton({
  action,
  redirectTo,
  size = "icon-sm",
}: {
  action: () => Promise<{ ok: boolean }>
  redirectTo?: string
  size?: "icon-sm" | "sm"
}) {
  const t = useTranslations("studies")
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  async function onDelete() {
    if (!confirm(t("deleteConfirm"))) return
    setPending(true)
    try {
      await action()
      toast.success(t("deleted"))
      if (redirectTo) router.push(redirectTo)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <Button variant="ghost" size={size} onClick={onDelete} disabled={pending}>
      <Trash2 className="text-destructive size-3.5" />
    </Button>
  )
}
