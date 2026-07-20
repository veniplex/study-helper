"use client"

import { AlertTriangle } from "lucide-react"
import { useTranslations } from "next-intl"
import { EmptyState } from "@/components/ui/empty-state"
import { Button } from "@/components/ui/button"

/**
 * Error boundary for the signed-in app. Every route here is database-backed and
 * `force-dynamic`, so a momentary DB or network failure used to drop the user on
 * the unstyled, unlocalized framework error page with no way back.
 *
 * `unstable_retry` (Next 16.2+) re-fetches and re-renders the boundary's
 * children, which is what this case needs — `reset()` alone would only re-render
 * the same failed data.
 */
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  // Not under "errors" — that namespace is reserved for the ActionErrorCode
  // union and a test asserts it holds nothing else.
  const t = useTranslations("errorPages.boundary")

  return (
    <div className="mx-auto w-full max-w-5xl">
      <EmptyState
        icon={AlertTriangle}
        title={t("title")}
        description={t("description")}
        action={
          <div className="flex flex-col items-center gap-2">
            <Button onClick={() => unstable_retry()}>{t("retry")}</Button>
            {/* The digest is the only thing tying this screen to a server log
                line — production errors carry no message on purpose. */}
            {error.digest && (
              <p className="text-muted-foreground font-mono text-xs">{error.digest}</p>
            )}
          </div>
        }
      />
    </div>
  )
}
