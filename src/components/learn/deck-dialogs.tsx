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
import {
  addCard,
  createDeck,
  generateCards,
  updateCard,
  updateDeck,
} from "@/app/[locale]/(app)/deck-actions"
import { startCompleteDeck } from "@/app/[locale]/(app)/generation-actions"
import { FormDialog } from "@/components/form-dialog"
import { ModuleSelect, type ModuleOption } from "./module-select"
import { GenerationProgress } from "./generation-progress"
import { EstimatedProgress } from "./estimated-progress"

/** Above this many cards, a single-shot generation shows an estimated progress
 *  bar (E14) rather than a bare spinner. */
const LARGE_GENERATION = 10

/** Controlled edit dialog for a flashcard's front/back (used by row menus). */
export function EditCardDialog({
  cardId,
  initialFront,
  initialBack,
  open,
  onOpenChange,
}: {
  cardId: string
  initialFront: string
  initialBack: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("learn.decks")
  const router = useRouter()

  return (
    <FormDialog
      title={t("editCard")}
      open={open}
      onOpenChange={onOpenChange}
      onSubmit={async (form) => {
        await updateCard(cardId, {
          front: String(form.get("front")),
          back: String(form.get("back")),
        })
        router.refresh()
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="ec-front">{t("front")}</Label>
        <Textarea id="ec-front" name="front" rows={2} defaultValue={initialFront} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ec-back">{t("back")}</Label>
        <Textarea id="ec-back" name="back" rows={2} defaultValue={initialBack} required />
      </div>
    </FormDialog>
  )
}

/** Controlled edit dialog for a deck's name/description (used by row menus). */
export function EditDeckDialog({
  deckId,
  initialName,
  initialDescription,
  open,
  onOpenChange,
}: {
  deckId: string
  initialName: string
  initialDescription: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("learn.decks")
  const router = useRouter()

  return (
    <FormDialog
      title={t("edit")}
      open={open}
      onOpenChange={onOpenChange}
      onSubmit={async (form) => {
        await updateDeck(deckId, {
          name: String(form.get("name")),
          description: String(form.get("description") || "") || null,
        })
        router.refresh()
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="ed-name">{t("name")}</Label>
        <Input id="ed-name" name="name" defaultValue={initialName} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ed-desc">{t("description")}</Label>
        <Textarea
          id="ed-desc"
          name="description"
          rows={2}
          defaultValue={initialDescription ?? ""}
        />
      </div>
    </FormDialog>
  )
}

export function DeckDialog({
  modules,
  fixedModuleId,
  basePath,
}: {
  modules: ModuleOption[]
  fixedModuleId?: string
  basePath: string
}) {
  const t = useTranslations("learn.decks")
  const tLearn = useTranslations("learn")
  const router = useRouter()
  const [moduleId, setModuleId] = React.useState(fixedModuleId ?? "")

  return (
    <FormDialog
      title={t("new")}
      trigger={
        <>
          <Plus className="size-4" />
          {t("new")}
        </>
      }
      onSubmit={async (form) => {
        const result = await createDeck({
          name: String(form.get("name")),
          description: String(form.get("description") || "") || null,
          moduleId: moduleId || null,
        })
        router.push(`${basePath}/decks/${result.id}`)
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="d-name">{t("name")}</Label>
        <Input id="d-name" name="name" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="d-desc">{t("description")}</Label>
        <Textarea id="d-desc" name="description" rows={2} />
      </div>
      {!fixedModuleId && (
        <div className="space-y-1.5">
          <Label>{tLearn("module")}</Label>
          <ModuleSelect modules={modules} value={moduleId} onChange={setModuleId} />
        </div>
      )}
    </FormDialog>
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
  const tGen = useTranslations("learn.generation")
  const tDecks = useTranslations("learn.decks")
  const tCommon = useTranslations("common")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [complete, setComplete] = React.useState(false)
  const [jobId, setJobId] = React.useState<string | null>(null)
  // >0 while a large single-shot generation is running → estimated progress bar.
  const [estCount, setEstCount] = React.useState(0)

  if (!aiAvailable) return null

  function reset() {
    setJobId(null)
    setPending(false)
    setComplete(false)
    setEstCount(0)
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    try {
      if (complete) {
        const res = await startCompleteDeck({
          deckId,
          perTopic: Number(form.get("perTopic")) || undefined,
        })
        setJobId(res.jobId)
      } else {
        const count = Number(form.get("count"))
        if (count >= LARGE_GENERATION) setEstCount(count)
        await generateCards({
          deckId,
          count,
          topics: String(form.get("topics") || "") || undefined,
        })
        setOpen(false)
        router.refresh()
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
      setEstCount(0)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <Sparkles className="size-4" />
        {tDecks("generateCards")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        {jobId ? (
          <div className="space-y-4">
            <GenerationProgress jobId={jobId} onDone={() => router.refresh()} />
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => {
                  setOpen(false)
                  reset()
                }}
              >
                {tGen("close")}
              </Button>
            </div>
          </div>
        ) : estCount > 0 ? (
          <EstimatedProgress count={estCount} label={t("generating")} />
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <label className="flex items-start gap-2 rounded-md border p-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={complete}
                onChange={(e) => setComplete(e.target.checked)}
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">{tGen("complete")}</span>
                <span className="block text-xs text-muted-foreground">{tGen("completeHint")}</span>
              </span>
            </label>
            {complete ? (
              <div className="space-y-1.5">
                <Label htmlFor="gen-perTopic">{tGen("perTopicCards")}</Label>
                <Input
                  id="gen-perTopic"
                  name="perTopic"
                  type="number"
                  min={1}
                  max={30}
                  defaultValue={6}
                  required
                />
              </div>
            ) : (
              <>
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
              </>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                {complete ? tGen("startComplete") : pending ? t("generating") : t("submit")}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
