import { and, desc, eq } from "drizzle-orm"
import {
  ExternalLink,
  File,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Music,
  Presentation,
  Video,
} from "lucide-react"
import { getFormatter, getTranslations } from "next-intl/server"
import { db } from "@/db"
import { material } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { ownModule } from "@/lib/studies/access"
import { Link } from "@/i18n/navigation"
import { deleteMaterial } from "@/app/[locale]/(app)/materials-actions"
import { DeleteButton } from "@/components/studies/delete-button"
import { LinkDialog, UploadDialog } from "@/components/materials/upload-dialog"
import { Badge } from "@/components/ui/badge"

function iconFor(mime: string | null, kind: string) {
  if (kind === "link") return ExternalLink
  if (!mime) return File
  if (mime.startsWith("video/")) return Video
  if (mime.startsWith("audio/")) return Music
  if (mime.startsWith("image/")) return ImageIcon
  if (mime === "application/pdf") return FileText
  if (mime.includes("presentation")) return Presentation
  return File
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return ""
  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

export default async function ModuleMaterialsPage({
  params,
}: {
  params: Promise<{ moduleId: string }>
}) {
  const { moduleId } = await params
  const session = await requireSession()
  const mod = await ownModule(moduleId, session.user.id)
  const t = await getTranslations("materials")
  const format = await getFormatter()

  const materials = await db.query.material.findMany({
    where: and(eq(material.userId, session.user.id), eq(material.moduleId, moduleId)),
    orderBy: [desc(material.createdAt)],
  })

  const moduleOption = [{ id: mod.id, name: mod.name }]

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <LinkDialog modules={moduleOption} />
        <UploadDialog modules={moduleOption} />
      </div>

      {materials.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">{t("empty")}</p>
      ) : (
        <ul className="space-y-2">
          {materials.map((m) => {
            const Icon = iconFor(m.mimeType, m.kind)
            return (
              <li
                key={m.id}
                className="flex flex-wrap items-center gap-2.5 rounded-md border px-3 py-2.5 text-sm"
              >
                <Icon className="text-muted-foreground size-4 shrink-0" />
                {m.kind === "link" ? (
                  <a
                    href={m.url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {m.name}
                  </a>
                ) : (
                  <Link
                    href={`/materials/${m.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {m.name}
                  </Link>
                )}
                {m.folder && (
                  <Badge variant="outline">
                    <FolderOpen className="size-3" />
                    {m.folder}
                  </Badge>
                )}
                <span className="text-muted-foreground ml-auto text-xs">
                  {formatBytes(m.sizeBytes)}
                  {m.sizeBytes != null && " · "}
                  {format.dateTime(m.createdAt, { dateStyle: "medium" })}
                </span>
                <DeleteButton action={deleteMaterial.bind(null, m.id)} />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
