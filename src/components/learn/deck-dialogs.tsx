"use client"

import * as React from "react"
import { Loader2, Plus, Sparkles } from "lucide-react"
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
import { Textarea } from "@/components/ui/textarea"
import { addCard, createDeck, generateCards } from "@/app/[locale]/(app)/learn/decks/actions"
import { ModuleSelect, type ModuleOption } from "./module-select"

export function DeckDialog({ modules }: { modules: ModuleOption[] }) {
  const t = useTranslations("learn.decks")
  const tLearn = useTranslations("learn")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [moduleId, setModuleId] = React.useState("")

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    try {
      const result = await createDeck({
        name: String(form.get("name")),
        description: String(form.get("description") || "") || null,
        moduleId: moduleId || null,
      })
      setOpen(false)
      router.push(`/learn/decks/${result.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" />
        {t("new")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("new")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="d-name">{t("name")}</Label>
            <Input id="d-name" name="name" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-desc">{t("description")}</Label>
            <Textarea id="d-desc" name="description" rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>{tLearn("module")}</Label>
            <ModuleSelect modules={modules} value={moduleId} onChange={setModuleId} />
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

export function AddCardForm({ deckId }: { deckId: string }) {
  const t = useTranslations("learn.decks")
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    try {
      await addCard(deckId, {
        front: String(form.get("front")),
        back: String(form.get("back")),
      })
      ;(e.target as HTMLFormElement).reset()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div className="space-y-1">
        <Label htmlFor="card-front" className="text-xs">
          {t("front")}
        </Label>
        <Textarea id="card-front" name="front" rows={2} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="card-back" className="text-xs">
          {t("back")}
        </Label>
        <Textarea id="card-back" name="back" rows={2} required />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        {t("addCard")}
      </Button>
    </form>
  )
}

export function GenerateCardsDialog({
  deckId,
  aiAvailable,
}: {
  deckId: string
  aiAvailable: boolean
}) {
  const t = useTranslations("learn.decks.generateDialog")
  const tDecks = useTranslations("learn.decks")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)

  if (!aiAvailable) return null

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    try {
      await generateCards({
        deckId,
        count: Number(form.get("count")),
        topics: String(form.get("topics") || "") || undefined,
      })
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
        <Sparkles className="size-4" />
        {tDecks("generateCards")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="gen-count">{t("count")}</Label>
            <Input
              id="gen-count"
              name="count"
              type="number"
              min={1}
              max={50}
              defaultValue={10}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gen-topics">{t("topics")}</Label>
            <Textarea id="gen-topics" name="topics" rows={3} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {pending ? t("generating") : t("submit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
