"use client"

import * as React from "react"
import { FolderUp, Link2, Loader2, Upload } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useActionErrorToast } from "@/components/action-error-toast"
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
import { createLinkMaterial } from "@/app/[locale]/(app)/materials-actions"
import { describeUploadError, uploadFiles, type UploadItem } from "./upload-client"

export function UploadDialog({ moduleId, folderId }: { moduleId: string; folderId: string | null }) {
  const t = useTranslations("materials")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [progress, setProgress] = React.useState<string | null>(null)

  async function upload(items: UploadItem[]) {
    if (items.length === 0) return
    setProgress(t("uploadingCount", { done: 0, total: items.length }))
    try {
      const { queued } = await uploadFiles(items, {
        moduleId,
        folderId,
        onProgress: (p) => setProgress(t("uploadingCount", { done: p.done, total: p.total })),
      })
      toast.success(queued > 0 ? t("unpacking") : t("uploaded"))
      setOpen(false)
    } catch (error) {
      toast.error(t("uploadFailed", { error: describeUploadError(error, t) }))
    } finally {
      setProgress(null)
      router.refresh()
    }
  }

  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    const items: UploadItem[] = Array.from(files).map((file) => ({
      file,
      relativePath:
        (file as File & { webkitRelativePath?: string }).webkitRelativePath || undefined,
    }))
    void upload(items)
    e.target.value = ""
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Upload className="size-4" />
        {t("upload")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("upload")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">{t("uploadHint")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label
              htmlFor="u-files"
              className="hover:border-primary/50 flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-4 text-center text-sm"
            >
              <Upload className="text-muted-foreground size-6" />
              {t("chooseFiles")}
              <Input id="u-files" type="file" multiple className="hidden" onChange={onFiles} />
            </Label>
            <Label
              htmlFor="u-folder"
              className="hover:border-primary/50 flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-4 text-center text-sm"
            >
              <FolderUp className="text-muted-foreground size-6" />
              {t("chooseFolder")}
              {/* @ts-expect-error non-standard directory upload attributes */}
              <Input id="u-folder" type="file" webkitdirectory="" directory="" className="hidden" onChange={onFiles} />
            </Label>
          </div>
          {progress != null && (
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" />
              {progress}
            </div>
          )}
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={progress != null}>
              {tCommon("cancel")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function LinkDialog({ moduleId, folderId }: { moduleId: string; folderId: string | null }) {
  const t = useTranslations("materials")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const showError = useActionErrorToast()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    try {
      await createLinkMaterial({
        moduleId,
        name: String(form.get("name")),
        url: String(form.get("url")),
        folderId,
      })
      toast.success(t("uploaded"))
      setOpen(false)
      router.refresh()
    } catch (error) {
      showError(error)
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Link2 className="size-4" />
        {t("addLink")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addLink")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="l-name">{t("name")}</Label>
            <Input id="l-name" name="name" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="l-url">{t("url")}</Label>
            <Input id="l-url" name="url" type="url" placeholder="https://" required />
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
