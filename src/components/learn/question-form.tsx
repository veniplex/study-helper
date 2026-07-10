"use client"

import * as React from "react"
import { Loader2, Plus } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { addQuestion } from "@/app/[locale]/(app)/quiz-actions"

export function QuestionForm({ quizId }: { quizId: string }) {
  const t = useTranslations("learn.questionForm")
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [kind, setKind] = React.useState<"multiple_choice" | "free_text">("multiple_choice")

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    try {
      if (kind === "multiple_choice") {
        const options = [1, 2, 3, 4]
          .map((i) => String(form.get(`option${i}`) || "").trim())
          .filter(Boolean)
        await addQuestion(quizId, {
          kind,
          prompt: String(form.get("prompt")),
          options,
          correctIndex: Number(form.get("correctIndex")) - 1,
          explanation: String(form.get("explanation") || "") || null,
        })
      } else {
        await addQuestion(quizId, {
          kind,
          prompt: String(form.get("prompt")),
          referenceAnswer: String(form.get("referenceAnswer")),
          explanation: String(form.get("explanation") || "") || null,
        })
      }
      ;(e.target as HTMLFormElement).reset()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border p-4">
      <h3 className="text-sm font-medium">{t("title")}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t("kind")}</Label>
          <Select
            value={kind}
            onValueChange={(v) => setKind(v as "multiple_choice" | "free_text")}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{kind === "multiple_choice" ? t("mc") : t("freeText")}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="multiple_choice">{t("mc")}</SelectItem>
              <SelectItem value="free_text">{t("freeText")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="qf-prompt">{t("prompt")}</Label>
        <Textarea id="qf-prompt" name="prompt" rows={2} required />
      </div>
      {kind === "multiple_choice" ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Input key={i} name={`option${i}`} placeholder={t("option", { n: i })} required={i <= 2} />
            ))}
          </div>
          <div className="max-w-40 space-y-1.5">
            <Label htmlFor="qf-correct">{t("correctIndex")}</Label>
            <Input
              id="qf-correct"
              name="correctIndex"
              type="number"
              min={1}
              max={4}
              defaultValue={1}
              required
            />
          </div>
        </>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="qf-ref">{t("referenceAnswer")}</Label>
          <Textarea id="qf-ref" name="referenceAnswer" rows={2} required />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="qf-expl">{t("explanation")}</Label>
        <Input id="qf-expl" name="explanation" />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        {t("submit")}
      </Button>
    </form>
  )
}
