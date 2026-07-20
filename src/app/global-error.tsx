"use client"

import "./globals.css"

/**
 * Last-resort boundary: catches errors thrown by the root layout itself, where
 * no locale has been resolved and no provider is mounted. It replaces the root
 * layout, so it has to bring its own <html>/<body> and styles.
 *
 * Deliberately untranslated — next-intl's provider lives inside the layout that
 * just failed, so any translation lookup here would fail too. Error boundaries
 * are Client Components and cannot export metadata; React's <title> is the
 * supported way to name the tab.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full items-center justify-center p-6">
        <title>Something went wrong</title>
        <main className="flex flex-col items-center gap-3 text-center">
          <h1 className="text-lg font-medium">Something went wrong</h1>
          <p className="text-muted-foreground max-w-sm text-sm">
            The app failed to start up. Trying again often helps; if it doesn&apos;t, check the
            server logs.
          </p>
          <button
            onClick={() => unstable_retry()}
            className="bg-primary text-primary-foreground hover:bg-primary/90 mt-1 rounded-md px-4 py-2 text-sm font-medium"
          >
            Try again
          </button>
          {error.digest && (
            <p className="text-muted-foreground font-mono text-xs">{error.digest}</p>
          )}
        </main>
      </body>
    </html>
  )
}
