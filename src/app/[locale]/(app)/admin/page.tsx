import type { Metadata } from "next"
import { desc } from "drizzle-orm"
import { AlertTriangle } from "lucide-react"
import { getTranslations, getFormatter } from "next-intl/server"
import { db } from "@/db"
import { user } from "@/db/schema"
import { requireAdmin } from "@/lib/auth/session"
import { deleteFile, saveFile } from "@/lib/storage"
import { UserActions } from "@/components/admin/user-actions"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

/** Write-probe of the storage backend (same check as /api/health). */
async function storageWritable(): Promise<boolean> {
  try {
    const path = await saveFile("_health", `probe-${crypto.randomUUID()}.txt`, Buffer.from("ok"))
    await deleteFile(path)
    return true
  } catch {
    return false
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav")
  return { title: t("admin") }
}

export default async function AdminUsersPage() {
  const session = await requireAdmin()
  const t = await getTranslations("admin.users")
  const format = await getFormatter()
  const [users, writable] = await Promise.all([
    db.select().from(user).orderBy(desc(user.createdAt)),
    storageWritable(),
  ])

  return (
    <>
    {!writable && (
      <div className="border-destructive/40 bg-destructive/5 text-destructive mb-4 flex items-start gap-2 rounded-lg border p-3 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <p>{t("storageUnwritable")}</p>
      </div>
    )}
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="py-2 pr-4 font-medium">{t("name")}</th>
                <th className="py-2 pr-4 font-medium">{t("email")}</th>
                <th className="py-2 pr-4 font-medium">{t("role")}</th>
                <th className="py-2 pr-4 font-medium">{t("status")}</th>
                <th className="py-2 pr-4 font-medium">{t("created")}</th>
                <th className="py-2 text-right font-medium">{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="py-2.5 pr-4 font-medium">{u.name}</td>
                  <td className="text-muted-foreground py-2.5 pr-4">{u.email}</td>
                  <td className="py-2.5 pr-4">
                    <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                      {u.role === "admin" ? t("roleAdmin") : t("roleUser")}
                    </Badge>
                  </td>
                  <td className="py-2.5 pr-4">
                    <Badge variant={u.banned ? "destructive" : "outline"}>
                      {u.banned ? t("banned") : t("active")}
                    </Badge>
                  </td>
                  <td className="text-muted-foreground py-2.5 pr-4">
                    {format.dateTime(u.createdAt, { dateStyle: "medium" })}
                  </td>
                  <td className="py-2.5 text-right">
                    <UserActions
                      userId={u.id}
                      role={u.role ?? "user"}
                      banned={Boolean(u.banned)}
                      isSelf={u.id === session.user.id}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
    </>
  )
}
