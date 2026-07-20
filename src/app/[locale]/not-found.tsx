import { FileQuestion } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { Link } from "@/i18n/navigation"
import { EmptyState } from "@/components/ui/empty-state"
import { buttonVariants } from "@/components/ui/button"

/**
 * Localized 404 for everything under a locale segment — reached both by unknown
 * URLs and by the `notFound()` calls the pages make when a record doesn't exist
 * or isn't the user's. Without this, a mistyped module id showed the bare
 * framework 404 with no way back into the app.
 */
export default async function NotFound() {
  const t = await getTranslations("errorPages.notFound")

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center p-6">
      <EmptyState
        icon={FileQuestion}
        title={t("title")}
        description={t("description")}
        action={
          <Link href="/" className={buttonVariants()}>
            {t("backHome")}
          </Link>
        }
      />
    </div>
  )
}
