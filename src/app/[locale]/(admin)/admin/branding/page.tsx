import { requireAdmin } from "@/lib/auth/session"
import { getSetting } from "@/lib/settings"
import { BrandingForm } from "@/components/admin/branding-form"

export default async function AdminBrandingPage() {
  await requireAdmin()
  const branding = await getSetting("branding")
  return <BrandingForm initial={branding ?? { appName: "StudyHelper" }} />
}
