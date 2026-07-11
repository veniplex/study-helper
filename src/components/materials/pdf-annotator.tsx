"use client"

import * as React from "react"
import { Loader2, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  createAnnotation,
  deleteAnnotation,
  updateAnnotationNote,
} from "@/app/[locale]/(app)/materials-actions"
import type { AnnotationColor, AnnotationRect } from "@/db/schema/materials"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export type PdfAnnotation = {
  id: string
  page: number
  rect: AnnotationRect
  color: AnnotationColor
  note: string | null
}

const COLORS: Record<AnnotationColor, { fill: string; swatch: string }> = {
  yellow: { fill: "rgba(250, 204, 21, 0.35)", swatch: "bg-yellow-400" },
  green: { fill: "rgba(74, 222, 128, 0.35)", swatch: "bg-green-400" },
  red: { fill: "rgba(248, 113, 113, 0.35)", swatch: "bg-red-400" },
  blue: { fill: "rgba(96, 165, 250, 0.35)", swatch: "bg-blue-400" },
}

type PageInfo = { pageNumber: number; aspect: number }

/**
 * PDF viewer with rectangle highlights + notes. Drag on a page to mark an
 * area; click a highlight to edit its note or delete it. Rects are stored in
 * normalized page coordinates so they survive any zoom level.
 */
export function PdfAnnotator({
  materialId,
  fileUrl,
  initialAnnotations,
}: {
  materialId: string
  fileUrl: string
  initialAnnotations: PdfAnnotation[]
}) {
  const t = useTranslations("materials.annotator")
  const tCommon = useTranslations("common")
  const [pages, setPages] = React.useState<PageInfo[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [annotations, setAnnotations] = React.useState(initialAnnotations)
  const [color, setColor] = React.useState<AnnotationColor>("yellow")
  const [selected, setSelected] = React.useState<PdfAnnotation | null>(null)
  const [note, setNote] = React.useState("")
  const pdfRef = React.useRef<unknown>(null)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const pdfjs = await import("pdfjs-dist")
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString()
        const pdf = await pdfjs.getDocument({ url: fileUrl }).promise
        if (cancelled) return
        pdfRef.current = pdf
        const infos: PageInfo[] = []
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const viewport = page.getViewport({ scale: 1 })
          infos.push({ pageNumber: i, aspect: viewport.height / viewport.width })
        }
        if (!cancelled) setPages(infos)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fileUrl])

  async function onCreate(page: number, rect: AnnotationRect) {
    const temp: PdfAnnotation = { id: `tmp-${crypto.randomUUID()}`, page, rect, color, note: null }
    setAnnotations((list) => [...list, temp])
    try {
      const result = await createAnnotation(materialId, { page, rect, color })
      setAnnotations((list) =>
        list.map((a) => (a.id === temp.id ? { ...a, id: result.id } : a))
      )
    } catch (err) {
      setAnnotations((list) => list.filter((a) => a.id !== temp.id))
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function onDelete(id: string) {
    setAnnotations((list) => list.filter((a) => a.id !== id))
    setSelected(null)
    try {
      await deleteAnnotation(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function onSaveNote() {
    if (!selected) return
    setAnnotations((list) =>
      list.map((a) => (a.id === selected.id ? { ...a, note: note || null } : a))
    )
    setSelected(null)
    try {
      await updateAnnotationNote(selected.id, note)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  if (error) {
    return <p className="text-destructive py-8 text-center text-sm">{error}</p>
  }
  if (pages.length === 0) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs">{t("hint")}</span>
        <span className="ml-auto flex items-center gap-1">
          {(Object.keys(COLORS) as AnnotationColor[]).map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              className={cn(
                "size-6 rounded-full border-2",
                COLORS[c].swatch,
                color === c ? "border-foreground" : "border-transparent"
              )}
            />
          ))}
        </span>
      </div>

      <div className="space-y-4">
        {pages.map((p) => (
          <PdfPage
            key={p.pageNumber}
            pdfRef={pdfRef}
            info={p}
            annotations={annotations.filter((a) => a.page === p.pageNumber)}
            onCreate={(rect) => void onCreate(p.pageNumber, rect)}
            onSelect={(a) => {
              setSelected(a)
              setNote(a.note ?? "")
            }}
          />
        ))}
      </div>

      {selected && (
        <div className="bg-background fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md space-y-2 rounded-lg border p-3 shadow-lg">
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("notePlaceholder")}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-destructive"
              onClick={() => void onDelete(selected.id)}
            >
              <Trash2 className="size-4" />
              <span className="sr-only">{tCommon("delete")}</span>
            </Button>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => setSelected(null)}>
              {tCommon("cancel")}
            </Button>
            <Button size="sm" onClick={() => void onSaveNote()}>
              {tCommon("save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function PdfPage({
  pdfRef,
  info,
  annotations,
  onCreate,
  onSelect,
}: {
  pdfRef: React.RefObject<unknown>
  info: PageInfo
  annotations: PdfAnnotation[]
  onCreate: (rect: AnnotationRect) => void
  onSelect: (a: PdfAnnotation) => void
}) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const renderedRef = React.useRef(false)
  const [drag, setDrag] = React.useState<AnnotationRect | null>(null)
  const dragStart = React.useRef<{ x: number; y: number } | null>(null)

  // Render lazily when the page scrolls near the viewport.
  React.useEffect(() => {
    const el = containerRef.current
    if (!el) return

    async function renderPage() {
      const pdf = pdfRef.current as {
        getPage: (n: number) => Promise<{
          getViewport: (o: { scale: number }) => { width: number; height: number }
          render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
            promise: Promise<void>
          }
        }>
      } | null
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!pdf || !canvas || !container) return
      const page = await pdf.getPage(info.pageNumber)
      const cssWidth = container.clientWidth
      const base = page.getViewport({ scale: 1 })
      const scale = (cssWidth / base.width) * Math.min(window.devicePixelRatio || 1, 2)
      const viewport = page.getViewport({ scale })
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      await page.render({ canvasContext: ctx, viewport }).promise
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || renderedRef.current) return
        renderedRef.current = true
        void renderPage()
        observer.disconnect()
      },
      { rootMargin: "600px" }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [info.pageNumber, pdfRef])

  function relPoint(e: React.PointerEvent): { x: number; y: number } {
    const rect = containerRef.current!.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    // Taps on existing highlights select instead of drawing.
    if ((e.target as HTMLElement).dataset.annotation) return
    dragStart.current = relPoint(e)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragStart.current) return
    const p = relPoint(e)
    const s = dragStart.current
    setDrag({
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    })
  }
  function onPointerUp() {
    const rect = drag
    dragStart.current = null
    setDrag(null)
    if (rect && rect.w > 0.01 && rect.h > 0.005) onCreate(rect)
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full cursor-crosshair touch-none overflow-hidden rounded-lg border bg-white"
      style={{ aspectRatio: `${1 / info.aspect}` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
      {annotations.map((a) => (
        <button
          key={a.id}
          type="button"
          data-annotation="true"
          title={a.note ?? undefined}
          onClick={() => onSelect(a)}
          className={cn(
            "absolute rounded-[2px]",
            a.note && "ring-2 ring-foreground/30"
          )}
          style={{
            left: `${a.rect.x * 100}%`,
            top: `${a.rect.y * 100}%`,
            width: `${a.rect.w * 100}%`,
            height: `${a.rect.h * 100}%`,
            backgroundColor: COLORS[a.color].fill,
          }}
        />
      ))}
      {drag && (
        <div
          className="border-foreground/40 pointer-events-none absolute border border-dashed"
          style={{
            left: `${drag.x * 100}%`,
            top: `${drag.y * 100}%`,
            width: `${drag.w * 100}%`,
            height: `${drag.h * 100}%`,
          }}
        />
      )}
    </div>
  )
}
