"use client"

import * as React from "react"
import { Loader2, RotateCcw } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { retryThesis } from "@/app/[locale]/(app)/thesis/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export function RetryThesisButton({ thesisId }: { thesisId: string }) {
  const t = useTranslations("thesis")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  async function onConfirm() {
    setPending(true)
    try {
      await retryThesis(thesisId)
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
        <RotateCcw className="size-4" />
        {t("newAttempt")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("newAttempt")}</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">{t("newAttemptConfirm")}</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t("newAttempt")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
