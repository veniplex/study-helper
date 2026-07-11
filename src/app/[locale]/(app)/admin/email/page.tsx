import { requireAdmin } from "@/lib/auth/session"
import { getSetting } from "@/lib/settings"
import { SmtpForm } from "@/components/admin/smtp-form"

export default async function AdminEmailPage() {
  await requireAdmin()
  const smtp = await getSetting("smtp")
  return <SmtpForm initial={smtp} />
}
