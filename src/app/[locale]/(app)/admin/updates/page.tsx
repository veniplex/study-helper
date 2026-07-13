import { requireAdmin } from "@/lib/auth/session"
import { getUpdateStatus } from "@/lib/update-check"
import { UpdateStatus } from "@/components/admin/update-status"

export default async function AdminUpdatesPage() {
  await requireAdmin()
  const { current, latest, updateAvailable } = await getUpdateStatus()

  return <UpdateStatus currentVersion={current} latest={latest} updateAvailable={updateAvailable} />
}
