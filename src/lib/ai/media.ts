import "server-only"
import path from "node:path"
import { experimental_transcribe as transcribe, generateText, type TranscriptionModel } from "ai"
import { fileSize, readFileBuffer } from "@/lib/storage"
import { getLanguageModel, getTranscriptionModel, resolveModelForUser } from "./registry"
import { runAi } from "./run"

/**
 * Whisper-class speech-to-text endpoints (OpenAI, Groq) reject uploads beyond
 * ~25 MB, but uploads are allowed up to maxUploadMb (200 MB by default).
 * Configurable via MAX_TRANSCRIBE_MB.
 */
const MAX_TRANSCRIBE_BYTES = (Number(process.env.MAX_TRANSCRIBE_MB) || 25) * 1024 * 1024

/**
 * Images travel base64-encoded inside the chat request body, so the provider's
 * request-size limit bites well below the upload cap. Configurable via
 * MAX_IMAGE_OCR_MB.
 */
const MAX_IMAGE_BYTES = (Number(process.env.MAX_IMAGE_OCR_MB) || 20) * 1024 * 1024

export class MediaTooLargeError extends Error {
  constructor(what: string, sizeBytes: number, maxBytes: number) {
    super(
      `${what} too large (${Math.round(sizeBytes / 1024 / 1024)} MB, ` +
        `max ${Math.round(maxBytes / 1024 / 1024)} MB)`
    )
    this.name = "MediaTooLargeError"
  }
}

/**
 * Rejects oversized media before it is read into memory. Deliberately called
 * OUTSIDE the best-effort try/catch of its callers: a provider reject on an
 * over-limit file would otherwise surface as the misleading "returned no text",
 * hiding the one thing the user can act on. A missing/unreadable file is left
 * to the read below, which already degrades gracefully.
 */
async function assertMediaSize(
  storagePath: string,
  maxBytes: number,
  what: string
): Promise<void> {
  const size = await fileSize(storagePath).catch(() => 0)
  if (size > maxBytes) throw new MediaTooLargeError(what, size, maxBytes)
}

const IMAGE_PROMPT =
  "Extract all readable text from this image verbatim (OCR). Then add a short " +
  "description of any diagrams, charts or notable visual content. Respond in the " +
  "language of the document; output plain text only."

/**
 * Uses a configured vision-capable model to OCR + describe an image, so image
 * uploads become searchable/RAG-able. Best-effort: returns null when no model
 * is configured or the model can't process the image. Throws MediaTooLargeError
 * for images beyond the provider's request-size headroom.
 */
export async function extractImageText(
  storagePath: string,
  mimeType: string | null,
  userId: string
): Promise<string | null> {
  await assertMediaSize(storagePath, MAX_IMAGE_BYTES, "Image")
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
 * Whisper). Best-effort: returns null when unavailable or on failure. Throws
 * MediaTooLargeError for files beyond what the STT endpoints accept.
 */
export async function transcribeMedia(storagePath: string, userId: string): Promise<string | null> {
  await assertMediaSize(storagePath, MAX_TRANSCRIBE_BYTES, "Audio/video")
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
