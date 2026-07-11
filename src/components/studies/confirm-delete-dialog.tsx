"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

/** Shared confirm-delete dialog used by the sidebar and dashboard context menus. */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  label,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  onConfirm: () => Promise<void>
}) {
  const t = useTranslations("studies")
  const tCommon = useTranslations("common")
  const [pending, setPending] = React.useState(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">{t("deleteConfirm")}</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              setPending(true)
              try {
                await onConfirm()
                onOpenChange(false)
              } catch (error) {
                toast.error(error instanceof Error ? error.message : String(error))
              } finally {
                setPending(false)
              }
            }}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {tCommon("delete")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
