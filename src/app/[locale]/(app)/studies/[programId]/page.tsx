import { redirect } from "@/i18n/navigation"

/**
 * The old program overview page was folded into the dashboard's
 * Semesterübersicht — redirect old links there.
 */
export default async function ProgramPage({
  params,
}: {
  params: Promise<{ programId: string; locale: string }>
}) {
  const { locale } = await params
  redirect({ href: "/", locale })
}
