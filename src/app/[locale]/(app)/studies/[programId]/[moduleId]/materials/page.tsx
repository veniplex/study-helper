import { and, asc, desc, eq } from "drizzle-orm"
import { db } from "@/db"
import { material, materialFolder } from "@/db/schema"
import { requireSession } from "@/lib/auth/session"
import { ownModule } from "@/lib/studies/access"
import { MaterialsBrowser } from "@/components/materials/materials-browser"

export default async function ModuleMaterialsPage({
  params,
}: {
  params: Promise<{ moduleId: string }>
}) {
  const { moduleId } = await params
  const session = await requireSession()
  const mod = await ownModule(moduleId, session.user.id)

  const [materials, folders] = await Promise.all([
    db.query.material.findMany({
      where: and(eq(material.userId, session.user.id), eq(material.moduleId, moduleId)),
      orderBy: [desc(material.createdAt)],
    }),
    db.query.materialFolder.findMany({
      where: and(eq(materialFolder.userId, session.user.id), eq(materialFolder.moduleId, moduleId)),
      orderBy: [asc(materialFolder.name)],
    }),
  ])

  return (
    <MaterialsBrowser
      moduleId={mod.id}
      materials={materials.map((m) => ({
        id: m.id,
        kind: m.kind,
        name: m.name,
        url: m.url,
        mimeType: m.mimeType,
        sizeBytes: m.sizeBytes,
        folderId: m.folderId,
        createdAt: m.createdAt.toISOString(),
      }))}
      folders={folders.map((f) => ({ id: f.id, parentId: f.parentId, name: f.name }))}
    />
  )
}
