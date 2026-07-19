"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useActionErrorToast } from "@/components/action-error-toast"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

/**
 * Shared scaffolding for the app's create/edit dialogs: dialog shell, form,
 * pending state, error toast and the cancel/submit footer. Callers provide the
 * fields as children and an onSubmit that receives the FormData — throw to
 * surface an error toast, resolve to close the dialog.
 *
 * Two modes: pass `trigger` for a self-managed dialog with a trigger button,
 * or `open`/`onOpenChange` for a controlled one (e.g. opened from a row menu).
 */
export function FormDialog({
  title,
  children,
  onSubmit,
  submitLabel,
  pendingLabel,
  trigger,
  triggerVariant = "default",
  triggerSize,
  open: controlledOpen,
  onOpenChange,
  scrollable = false,
  contentClassName,
}: {
  title: string
  children: React.ReactNode
  /** Throw to show an error toast; resolve to close the dialog. */
  onSubmit: (form: FormData) => Promise<void>
  /** Defaults to the common "save" label. */
  submitLabel?: string
  /** Optional label swap while submitting (e.g. "Generating…"). */
  pendingLabel?: string
  /** Trigger button contents (icon + label) for the self-managed mode. */
  trigger?: React.ReactNode
  triggerVariant?: React.ComponentProps<typeof Button>["variant"]
  triggerSize?: React.ComponentProps<typeof Button>["size"]
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Cap the dialog height and scroll its body — for tall forms (F16). */
  scrollable?: boolean
  /** Extra classes on the dialog content (e.g. a wider `sm:max-w-lg`). */
  contentClassName?: string
}) {
  const tCommon = useTranslations("common")
  const showError = useActionErrorToast()
  const [internalOpen, setInternalOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  const open = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    try {
      await onSubmit(form)
      setOpen(false)
    } catch (error) {
      showError(error)
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger != null && (
        <DialogTrigger render={<Button variant={triggerVariant} size={triggerSize} />}>
          {trigger}
        </DialogTrigger>
      )}
      <DialogContent
        className={cn(scrollable && "max-h-[90dvh] overflow-y-auto", contentClassName)}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {children}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {pending && pendingLabel ? pendingLabel : (submitLabel ?? tCommon("save"))}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
