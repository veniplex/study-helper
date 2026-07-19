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
  Archive,
  Check,
  ChevronRight,
  ExternalLink,
  File,
  FileCode,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  GripVertical,
  Home,
  Image as ImageIcon,
  LayoutGrid,
  List as ListIcon,
  Loader2,
  MoreHorizontal,
  Music,
  Pencil,
  Presentation,
  RefreshCw,
  Trash2,
  Video,
  X,
} from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { toast } from "sonner"
import { useActionErrorToast } from "@/components/action-error-toast"
import { Link, useRouter } from "@/i18n/navigation"
import {
  createFolder,
  deleteFolder,
  deleteMaterial,
  deleteMaterials,
  moveFolder,
  moveMaterialsToFolder,
  moveMaterialToFolder,
  renameFolder,
  renameMaterial,
  retryMaterialProcessing,
} from "@/app/[locale]/(app)/materials-actions"
import { ConfirmDeleteDialog } from "@/components/studies/confirm-delete-dialog"
import { EntityContextMenu, type ContextMenuAction } from "@/components/entity-context-menu"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn, formatBytes } from "@/lib/utils"
import { describeUploadError, readDroppedItems, uploadFiles } from "./upload-client"
import { LinkDialog, UploadDialog } from "./upload-dialog"

const ROOT = "__root__"

export type MaterialItem = {
  id: string
  kind: "file" | "link"
  name: string
  url: string | null
  mimeType: string | null
  sizeBytes: number | null
  folderId: string | null
  createdAt: string
  /** AI extraction/embedding pipeline state (files only). */
  extractionStatus?: string | null
  extractionError?: string | null
}

/** Pipeline states that are still moving — used to poll for fresh status. */
const ACTIVE_STATUSES = ["pending", "extracting", "embedding", "summarizing"]

/**
 * Compact pipeline-state badge for a file material. "ready" (and links) render
 * nothing; active states show a spinner; failed/skipped show why and offer a
 * retry via the row menu.
 */
function ProcessingBadge({ item }: { item: MaterialItem }) {
  const t = useTranslations("materials.processing")
  const status = item.extractionStatus
  if (item.kind !== "file" || !status || status === "ready") return null
  if (ACTIVE_STATUSES.includes(status)) {
    return (
      <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px]">
        <Loader2 className="size-3 animate-spin" />
        {t(status)}
      </span>
    )
  }
  if (status === "failed") {
    return (
      <span
        className="text-destructive border-destructive/40 bg-destructive/5 inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px]"
        title={item.extractionError ?? undefined}
      >
        <X className="size-3" />
        {t("failed")}
      </span>
    )
  }
  // skipped
  return (
    <span
      className="text-muted-foreground inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px]"
      title={item.extractionError ?? t("skippedHint")}
    >
      {t("skipped")}
    </span>
  )
}

export type FolderNode = { id: string; parentId: string | null; name: string }

const CODE_EXT =
  /\.(py|ipynb|js|jsx|ts|tsx|mjs|cjs|java|kt|c|h|cpp|cc|hpp|cs|go|rs|rb|php|swift|scala|sql|sh|bash|zsh|lua|dart|vue|svelte|r|pl|toml|ini|yaml|yml|json|xml|css|scss|html?)$/i

function MaterialIcon({ item }: { item: MaterialItem }) {
  const className = "text-muted-foreground size-4 shrink-0"
  const { kind, mimeType: mime, name } = item
  if (kind === "link") return <ExternalLink className={className} />
  if (CODE_EXT.test(name)) return <FileCode className={className} />
  if (/\.zip$/i.test(name) || mime === "application/zip") return <Archive className={className} />
  if (!mime) return <File className={className} />
  if (mime.startsWith("video/")) return <Video className={className} />
  if (mime.startsWith("audio/")) return <Music className={className} />
  if (mime.startsWith("image/")) return <ImageIcon className={className} />
  if (mime === "application/pdf") return <FileText className={className} />
  if (mime.includes("presentation")) return <Presentation className={className} />
  if (mime.includes("spreadsheet")) return <FileSpreadsheet className={className} />
  return <File className={className} />
}

// --- draggable / droppable wrappers -----------------------------------------

function useItemDraggable(id: string) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id })
  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined
  return { attributes, listeners, setNodeRef, style, isDragging }
}

function DropTarget({
  id,
  children,
  className,
}: {
  id: string
  children: React.ReactNode
  className?: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={cn(className, isOver && "ring-primary/60 rounded-md ring-2")}>
      {children}
    </div>
  )
}

// --- folder + file items ----------------------------------------------------

function FolderItem({
  folder,
  stats,
  subfolderCount,
  view,
  onOpen,
  onRename,
  onNewSubfolder,
  onMove,
  onDelete,
}: {
  folder: FolderNode
  stats: { files: number; size: number }
  subfolderCount: number
  view: "list" | "grid"
  onOpen: () => void
  onRename: () => void
  onNewSubfolder: () => void
  onMove: () => void
  onDelete: () => void
}) {
  const t = useTranslations("materials")
  const tCommon = useTranslations("common")
  const { attributes, listeners, setNodeRef: dragRef, style: dragStyle, isDragging } =
    useItemDraggable(`folder:${folder.id}`)
  const { setNodeRef, isOver } = useDroppable({ id: `drop-folder:${folder.id}` })

  const actions: ContextMenuAction[] = [
    { label: t("open"), icon: Folder, onSelect: onOpen },
    { label: t("newSubfolder"), icon: FolderPlus, onSelect: onNewSubfolder },
    { label: t("rename"), icon: Pencil, onSelect: onRename },
    { label: t("moveTo"), icon: FolderInput, onSelect: onMove },
    { label: tCommon("delete"), icon: Trash2, destructive: true, onSelect: onDelete, separatorBefore: true },
  ]

  const meta = t("folderStats", { files: stats.files, subfolders: subfolderCount, size: formatBytes(stats.size) || "0 B" })

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<button type="button" className="text-muted-foreground hover:text-foreground rounded p-1" aria-label={`${tCommon("moreOptions")}: ${folder.name}`} />}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={onOpen}><Folder className="size-4" />{t("open")}</DropdownMenuItem>
        <DropdownMenuItem onClick={onNewSubfolder}><FolderPlus className="size-4" />{t("newSubfolder")}</DropdownMenuItem>
        <DropdownMenuItem onClick={onRename}><Pencil className="size-4" />{t("rename")}</DropdownMenuItem>
        <DropdownMenuItem onClick={onMove}><FolderInput className="size-4" />{t("moveTo")}</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onDelete}><Trash2 className="size-4" />{tCommon("delete")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const grip = (
    <button type="button" className="text-muted-foreground/50 hover:text-muted-foreground cursor-grab touch-none" {...attributes} {...listeners} aria-label={`${tCommon("dragHandle")}: ${folder.name}`}>
      <GripVertical className="size-4" />
    </button>
  )

  if (view === "grid") {
    return (
      <div ref={setNodeRef} className={cn("group", isOver && "ring-primary/60 rounded-lg ring-2")}>
        <div ref={dragRef} style={dragStyle} className={cn("bg-background hover:border-primary/40 relative flex flex-col gap-2 rounded-lg border p-3", isDragging && "z-10 opacity-80 shadow-md")}>
          <div className="flex items-start justify-between">
            <Folder className="text-primary size-8" />
            <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">{grip}{menu}</div>
          </div>
          <EntityContextMenu items={actions} label={folder.name}>
            <button type="button" onClick={onOpen} className="truncate text-left text-sm font-medium hover:underline">{folder.name}</button>
          </EntityContextMenu>
          <p className="text-muted-foreground truncate text-xs">{meta}</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={setNodeRef} className={cn(isOver && "ring-primary/60 rounded-md ring-2")}>
      <div ref={dragRef} style={dragStyle} className={cn("group bg-background flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-sm", isDragging && "z-10 opacity-80 shadow-md")}>
        {grip}
        <Folder className="text-primary size-4 shrink-0" />
        <EntityContextMenu items={actions} label={folder.name}>
          <button type="button" onClick={onOpen} className="min-w-0 flex-1 truncate text-left font-medium hover:underline">{folder.name}</button>
        </EntityContextMenu>
        <span className="text-muted-foreground text-xs">{meta}</span>
        {menu}
      </div>
    </div>
  )
}

function FileItem({
  item,
  view,
  selected,
  onSelectChange,
  onRowClick,
  onRename,
  onMove,
  onDelete,
  onRetry,
}: {
  item: MaterialItem
  view: "list" | "grid"
  selected: boolean
  onSelectChange: (checked: boolean) => void
  onRowClick: (e: React.MouseEvent) => void
  onRename: () => void
  onMove: () => void
  onDelete: () => void
  onRetry: () => void
}) {
  const t = useTranslations("materials")
  const tCommon = useTranslations("common")
  const format = useFormatter()
  const { attributes, listeners, setNodeRef: dragRef, style: dragStyle, isDragging } =
    useItemDraggable(item.id)

  const canRetry =
    item.kind === "file" &&
    (item.extractionStatus === "failed" || item.extractionStatus === "skipped")

  const actions: ContextMenuAction[] = [
    { label: t("rename"), icon: Pencil, onSelect: onRename },
    { label: t("moveTo"), icon: FolderInput, onSelect: onMove },
    ...(canRetry
      ? [{ label: t("processing.retry"), icon: RefreshCw, onSelect: onRetry }]
      : []),
    { label: tCommon("delete"), icon: Trash2, destructive: true, onSelect: onDelete, separatorBefore: true },
  ]

  const nameEl =
    item.kind === "link" ? (
      <a href={item.url ?? "#"} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline">{item.name}</a>
    ) : (
      <Link href={`/materials/${item.id}`} className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline">{item.name}</Link>
    )

  const grip = (
    <button type="button" className="text-muted-foreground/50 hover:text-muted-foreground cursor-grab touch-none" {...attributes} {...listeners} aria-label={`${tCommon("dragHandle")}: ${item.name}`}>
      <GripVertical className="size-4" />
    </button>
  )

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger render={<button type="button" className="text-muted-foreground hover:text-foreground rounded p-1" aria-label={`${tCommon("moreOptions")}: ${item.name}`} />}>
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={onRename}><Pencil className="size-4" />{t("rename")}</DropdownMenuItem>
        <DropdownMenuItem onClick={onMove}><FolderInput className="size-4" />{t("moveTo")}</DropdownMenuItem>
        {canRetry && (
          <DropdownMenuItem onClick={onRetry}><RefreshCw className="size-4" />{t("processing.retry")}</DropdownMenuItem>
        )}
        <DropdownMenuItem variant="destructive" onClick={onDelete}><Trash2 className="size-4" />{tCommon("delete")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  if (view === "grid") {
    return (
      <div ref={dragRef} style={dragStyle} onClick={onRowClick} className={cn("group bg-background relative flex flex-col gap-2 rounded-lg border p-3", selected && "border-primary ring-primary/40 ring-2", isDragging && "z-10 opacity-80 shadow-md")}>
        <div className="flex items-start justify-between">
          <span className="[&_svg]:size-8"><MaterialIcon item={item} /></span>
          <div className="flex items-center gap-1">
            <Checkbox checked={selected} onCheckedChange={(c) => onSelectChange(Boolean(c))} onClick={(e) => e.stopPropagation()} />
            <span className="opacity-0 transition-opacity group-hover:opacity-100">{menu}</span>
          </div>
        </div>
        <EntityContextMenu items={actions} label={item.name}>
          <div className="min-w-0">{nameEl}</div>
        </EntityContextMenu>
        <p className="text-muted-foreground flex items-center gap-1.5 truncate text-xs">
          {formatBytes(item.sizeBytes)}
          {item.sizeBytes != null && " · "}
          {format.dateTime(new Date(item.createdAt), { dateStyle: "medium" })}
          <ProcessingBadge item={item} />
        </p>
        <span className="absolute right-2 bottom-2 opacity-40 transition-opacity group-hover:opacity-100">{grip}</span>
      </div>
    )
  }

  return (
    <li ref={dragRef} style={dragStyle} onClick={onRowClick} className={cn("group bg-background flex flex-wrap items-center gap-2.5 rounded-md border px-3 py-2.5 text-sm", selected && "border-primary ring-primary/40 ring-2", isDragging && "z-10 opacity-80 shadow-md")}>
      <Checkbox checked={selected} onCheckedChange={(c) => onSelectChange(Boolean(c))} onClick={(e) => e.stopPropagation()} />
      {grip}
      <MaterialIcon item={item} />
      <EntityContextMenu items={actions} label={item.name}>{nameEl}</EntityContextMenu>
      <ProcessingBadge item={item} />
      <span className="text-muted-foreground text-xs">
        {formatBytes(item.sizeBytes)}
        {item.sizeBytes != null && " · "}
        {format.dateTime(new Date(item.createdAt), { dateStyle: "medium" })}
      </span>
      {menu}
    </li>
  )
}

// --- move-to folder picker --------------------------------------------------

function MoveDialog({
  open,
  onOpenChange,
  childrenByParent,
  excludeSubtreeOf,
  onPick,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  childrenByParent: Map<string, FolderNode[]>
  /** Folder id whose subtree must be excluded (when moving a folder). */
  excludeSubtreeOf?: string | null
  onPick: (folderId: string | null) => void
}) {
  const t = useTranslations("materials")

  const excluded = React.useMemo(() => {
    const set = new Set<string>()
    if (!excludeSubtreeOf) return set
    const walk = (id: string) => {
      set.add(id)
      for (const c of childrenByParent.get(id) ?? []) walk(c.id)
    }
    walk(excludeSubtreeOf)
    return set
  }, [excludeSubtreeOf, childrenByParent])

  const rows: { folder: FolderNode; depth: number }[] = []
  const build = (parent: string, depth: number) => {
    for (const f of childrenByParent.get(parent) ?? []) {
      if (excluded.has(f.id)) continue
      rows.push({ folder: f, depth })
      build(f.id, depth + 1)
    }
  }
  build(ROOT, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("moveTo")}</DialogTitle>
        </DialogHeader>
        <div className="max-h-72 space-y-1 overflow-y-auto">
          <button type="button" onClick={() => onPick(null)} className="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm">
            <Home className="size-4" />{t("breadcrumbRoot")}
          </button>
          {rows.map(({ folder, depth }) => (
            <button key={folder.id} type="button" onClick={() => onPick(folder.id)} className="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm" style={{ paddingLeft: `${depth * 16 + 8}px` }}>
              <Folder className="size-4 shrink-0" />
              <span className="truncate">{folder.name}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// --- main browser -----------------------------------------------------------

export function MaterialsBrowser({
  moduleId,
  materials,
  folders,
  indexingEnabled = true,
}: {
  moduleId: string
  materials: MaterialItem[]
  folders: FolderNode[]
  /** False when no embedding model is configured — materials won't be searchable. */
  indexingEnabled?: boolean
}) {
  const t = useTranslations("materials")
  const showError = useActionErrorToast()
  const router = useRouter()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const [currentFolderId, setCurrentFolderId] = React.useState<string | null>(null)
  const [view, setView] = React.useState<"list" | "grid">("list")
  const [selection, setSelection] = React.useState<Set<string>>(new Set())
  const lastIndexRef = React.useRef<number | null>(null)

  // Dialog / editing state
  const [newFolderParent, setNewFolderParent] = React.useState<string | null | undefined>(undefined)
  const [newFolderName, setNewFolderName] = React.useState("")
  const [renameTarget, setRenameTarget] = React.useState<{ kind: "file" | "folder"; id: string; name: string } | null>(null)
  const [renameValue, setRenameValue] = React.useState("")
  const [moveTarget, setMoveTarget] = React.useState<{ kind: "file" | "folder" | "selection"; id?: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<{ kind: "file" | "folder" | "selection"; id?: string; label: string } | null>(null)
  const [dragOver, setDragOver] = React.useState(false)
  const [uploadingMsg, setUploadingMsg] = React.useState<string | null>(null)

  // Persist view mode (deferred to avoid a synchronous setState cascade).
  React.useEffect(() => {
    const saved = window.localStorage.getItem("materials-view-mode")
    if (saved === "grid" || saved === "list") queueMicrotask(() => setView(saved))
  }, [])

  // While any material is still extracting/embedding, refresh periodically so
  // the pipeline badges move without a manual reload.
  const hasActiveProcessing = materials.some(
    (m) => m.extractionStatus && ACTIVE_STATUSES.includes(m.extractionStatus)
  )
  React.useEffect(() => {
    if (!hasActiveProcessing) return
    const id = setInterval(() => router.refresh(), 5000)
    return () => clearInterval(id)
  }, [hasActiveProcessing, router])

  async function retryProcessing(materialId: string) {
    try {
      await retryMaterialProcessing(materialId)
      router.refresh()
    } catch (error) {
      showError(error)
    }
  }
  function changeView(next: "list" | "grid") {
    setView(next)
    window.localStorage.setItem("materials-view-mode", next)
  }

  const foldersById = React.useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders])
  const childrenByParent = React.useMemo(() => {
    const map = new Map<string, FolderNode[]>()
    for (const f of [...folders].sort((a, b) => a.name.localeCompare(b.name))) {
      const key = f.parentId ?? ROOT
      const list = map.get(key) ?? []
      list.push(f)
      map.set(key, list)
    }
    return map
  }, [folders])
  const filesByFolder = React.useMemo(() => {
    const map = new Map<string, MaterialItem[]>()
    for (const m of materials) {
      const key = m.folderId ?? ROOT
      const list = map.get(key) ?? []
      list.push(m)
      map.set(key, list)
    }
    return map
  }, [materials])

  // Recursive per-folder stats (files + bytes across the whole subtree).
  const subtreeStats = React.useMemo(() => {
    const stats = new Map<string, { files: number; size: number }>()
    const compute = (folderId: string): { files: number; size: number } => {
      const cached = stats.get(folderId)
      if (cached) return cached
      let files = 0
      let size = 0
      for (const m of filesByFolder.get(folderId) ?? []) {
        if (m.kind === "file") {
          files++
          size += m.sizeBytes ?? 0
        }
      }
      for (const child of childrenByParent.get(folderId) ?? []) {
        const s = compute(child.id)
        files += s.files
        size += s.size
      }
      const result = { files, size }
      stats.set(folderId, result)
      return result
    }
    for (const f of folders) compute(f.id)
    return stats
  }, [folders, filesByFolder, childrenByParent])

  // Fall back to the root if the current folder disappeared (e.g. after a
  // delete + refresh) — derived during render, no effect needed.
  const activeFolderId =
    currentFolderId && foldersById.has(currentFolderId) ? currentFolderId : null

  function navigateTo(folderId: string | null) {
    setCurrentFolderId(folderId)
    setSelection(new Set())
    lastIndexRef.current = null
  }

  const trail = React.useMemo(() => {
    const chain: FolderNode[] = []
    let id: string | null = activeFolderId
    while (id) {
      const f = foldersById.get(id)
      if (!f) break
      chain.unshift(f)
      id = f.parentId
    }
    return chain
  }, [activeFolderId, foldersById])

  const currentFolders = childrenByParent.get(activeFolderId ?? ROOT) ?? []
  const currentFiles = filesByFolder.get(activeFolderId ?? ROOT) ?? []

  const totalFiles = materials.filter((m) => m.kind === "file").length
  const totalSize = materials.reduce((sum, m) => sum + (m.kind === "file" ? m.sizeBytes ?? 0 : 0), 0)

  async function run(action: () => Promise<unknown>) {
    try {
      await action()
      router.refresh()
    } catch (error) {
      showError(error)
    }
  }

  // --- selection ---
  function toggleSelect(id: string, checked: boolean) {
    setSelection((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }
  function onFileRowClick(e: React.MouseEvent, index: number, id: string) {
    if (e.shiftKey && lastIndexRef.current != null) {
      e.preventDefault()
      const [a, b] = [lastIndexRef.current, index].sort((x, y) => x - y)
      setSelection((prev) => {
        const next = new Set(prev)
        for (let i = a; i <= b; i++) next.add(currentFiles[i].id)
        return next
      })
    } else if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      toggleSelect(id, !selection.has(id))
      lastIndexRef.current = index
    } else {
      lastIndexRef.current = index
    }
  }

  // --- drag & drop (internal moves) ---
  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    let targetFolderId: string | null
    if (overId === "drop-root") targetFolderId = null
    else if (overId === "drop-parent") targetFolderId = activeFolderId ? foldersById.get(activeFolderId)?.parentId ?? null : null
    else if (overId.startsWith("drop-folder:")) targetFolderId = overId.slice("drop-folder:".length)
    else return

    if (activeId.startsWith("folder:")) {
      const folderId = activeId.slice("folder:".length)
      if (folderId === targetFolderId) return
      await run(() => moveFolder(folderId, targetFolderId))
    } else {
      const ids = selection.has(activeId) && selection.size > 1 ? [...selection] : [activeId]
      if (ids.length === 1) await run(() => moveMaterialToFolder(ids[0], targetFolderId))
      else await run(() => moveMaterialsToFolder({ ids, folderId: targetFolderId }))
    }
  }

  // --- native file/folder drop (upload) ---
  const dragDepth = React.useRef(0)
  React.useEffect(() => {
    function hasFiles(e: DragEvent) {
      return Array.from(e.dataTransfer?.types ?? []).includes("Files")
    }
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current++
      setDragOver(true)
    }
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      dragDepth.current--
      if (dragDepth.current <= 0) setDragOver(false)
    }
    const onDrop = async (e: DragEvent) => {
      if (!e.dataTransfer || !hasFiles(e)) return
      e.preventDefault()
      dragDepth.current = 0
      setDragOver(false)
      const items = await readDroppedItems(e.dataTransfer)
      if (items.length === 0) return
      setUploadingMsg(t("uploadingCount", { done: 0, total: items.length }))
      try {
        const { queued } = await uploadFiles(items, {
          moduleId,
          folderId: activeFolderId,
          onProgress: (p) => setUploadingMsg(t("uploadingCount", { done: p.done, total: p.total })),
        })
        if (queued > 0) toast.success(t("unpacking"))
        else toast.success(t("uploaded"))
      } catch (error) {
        toast.error(t("uploadFailed", { error: describeUploadError(error, t) }))
      } finally {
        setUploadingMsg(null)
        router.refresh()
      }
    }
    window.addEventListener("dragenter", onEnter)
    window.addEventListener("dragover", onOver)
    window.addEventListener("dragleave", onLeave)
    window.addEventListener("drop", onDrop)
    return () => {
      window.removeEventListener("dragenter", onEnter)
      window.removeEventListener("dragover", onOver)
      window.removeEventListener("dragleave", onLeave)
      window.removeEventListener("drop", onDrop)
    }
  }, [moduleId, activeFolderId, router, t])

  function submitNewFolder() {
    const name = newFolderName.trim()
    if (!name) return
    const parentId = newFolderParent === undefined ? activeFolderId : newFolderParent
    void run(() => createFolder({ moduleId, parentId, name }))
    setNewFolderName("")
    setNewFolderParent(undefined)
  }

  function submitRename() {
    if (!renameTarget) return
    const value = renameValue.trim()
    if (!value) return
    const target = renameTarget
    void run(() => (target.kind === "file" ? renameMaterial(target.id, value) : renameFolder(target.id, value)))
    setRenameTarget(null)
  }

  function doMove(folderId: string | null) {
    const target = moveTarget
    setMoveTarget(null)
    if (!target) return
    if (target.kind === "folder" && target.id) void run(() => moveFolder(target.id!, folderId))
    else if (target.kind === "file" && target.id) void run(() => moveMaterialToFolder(target.id!, folderId))
    else if (target.kind === "selection") void run(() => moveMaterialsToFolder({ ids: [...selection], folderId }))
    if (target.kind === "selection") setSelection(new Set())
  }

  async function doDelete() {
    const target = deleteTarget
    if (!target) return
    if (target.kind === "folder" && target.id) await deleteFolder({ folderId: target.id, mode: "recursive" })
    else if (target.kind === "file" && target.id) await deleteMaterial(target.id)
    else if (target.kind === "selection") {
      await deleteMaterials([...selection])
      setSelection(new Set())
    }
    router.refresh()
  }

  const newFolderOpen = newFolderParent !== undefined
  const isEmpty = currentFolders.length === 0 && currentFiles.length === 0

  return (
    <div className="relative space-y-3">
      {!indexingEnabled && materials.some((m) => m.kind === "file") && (
        <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-xs">
          {t("notIndexedHint")}
        </p>
      )}
      {/* Stats bar */}
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span>{t("stats.files", { count: totalFiles })}</span>
        <span>{t("stats.folders", { count: folders.length })}</span>
        <span>{t("stats.size", { size: formatBytes(totalSize) || "0 B" })}</span>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Breadcrumbs */}
        <div className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
          <DropTarget id="drop-root">
            <button type="button" onClick={() => navigateTo(null)} className="text-muted-foreground hover:text-foreground flex items-center gap-1 rounded px-1 py-0.5">
              <Home className="size-4" />
              <span>{t("breadcrumbRoot")}</span>
            </button>
          </DropTarget>
          {trail.map((f) => (
            <span key={f.id} className="flex items-center gap-1">
              <ChevronRight className="text-muted-foreground/60 size-3.5" />
              <DropTarget id={`drop-folder:${f.id}`}>
                <button type="button" onClick={() => navigateTo(f.id)} className={cn("hover:text-foreground rounded px-1 py-0.5", f.id === activeFolderId ? "text-foreground font-medium" : "text-muted-foreground")}>
                  {f.name}
                </button>
              </DropTarget>
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <LinkDialog moduleId={moduleId} folderId={activeFolderId} />
          <UploadDialog moduleId={moduleId} folderId={activeFolderId} />
          <Button variant="outline" size="sm" onClick={() => { setNewFolderParent(activeFolderId); setNewFolderName("") }}>
            <FolderPlus className="size-4" />
            {t("newFolder")}
          </Button>
          <div className="flex overflow-hidden rounded-md border">
            <button type="button" aria-label={t("viewList")} onClick={() => changeView("list")} className={cn("p-1.5", view === "list" ? "bg-muted text-foreground" : "text-muted-foreground")}>
              <ListIcon className="size-4" />
            </button>
            <button type="button" aria-label={t("viewGrid")} onClick={() => changeView("grid")} className={cn("p-1.5", view === "grid" ? "bg-muted text-foreground" : "text-muted-foreground")}>
              <LayoutGrid className="size-4" />
            </button>
          </div>
        </div>
      </div>

      <DndContext id={`materials-${moduleId}`} sensors={sensors} onDragEnd={onDragEnd}>
        {/* "Up one level" drop target when inside a folder */}
        {activeFolderId && (
          <DropTarget id="drop-parent" className="mb-2">
            <button type="button" onClick={() => navigateTo(foldersById.get(activeFolderId)?.parentId ?? null)} className="text-muted-foreground hover:bg-muted flex w-full items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs">
              <ChevronRight className="size-3.5 rotate-180" />
              {t("upOneLevel")}
            </button>
          </DropTarget>
        )}

        {view === "grid" ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {currentFolders.map((f) => (
              <FolderItem key={f.id} folder={f} view="grid" stats={subtreeStats.get(f.id) ?? { files: 0, size: 0 }} subfolderCount={(childrenByParent.get(f.id) ?? []).length} onOpen={() => setCurrentFolderId(f.id)} onRename={() => { setRenameTarget({ kind: "folder", id: f.id, name: f.name }); setRenameValue(f.name) }} onNewSubfolder={() => { setNewFolderParent(f.id); setNewFolderName("") }} onMove={() => setMoveTarget({ kind: "folder", id: f.id })} onDelete={() => setDeleteTarget({ kind: "folder", id: f.id, label: f.name })} />
            ))}
            {currentFiles.map((item, i) => (
              <FileItem key={item.id} item={item} view="grid" selected={selection.has(item.id)} onSelectChange={(c) => { toggleSelect(item.id, c); lastIndexRef.current = i }} onRowClick={(e) => onFileRowClick(e, i, item.id)} onRename={() => { setRenameTarget({ kind: "file", id: item.id, name: item.name }); setRenameValue(item.name) }} onMove={() => setMoveTarget({ kind: "file", id: item.id })} onDelete={() => setDeleteTarget({ kind: "file", id: item.id, label: item.name })} onRetry={() => void retryProcessing(item.id)} />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {currentFolders.map((f) => (
              <FolderItem key={f.id} folder={f} view="list" stats={subtreeStats.get(f.id) ?? { files: 0, size: 0 }} subfolderCount={(childrenByParent.get(f.id) ?? []).length} onOpen={() => setCurrentFolderId(f.id)} onRename={() => { setRenameTarget({ kind: "folder", id: f.id, name: f.name }); setRenameValue(f.name) }} onNewSubfolder={() => { setNewFolderParent(f.id); setNewFolderName("") }} onMove={() => setMoveTarget({ kind: "folder", id: f.id })} onDelete={() => setDeleteTarget({ kind: "folder", id: f.id, label: f.name })} />
            ))}
            <ul className="space-y-2">
              {currentFiles.map((item, i) => (
                <FileItem key={item.id} item={item} view="list" selected={selection.has(item.id)} onSelectChange={(c) => { toggleSelect(item.id, c); lastIndexRef.current = i }} onRowClick={(e) => onFileRowClick(e, i, item.id)} onRename={() => { setRenameTarget({ kind: "file", id: item.id, name: item.name }); setRenameValue(item.name) }} onMove={() => setMoveTarget({ kind: "file", id: item.id })} onDelete={() => setDeleteTarget({ kind: "file", id: item.id, label: item.name })} onRetry={() => void retryProcessing(item.id)} />
              ))}
            </ul>
          </div>
        )}

        {isEmpty && <p className="text-muted-foreground py-8 text-center text-sm">{t("empty")}</p>}
      </DndContext>

      {/* Selection action bar */}
      {selection.size > 0 && (
        <div className="bg-background sticky bottom-4 z-20 mx-auto flex w-fit items-center gap-3 rounded-full border px-4 py-2 text-sm shadow-lg">
          <span className="font-medium">{t("selectedCount", { count: selection.size })}</span>
          <Button size="sm" variant="outline" onClick={() => setMoveTarget({ kind: "selection" })}><FolderInput className="size-4" />{t("move")}</Button>
          <Button size="sm" variant="destructive" onClick={() => setDeleteTarget({ kind: "selection", label: t("selectedCount", { count: selection.size }) })}><Trash2 className="size-4" />{t("deleteSelected")}</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelection(new Set())}><X className="size-4" />{t("clearSelection")}</Button>
        </div>
      )}

      {/* Upload progress */}
      {uploadingMsg && (
        <div className="bg-background fixed right-4 bottom-4 z-30 flex items-center gap-2 rounded-md border px-3 py-2 text-sm shadow-lg">
          <Loader2 className="size-4 animate-spin" />
          {uploadingMsg}
        </div>
      )}

      {/* Full-window drop overlay */}
      {dragOver && (
        <div className="border-primary bg-primary/10 pointer-events-none fixed inset-4 z-40 flex items-center justify-center rounded-xl border-2 border-dashed">
          <p className="text-primary text-lg font-medium">{t("dropToUpload")}</p>
        </div>
      )}

      {/* New folder dialog */}
      <Dialog open={newFolderOpen} onOpenChange={(o) => !o && setNewFolderParent(undefined)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("newFolder")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitNewFolder()} placeholder={t("newFolderPrompt")} autoFocus />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setNewFolderParent(undefined)}>{t("cancel")}</Button>
              <Button onClick={submitNewFolder} disabled={!newFolderName.trim()}>{t("newFolder")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={renameTarget != null} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("rename")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitRename()} autoFocus />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRenameTarget(null)}>{t("cancel")}</Button>
              <Button onClick={submitRename} disabled={!renameValue.trim()}><Check className="size-4" />{t("rename")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Move dialog */}
      <MoveDialog open={moveTarget != null} onOpenChange={(o) => !o && setMoveTarget(null)} childrenByParent={childrenByParent} excludeSubtreeOf={moveTarget?.kind === "folder" ? moveTarget.id : null} onPick={doMove} />

      {/* Delete confirm */}
      <ConfirmDeleteDialog open={deleteTarget != null} onOpenChange={(o) => !o && setDeleteTarget(null)} label={deleteTarget?.label ?? ""} onConfirm={doDelete} />
    </div>
  )
}
