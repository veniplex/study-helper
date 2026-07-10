"use client"

import * as React from "react"
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  Check,
  ChevronRight,
  ExternalLink,
  File,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  GripVertical,
  Image as ImageIcon,
  Music,
  Pencil,
  Presentation,
  Trash2,
  Video,
  X,
} from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { toast } from "sonner"
import { Link, useRouter } from "@/i18n/navigation"
import {
  deleteFolder,
  deleteMaterial,
  moveMaterialToFolder,
  renameFolder,
  renameMaterial,
} from "@/app/[locale]/(app)/materials-actions"
import { DeleteButton } from "@/components/studies/delete-button"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type MaterialItem = {
  id: string
  kind: "file" | "link"
  name: string
  url: string | null
  mimeType: string | null
  sizeBytes: number | null
  folder: string | null
  createdAt: string
}

function MaterialIcon({ mime, kind }: { mime: string | null; kind: string }) {
  const className = "text-muted-foreground size-4 shrink-0"
  if (kind === "link") return <ExternalLink className={className} />
  if (!mime) return <File className={className} />
  if (mime.startsWith("video/")) return <Video className={className} />
  if (mime.startsWith("audio/")) return <Music className={className} />
  if (mime.startsWith("image/")) return <ImageIcon className={className} />
  if (mime === "application/pdf") return <FileText className={className} />
  if (mime.includes("presentation")) return <Presentation className={className} />
  return <File className={className} />
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

function MaterialRow({ item }: { item: MaterialItem }) {
  const t = useTranslations("materials")
  const format = useFormatter()
  const router = useRouter()
  const [renaming, setRenaming] = React.useState(false)
  const [name, setName] = React.useState(item.name)
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
  })

  async function onRename() {
    try {
      await renameMaterial(item.id, name)
      setRenaming(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={cn(
        "bg-background flex flex-wrap items-center gap-2.5 rounded-md border px-3 py-2.5 text-sm",
        isDragging && "z-10 opacity-80 shadow-md"
      )}
    >
      <button
        type="button"
        className="text-muted-foreground/60 hover:text-muted-foreground cursor-grab touch-none"
        {...attributes}
        {...listeners}
        aria-label={item.name}
      >
        <GripVertical className="size-4" />
      </button>
      <MaterialIcon mime={item.mimeType} kind={item.kind} />
      {renaming ? (
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void onRename()}
            className="h-7 flex-1"
            autoFocus
          />
          <Button variant="ghost" size="icon-sm" onClick={() => void onRename()}>
            <Check className="size-3.5" />
            <span className="sr-only">{t("rename")}</span>
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setRenaming(false)}>
            <X className="size-3.5" />
            <span className="sr-only">{t("cancel")}</span>
          </Button>
        </span>
      ) : item.kind === "link" ? (
        <a
          href={item.url ?? "#"}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline"
        >
          {item.name}
        </a>
      ) : (
        <Link
          href={`/materials/${item.id}`}
          className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline"
        >
          {item.name}
        </Link>
      )}
      {!renaming && (
        <>
          <span className="text-muted-foreground text-xs">
            {formatBytes(item.sizeBytes)}
            {item.sizeBytes != null && " · "}
            {format.dateTime(new Date(item.createdAt), { dateStyle: "medium" })}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            title={t("rename")}
            onClick={() => {
              setName(item.name)
              setRenaming(true)
            }}
          >
            <Pencil className="size-3.5" />
            <span className="sr-only">{t("rename")}</span>
          </Button>
          <DeleteButton action={deleteMaterial.bind(null, item.id)} />
        </>
      )}
    </li>
  )
}

function FolderGroup({
  moduleId,
  name,
  items,
  isRoot,
}: {
  moduleId: string
  name: string
  items: MaterialItem[]
  isRoot?: boolean
}) {
  const t = useTranslations("materials")
  const router = useRouter()
  const [open, setOpen] = React.useState(true)
  const [renaming, setRenaming] = React.useState(false)
  const [newName, setNewName] = React.useState(name)
  const { setNodeRef, isOver } = useDroppable({ id: isRoot ? "__root__" : `folder:${name}` })

  async function onRenameFolder() {
    try {
      await renameFolder(moduleId, name, newName)
      setRenaming(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  async function onDeleteFolder() {
    try {
      await deleteFolder(moduleId, name)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div ref={setNodeRef} className={cn("rounded-md", isOver && "ring-primary/50 ring-2")}>
      {!isRoot && (
        <div className="group flex items-center gap-1.5 px-1 py-1.5">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm font-medium"
            aria-expanded={open}
          >
            <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
            {open ? <FolderOpen className="size-4" /> : <Folder className="size-4" />}
            {renaming ? null : (
              <>
                {name}
                <span className="text-muted-foreground/70 text-xs">({items.length})</span>
              </>
            )}
          </button>
          {renaming ? (
            <span className="flex items-center gap-1.5">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void onRenameFolder()}
                className="h-7 w-48"
                autoFocus
              />
              <Button variant="ghost" size="icon-sm" onClick={() => void onRenameFolder()}>
                <Check className="size-3.5" />
                <span className="sr-only">{t("rename")}</span>
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => setRenaming(false)}>
                <X className="size-3.5" />
                <span className="sr-only">{t("cancel")}</span>
              </Button>
            </span>
          ) : (
            <span className="flex opacity-0 transition-opacity group-hover:opacity-100">
              <Button
                variant="ghost"
                size="icon-sm"
                title={t("renameFolder")}
                onClick={() => {
                  setNewName(name)
                  setRenaming(true)
                }}
              >
                <Pencil className="size-3" />
                <span className="sr-only">{t("renameFolder")}</span>
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                title={t("deleteFolder")}
                onClick={() => void onDeleteFolder()}
              >
                <Trash2 className="size-3" />
                <span className="sr-only">{t("deleteFolder")}</span>
              </Button>
            </span>
          )}
        </div>
      )}
      {(isRoot || open) && (
        <ul className={cn("space-y-2", !isRoot && "ml-5")}>
          {items.map((item) => (
            <MaterialRow key={item.id} item={item} />
          ))}
          {items.length === 0 && (
            <li className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-xs">
              {t("dropHere")}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

export function MaterialsBrowser({
  moduleId,
  materials,
}: {
  moduleId: string
  materials: MaterialItem[]
}) {
  const t = useTranslations("materials")
  const router = useRouter()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [extraFolders, setExtraFolders] = React.useState<string[]>([])
  const [newFolderOpen, setNewFolderOpen] = React.useState(false)
  const [newFolderName, setNewFolderName] = React.useState("")

  const folderNames = [
    ...new Set([
      ...materials.map((m) => m.folder).filter((f): f is string => Boolean(f)),
      ...extraFolders,
    ]),
  ].sort()
  const rootItems = materials.filter((m) => !m.folder)

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const materialId = String(active.id)
    const target = String(over.id)
    const item = materials.find((m) => m.id === materialId)
    if (!item) return
    const folder = target === "__root__" ? null : target.replace(/^folder:/, "")
    if ((item.folder ?? null) === folder) return
    try {
      await moveMaterialToFolder(materialId, folder)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  function addFolder() {
    const name = newFolderName.trim()
    if (!name) return
    if (!folderNames.includes(name)) setExtraFolders((f) => [...f, name])
    setNewFolderName("")
    setNewFolderOpen(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setNewFolderOpen(true)}>
          <FolderPlus className="size-4" />
          {t("newFolder")}
        </Button>
      </div>
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("newFolder")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addFolder()}
              placeholder={t("newFolderPrompt")}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setNewFolderOpen(false)}>
                {t("cancel")}
              </Button>
              <Button onClick={addFolder} disabled={!newFolderName.trim()}>
                {t("newFolder")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <DndContext id={`materials-${moduleId}`} sensors={sensors} onDragEnd={onDragEnd}>
        <div className="space-y-3">
          {folderNames.map((name) => (
            <FolderGroup
              key={name}
              moduleId={moduleId}
              name={name}
              items={materials.filter((m) => m.folder === name)}
            />
          ))}
          <FolderGroup moduleId={moduleId} name="" items={rootItems} isRoot />
        </div>
      </DndContext>
      {materials.length === 0 && folderNames.length === 0 && (
        <p className="text-muted-foreground py-8 text-center text-sm">{t("empty")}</p>
      )}
    </div>
  )
}
