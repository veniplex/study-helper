"use client"

import * as React from "react"
import { Loader2, Mail, Pencil, Plus, Trash2, UserRound } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import {
  createContact,
  deleteContact,
  updateContact,
} from "@/app/[locale]/(app)/studies/contact-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export type ModuleContact = {
  id: string
  name: string
  email: string | null
  role: string | null
}

export function ModuleContactsCard({
  moduleId,
  contacts,
}: {
  moduleId: string
  contacts: ModuleContact[]
}) {
  const t = useTranslations("studies.contacts")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [editing, setEditing] = React.useState<ModuleContact | null>(null)
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  function openNew() {
    setEditing(null)
    setOpen(true)
  }
  function openEdit(c: ModuleContact) {
    setEditing(c)
    setOpen(true)
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const payload = {
      name: String(form.get("name")),
      email: String(form.get("email") || "") || null,
      role: String(form.get("role") || "") || null,
    }
    setPending(true)
    try {
      if (editing) await updateContact(editing.id, payload)
      else await createContact(moduleId, payload)
      setOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  async function onDelete(id: string) {
    try {
      await deleteContact(id)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={openNew}>
          <Plus className="size-4" />
          {t("add")}
        </Button>
      </CardHeader>
      <CardContent>
        {contacts.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <ul className="space-y-2">
            {contacts.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <UserRound className="text-muted-foreground size-4 shrink-0" />
                <span className="font-medium">{c.name}</span>
                {c.role && <span className="text-muted-foreground text-xs">{c.role}</span>}
                {c.email && (
                  <a
                    href={`mailto:${c.email}`}
                    className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs underline-offset-4 hover:underline"
                  >
                    <Mail className="size-3" />
                    {c.email}
                  </a>
                )}
                <span className="ml-auto flex items-center gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => openEdit(c)}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => void onDelete(c.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("add")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="c-name">{t("name")}</Label>
              <Input id="c-name" name="name" defaultValue={editing?.name ?? ""} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-email">{t("email")}</Label>
              <Input id="c-email" name="email" type="email" defaultValue={editing?.email ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-role">{t("role")}</Label>
              <Input
                id="c-role"
                name="role"
                placeholder={t("rolePlaceholder")}
                defaultValue={editing?.role ?? ""}
              />
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
    </Card>
  )
}
