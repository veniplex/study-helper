"use client"

import * as React from "react"
import { APP_VERSION } from "@/lib/version"

/**
 * Registers the service worker (offline caching + push) in production.
 * The version query makes each release a new SW URL, so browsers pick up the
 * update and the SW's version-suffixed caches invalidate cleanly.
 * In development it instead removes any existing registration and caches,
 * since the SW would serve stale assets against the dev server.
 */
export function SwRegister() {
  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register(`/sw.js?v=${encodeURIComponent(APP_VERSION)}`, { updateViaCache: "none" })
        .catch((error) => console.error("[sw] registration failed", error))
    } else {
      void navigator.serviceWorker.getRegistrations().then(async (regs) => {
        for (const reg of regs) await reg.unregister()
        if ("caches" in window) {
          for (const key of await caches.keys()) await caches.delete(key)
        }
      })
    }
  }, [])
  return null
}
