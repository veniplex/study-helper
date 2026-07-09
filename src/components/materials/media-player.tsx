"use client"

import * as React from "react"

/** Video/audio player that remembers the playback position per material. */
export function MediaPlayer({
  materialId,
  src,
  kind,
}: {
  materialId: string
  src: string
  kind: "video" | "audio"
}) {
  const ref = React.useRef<HTMLVideoElement | HTMLAudioElement>(null)
  const storageKey = `media-pos:${materialId}`

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const saved = Number(localStorage.getItem(storageKey) ?? 0)
    if (saved > 5) el.currentTime = saved
    const save = () => {
      if (el.currentTime > 5 && el.currentTime < el.duration - 10) {
        localStorage.setItem(storageKey, String(Math.floor(el.currentTime)))
      } else {
        localStorage.removeItem(storageKey)
      }
    }
    const interval = setInterval(save, 5000)
    el.addEventListener("pause", save)
    return () => {
      clearInterval(interval)
      el.removeEventListener("pause", save)
    }
  }, [storageKey])

  if (kind === "video") {
    return (
      <video
        ref={ref as React.RefObject<HTMLVideoElement>}
        src={src}
        controls
        className="max-h-[70vh] w-full rounded-lg bg-black"
      />
    )
  }
  return (
    <audio ref={ref as React.RefObject<HTMLAudioElement>} src={src} controls className="w-full" />
  )
}
