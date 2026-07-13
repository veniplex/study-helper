import "server-only"
import { readFile } from "node:fs/promises"
import path from "node:path"
import {
  experimental_transcribe as transcribe,
  generateText,
  type TranscriptionModel,
} from "ai"
import { getTranscriptionModel, getVisionModel } from "./registry"

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "data", "uploads")

function absolute(storagePath: string): string {
  const abs = path.resolve(UPLOAD_DIR, storagePath)
  if (!abs.startsWith(path.resolve(UPLOAD_DIR))) throw new Error("Invalid path")
  return abs
}

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
    const model = await getVisionModel(userId)
    if (!model) return null
    const buffer = await readFile(absolute(storagePath))
    const { text } = await generateText({
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
    return text.trim() || null
  } catch (error) {
    console.warn("[media] image extraction failed", error)
    return null
  }
}

/**
 * Transcribes audio/video via a configured speech-to-text model (OpenAI/Groq
 * Whisper). Best-effort: returns null when unavailable or on failure.
 */
export async function transcribeMedia(
  storagePath: string,
  userId: string
): Promise<string | null> {
  try {
    const model = await getTranscriptionModel(userId)
    if (!model) return null
    const buffer = await readFile(absolute(storagePath))
    const { text } = await transcribe({
      model: model as TranscriptionModel,
      audio: new Uint8Array(buffer),
    })
    return text.trim() || null
  } catch (error) {
    console.warn("[media] transcription failed", error)
    return null
  }
}
