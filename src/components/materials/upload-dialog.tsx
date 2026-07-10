"use client"

import * as React from "react"
import { Link2, Loader2, Upload } from "lucide-react"
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
import { createLinkMaterial } from "@/app/[locale]/(app)/materials-actions"

export type ModuleOption = { id: string; name: string }

export function UploadDialog({
  modules,
  hideModuleSelect,
}: {
  modules: ModuleOption[]
  /** Inside a module workspace the module is fixed — hide the redundant select. */
  hideModuleSelect?: boolean
}) {
  const t = useTranslations("materials")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [moduleId, setModuleId] = React.useState(modules[0]?.id ?? "")
  const [progress, setProgress] = React.useState<number | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fileInput = form.querySelector<HTMLInputElement>('input[type="file"]')
    const files = fileInput?.files
    if (!files || files.length === 0 || !moduleId) return
    const folder = String(new FormData(form).get("folder") || "")

    for (const file of Array.from(files)) {
      const body = new FormData()
      body.set("file", file)
      body.set("moduleId", moduleId)
      if (folder) body.set("folder", folder)

      setProgress(0)
      try {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.open("POST", "/api/materials/upload")
          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100))
          }
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve()
            else {
              try {
                reject(new Error(JSON.parse(xhr.responseText).error ?? xhr.statusText))
              } catch {
                reject(new Error(xhr.statusText))
              }
            }
          }
          xhr.onerror = () => reject(new Error("network error"))
          xhr.send(body)
        })
        toast.success(t("uploaded"))
      } catch (error) {
        toast.error(
          t("uploadFailed", { error: error instanceof Error ? error.message : String(error) })
        )
      }
    }
    setProgress(null)
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Upload className="size-4" />
        {t("upload")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("upload")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {!hideModuleSelect && (
            <div className="space-y-1.5">
              <Label>{t("module")}</Label>
              <Select value={moduleId} onValueChange={(v) => setModuleId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {modules.find((m) => m.id === moduleId)?.name ?? ""}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {modules.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="u-file">{t("upload")}</Label>
            <Input id="u-file" type="file" multiple required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-folder">{t("folder")}</Label>
            <Input id="u-folder" name="folder" />
          </div>
          {progress != null && (
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs">{t("uploading", { percent: progress })}</p>
              <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                <div className="bg-primary h-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={progress != null}>
              {progress != null && <Loader2 className="size-4 animate-spin" />}
              {t("upload")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function LinkDialog({
  modules,
  hideModuleSelect,
}: {
  modules: ModuleOption[]
  hideModuleSelect?: boolean
}) {
  const t = useTranslations("materials")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [moduleId, setModuleId] = React.useState(modules[0]?.id ?? "")

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    try {
      await createLinkMaterial({
        moduleId,
        name: String(form.get("name")),
        url: String(form.get("url")),
        folder: String(form.get("folder") || "") || null,
      })
      toast.success(t("uploaded"))
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
      <DialogTrigger render={<Button variant="outline" />}>
        <Link2 className="size-4" />
        {t("addLink")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addLink")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {!hideModuleSelect && (
            <div className="space-y-1.5">
              <Label>{t("module")}</Label>
              <Select value={moduleId} onValueChange={(v) => setModuleId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {modules.find((m) => m.id === moduleId)?.name ?? ""}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {modules.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="l-name">{t("name")}</Label>
            <Input id="l-name" name="name" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="l-url">{t("url")}</Label>
            <Input id="l-url" name="url" type="url" placeholder="https://" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="l-folder">{t("folder")}</Label>
            <Input id="l-folder" name="folder" />
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
