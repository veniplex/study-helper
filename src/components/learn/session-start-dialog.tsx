"use client"

import * as React from "react"
import { Play } from "lucide-react"
import { useTranslations } from "next-intl"
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
import { Switch } from "@/components/ui/switch"

export const POMODORO_START_EVENT = "studyhelper:pomodoro-start"

const CARD_MODES = ["due", "random", "order", "wrong", "least"] as const

export function SessionStartDialog({
  basePath,
  moduleId,
  decks,
  quizzes,
}: {
  basePath: string
  moduleId: string
  decks: { id: string; name: string }[]
  quizzes: { id: string; title: string }[]
}) {
  const t = useTranslations("learnSession")
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [source, setSource] = React.useState<"cards" | "quiz">(
    decks.length > 0 || quizzes.length === 0 ? "cards" : "quiz"
  )
  const [deckId, setDeckId] = React.useState(decks[0]?.id ?? "")
  const [quizId, setQuizId] = React.useState(quizzes[0]?.id ?? "")
  const [mode, setMode] = React.useState<(typeof CARD_MODES)[number]>("due")
  const [count, setCount] = React.useState(20)
  const [withPomodoro, setWithPomodoro] = React.useState(true)

  function start() {
    if (withPomodoro) {
      window.dispatchEvent(
        new CustomEvent(POMODORO_START_EVENT, { detail: { moduleId } })
      )
    }
    setOpen(false)
    if (source === "cards" && deckId) {
      router.push(`${basePath}/decks/${deckId}/study?mode=${mode}&count=${count}`)
    } else if (source === "quiz" && quizId) {
      router.push(`${basePath}/quizzes/${quizId}?run=1`)
    }
  }

  const canStart = source === "cards" ? Boolean(deckId) : Boolean(quizId)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Play className="size-4" />
        {t("start")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("source")}</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={source === "cards" ? "default" : "outline"}
                disabled={decks.length === 0}
                onClick={() => setSource("cards")}
              >
                {t("cards")}
              </Button>
              <Button
                type="button"
                variant={source === "quiz" ? "default" : "outline"}
                disabled={quizzes.length === 0}
                onClick={() => setSource("quiz")}
              >
                {t("quiz")}
              </Button>
            </div>
          </div>

          {source === "cards" ? (
            <>
              <div className="space-y-1.5">
                <Label>{t("deck")}</Label>
                <Select value={deckId} onValueChange={(v) => setDeckId(v ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {decks.find((d) => d.id === deckId)?.name ?? ""}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {decks.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t("mode")}</Label>
                  <Select
                    value={mode}
                    onValueChange={(v) => setMode((v as typeof mode) ?? "due")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>{t(`modes.${mode}`)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {CARD_MODES.map((m) => (
                        <SelectItem key={m} value={m}>
                          {t(`modes.${m}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ls-count">{t("count")}</Label>
                  <Input
                    id="ls-count"
                    type="number"
                    min={1}
                    max={100}
                    value={count}
                    onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 20))}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label>{t("quiz")}</Label>
              <Select value={quizId} onValueChange={(v) => setQuizId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {quizzes.find((q) => q.id === quizId)?.title ?? ""}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {quizzes.map((q) => (
                    <SelectItem key={q.id} value={q.id}>
                      {q.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Switch id="ls-pomo" checked={withPomodoro} onCheckedChange={setWithPomodoro} />
            <Label htmlFor="ls-pomo" className="font-normal">
              {t("withPomodoro")}
            </Label>
          </div>

          <Button className="w-full" disabled={!canStart} onClick={start}>
            <Play className="size-4" />
            {t("start")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
