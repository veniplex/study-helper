import "server-only"
import path from "node:path"
import { experimental_transcribe as transcribe, generateText, type TranscriptionModel } from "ai"
import { readFileBuffer } from "@/lib/storage"
import { getLanguageModel, getTranscriptionModel, resolveModelForUser } from "./registry"
import { runAi } from "./run"

const IMAGE_PROMPT =
  "Extract all readable text from this image verbatim (OCR). Then add a short " +
  "description of any diagrams, charts or notable visual content. Respond in the " +
  "language of the document; output plain text only."

/**
 * Uses a configured vision-capable model to OCR + describe an image, so image
 * uploads become searchable/RAG-able. Best-effort: returns null when no model
 * is configured or the model can't process the image.
 */
export async function extractImageText(
  storagePath: string,
  mimeType: string | null,
  userId: string
): Promise<string | null> {
  try {
    const ref = await resolveModelForUser(userId)
    if (!ref) return null
    const model = await getLanguageModel(ref, userId)
    const buffer = await readFileBuffer(storagePath)
    const { text } = await runAi(
      {
        userId,
        model: ref,
        feature: "ocr",
        operation: "ai_extract",
        entityType: "material",
        entityLabel: path.basename(storagePath),
      },
      () =>
        generateText({
          temperature: 0,
          model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: IMAGE_PROMPT },
                {
                  type: "image",
                  image: new Uint8Array(buffer),
                  mediaType: mimeType ?? "image/png",
                },
              ],
            },
          ],
        })
    )
    return text.trim() || null
  } catch (error) {
    console.warn("[media] image extraction failed", error)
    return null
  }
}

/**
 * Transcribes an in-memory audio buffer (voice input in chat). Throws on
 * failure so the caller can show a real error — unlike the best-effort
 * material pipeline.
 */
export async function transcribeAudioBuffer(buffer: Uint8Array, userId: string): Promise<string> {
  const transcription = await getTranscriptionModel(userId)
  if (!transcription) throw new Error("No transcription model available")
  const { text } = await runAi(
    {
      userId,
      model: transcription.ref,
      feature: "voice-input",
      operation: "ai_transcribe",
      entityType: "chat",
    },
    () => transcribe({ model: transcription.model as TranscriptionModel, audio: buffer })
  )
  return text.trim()
}

/**
 * Transcribes audio/video via a configured speech-to-text model (OpenAI/Groq
 * Whisper). Best-effort: returns null when unavailable or on failure.
 */
export async function transcribeMedia(storagePath: string, userId: string): Promise<string | null> {
  try {
    const transcription = await getTranscriptionModel(userId)
    if (!transcription) return null
    const buffer = await readFileBuffer(storagePath)
    const { text } = await runAi(
      {
        userId,
        model: transcription.ref,
        feature: "transcription",
        operation: "ai_transcribe",
        entityType: "material",
        entityLabel: path.basename(storagePath),
      },
      () =>
        transcribe({
          model: transcription.model as TranscriptionModel,
          audio: new Uint8Array(buffer),
        })
    )
    return text.trim() || null
  } catch (error) {
    console.warn("[media] transcription failed", error)
    return null
  }
}
