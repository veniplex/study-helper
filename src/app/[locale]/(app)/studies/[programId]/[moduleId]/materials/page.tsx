import { and, desc, eq } from "drizzle-orm"
import { db } from "@/db"
import { material } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { ownModule } from "@/lib/studies/access"
import { LinkDialog, UploadDialog } from "@/components/materials/upload-dialog"
import { MaterialsBrowser } from "@/components/materials/materials-browser"

export default async function ModuleMaterialsPage({
  params,
}: {
  params: Promise<{ moduleId: string }>
}) {
  const { moduleId } = await params
  const session = await requireSession()
  const mod = await ownModule(moduleId, session.user.id)

  const materials = await db.query.material.findMany({
    where: and(eq(material.userId, session.user.id), eq(material.moduleId, moduleId)),
    orderBy: [desc(material.createdAt)],
  })

  const moduleOption = [{ id: mod.id, name: mod.name }]

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <LinkDialog modules={moduleOption} hideModuleSelect />
        <UploadDialog modules={moduleOption} hideModuleSelect />
      </div>
      <MaterialsBrowser
        moduleId={mod.id}
        materials={materials.map((m) => ({
          id: m.id,
          kind: m.kind,
          name: m.name,
          url: m.url,
          mimeType: m.mimeType,
          sizeBytes: m.sizeBytes,
          folder: m.folder,
          createdAt: m.createdAt.toISOString(),
        }))}
      />
    </div>
  )
}
