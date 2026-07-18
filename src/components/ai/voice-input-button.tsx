"use client"

import * as React from "react"
import { Loader2, Mic, Square } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { isVoiceInputAvailable, transcribeVoiceInput } from "@/app/[locale]/(app)/ai/actions"

/**
 * Push-to-talk voice input: records via MediaRecorder, transcribes server-side
 * (Whisper via the configured OpenAI/Groq provider) and hands the text to the
 * caller. Renders nothing when the browser can't record or no transcription
 * provider is configured.
 */
export function VoiceInputButton({
  disabled,
  onTranscript,
}: {
  disabled?: boolean
  onTranscript: (text: string) => void
}) {
  const t = useTranslations("ai.voice")
  const [available, setAvailable] = React.useState(false)
  const [recording, setRecording] = React.useState(false)
  const [transcribing, setTranscribing] = React.useState(false)
  const recorderRef = React.useRef<MediaRecorder | null>(null)

  React.useEffect(() => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return
    isVoiceInputAvailable()
      .then(setAvailable)
      .catch(() => setAvailable(false))
  }, [])

  React.useEffect(() => {
    return () => recorderRef.current?.stream.getTracks().forEach((track) => track.stop())
  }, [])

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        setRecording(false)
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" })
        if (blob.size === 0) return
        setTranscribing(true)
        try {
          const formData = new FormData()
          formData.append("audio", blob, "voice-input.webm")
          const { text } = await transcribeVoiceInput(formData)
          if (text) onTranscript(text)
          else toast.error(t("empty"))
        } catch (error) {
          toast.error(error instanceof Error ? error.message : String(error))
        } finally {
          setTranscribing(false)
        }
      }
      recorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch {
      toast.error(t("micDenied"))
    }
  }

  if (!available) return null

  return (
    <Button
      size="icon"
      variant={recording ? "destructive" : "outline"}
      disabled={disabled || transcribing}
      onClick={() => (recording ? recorderRef.current?.stop() : void start())}
      aria-label={recording ? t("stop") : t("start")}
    >
      {transcribing ? (
        <Loader2 className="size-4 animate-spin" />
      ) : recording ? (
        <Square className="size-4" />
      ) : (
        <Mic className="size-4" />
      )}
    </Button>
  )
}
