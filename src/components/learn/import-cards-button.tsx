"use client"

import * as React from "react"
import { Loader2, Upload } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { importAnkiDeck, importCards } from "@/app/[locale]/(app)/deck-actions"

/** Imports flashcards from a TSV/CSV file or an Anki .apkg export. */
export function ImportCardsButton({ deckId }: { deckId: string }) {
  const t = useTranslations("learn.decks.import")
  const router = useRouter()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [pending, setPending] = React.useState(false)

  async function onFile(file: File) {
    setPending(true)
    try {
      let imported: number
      if (file.name.toLowerCase().endsWith(".apkg")) {
        const form = new FormData()
        form.set("file", file)
        imported = (await importAnkiDeck(deckId, form)).imported
      } else {
        imported = (await importCards(deckId, await file.text())).imported
      }
      toast.success(t("done", { count: imported }))
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.tsv,.csv,.apkg,text/plain,text/tab-separated-values,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void onFile(file)
        }}
      />
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
        title={t("hint")}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {t("button")}
      </Button>
    </>
  )
}
