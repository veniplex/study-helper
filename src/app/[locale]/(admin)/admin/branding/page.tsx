import { requireAdmin } from "@/lib/auth/session"
import { getSetting } from "@/lib/settings"
import { BrandingForm } from "@/components/admin/branding-form"

export default async function AdminBrandingPage() {
  await requireAdmin()
  const [branding, uploads] = await Promise.all([getSetting("branding"), getSetting("uploads")])
  return (
    <BrandingForm
      initial={branding ?? { appName: "StudyHelper" }}
      uploads={uploads ?? { maxUploadMb: 200 }}
    />
  )
}
