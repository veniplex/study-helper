import { desc, eq } from "drizzle-orm"
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
import { degreeProgram, material } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { Link } from "@/i18n/navigation"
import { deleteMaterial } from "./actions"
import { DeleteButton } from "@/components/studies/delete-button"
import { LinkDialog, UploadDialog } from "@/components/materials/upload-dialog"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

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

export default async function MaterialsPage() {
  const session = await requireSession()
  const t = await getTranslations("materials")
  const format = await getFormatter()

  const [materials, programs] = await Promise.all([
    db.query.material.findMany({
      where: eq(material.userId, session.user.id),
      orderBy: [desc(material.createdAt)],
      with: { module: true },
    }),
    db.query.degreeProgram.findMany({
      where: eq(degreeProgram.userId, session.user.id),
      with: { semesters: { with: { modules: true } } },
    }),
  ])

  const modules = programs.flatMap((p) =>
    p.semesters.flatMap((s) => s.modules.map((m) => ({ id: m.id, name: m.name })))
  )

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-heading text-xl font-semibold tracking-tight">{t("title")}</h1>
        {modules.length > 0 && (
          <div className="flex gap-2">
            <LinkDialog modules={modules} />
            <UploadDialog modules={modules} />
          </div>
        )}
      </div>

      {modules.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            {t("emptyNoModules")}
          </CardContent>
        </Card>
      ) : materials.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
          <div className="bg-muted flex size-12 items-center justify-center rounded-full">
            <FolderOpen className="text-muted-foreground size-6" />
          </div>
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        </div>
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
                <Badge variant="secondary">{m.module.name}</Badge>
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
