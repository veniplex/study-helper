import { notFound } from "next/navigation"
import { and, eq } from "drizzle-orm"
import { ArrowLeft, Download } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { asc } from "drizzle-orm"
import { db } from "@/db"
import { material, materialAnnotation } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { fileSize } from "@/lib/storage"
import { Link } from "@/i18n/navigation"
import { AskDocumentButton } from "@/components/materials/ask-document-button"
import { MediaPlayer } from "@/components/materials/media-player"
import { PdfAnnotator } from "@/components/materials/pdf-annotator"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export default async function MaterialViewerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await requireSession()
  const t = await getTranslations("materials")
  const tCommon = await getTranslations("common")

  const row = await db.query.material.findFirst({
    where: and(eq(material.id, id), eq(material.userId, session.user.id)),
    with: { module: { with: { semester: true } } },
  })
  if (!row || row.kind !== "file") notFound()

  const backHref = `/studies/${row.module.semester.programId}/${row.moduleId}/materials`

  const fileUrl = `/api/materials/${row.id}/file`
  const mime = row.mimeType ?? ""

  // The DB row can outlive the stored file (e.g. uploads lost to a redeploy
  // before the storage volume was mounted). Detect that here and explain it,
  // instead of every viewer failing with its own cryptic error.
  let fileAvailable = Boolean(row.storagePath)
  if (fileAvailable) {
    try {
      await fileSize(row.storagePath!)
    } catch {
      fileAvailable = false
    }
  }

  const annotations =
    mime === "application/pdf"
      ? await db.query.materialAnnotation.findMany({
          where: eq(materialAnnotation.materialId, row.id),
          orderBy: [asc(materialAnnotation.createdAt)],
        })
      : []

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" nativeButton={false} render={<Link href={backHref} />}>
          <ArrowLeft className="size-4.5" />
          <span className="sr-only">{tCommon("back")}</span>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-heading text-lg font-semibold tracking-tight">{row.name}</h1>
          <p className="text-muted-foreground text-xs">{row.module.name}</p>
        </div>
        <AskDocumentButton materialId={row.id} />
        <Button variant="outline" size="sm" nativeButton={false} render={<a href={fileUrl} download={row.name} />}>
          <Download className="size-3.5" />
          {t("download")}
        </Button>
      </div>

      {!fileAvailable ? (
        <Card>
          <CardContent className="space-y-1 py-8 text-center text-sm">
            <p className="font-medium">{t("viewer.fileMissing")}</p>
            <p className="text-muted-foreground">{t("viewer.fileMissingHint")}</p>
          </CardContent>
        </Card>
      ) : mime === "application/pdf" ? (
        <PdfAnnotator
          materialId={row.id}
          fileUrl={fileUrl}
          initialAnnotations={annotations.map((a) => ({
            id: a.id,
            page: a.page,
            rect: a.rect,
            color: a.color,
            note: a.note,
          }))}
        />
      ) : mime.startsWith("video/") ? (
        <MediaPlayer materialId={row.id} src={fileUrl} kind="video" />
      ) : mime.startsWith("audio/") ? (
        <MediaPlayer materialId={row.id} src={fileUrl} kind="audio" />
      ) : mime.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fileUrl} alt={row.name} className="max-h-[80vh] max-w-full rounded-lg border" />
      ) : (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            {t("viewer.unsupported")}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
