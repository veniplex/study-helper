"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { extractActionErrorCode } from "@/lib/action-errors"

/**
 * Shows a localized error toast for a thrown server-action error. `t` is the
 * `errors` translation namespace (`useTranslations("errors")`). A recognized
 * `ERR:<code>` token maps to `errors.<code>`; anything else — unknown codes,
 * raw provider strings, network errors — falls back to `errors.GENERIC` so a
 * server's (possibly wrong-language) message never reaches the UI. Mirrors the
 * `AI_ERROR:<code>` handling in `chat.tsx`.
 */
export function toastActionError(error: unknown, t: (code: string) => string): void {
  const code = extractActionErrorCode(error)
  toast.error(t(code ?? "GENERIC"))
}

/**
 * Convenience hook: returns a stable callback that shows a localized toast for
 * a thrown server-action error. Prefer this in client components so call sites
 * don't have to wire the `errors` namespace themselves.
 */
export function useActionErrorToast(): (error: unknown) => void {
  const t = useTranslations("errors")
  return React.useCallback((error: unknown) => toastActionError(error, t), [t])
}
