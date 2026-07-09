"use client"

import { MoreHorizontal } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useRouter } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { authClient } from "@/lib/auth/client"

export function UserActions({
  userId,
  role,
  banned,
  isSelf,
}: {
  userId: string
  role: string
  banned: boolean
  isSelf: boolean
}) {
  const t = useTranslations("admin.users")
  const router = useRouter()

  async function run(fn: () => Promise<{ error: { message?: string } | null }>) {
    const { error } = await fn()
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success(t("updated"))
    router.refresh()
  }

  if (isSelf) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() =>
            run(() =>
              authClient.admin.setRole({ userId, role: role === "admin" ? "user" : "admin" })
            )
          }
        >
          {role === "admin" ? t("makeUser") : t("makeAdmin")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            run(() =>
              banned
                ? authClient.admin.unbanUser({ userId })
                : authClient.admin.banUser({ userId })
            )
          }
        >
          {banned ? t("unban") : t("ban")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            if (confirm(t("deleteConfirm"))) {
              run(() => authClient.admin.removeUser({ userId }))
            }
          }}
        >
          {t("delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
