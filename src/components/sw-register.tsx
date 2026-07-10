"use client"

import * as React from "react"

/**
 * Registers the service worker (offline caching + push) in production.
 * In development it instead removes any existing registration and caches,
 * since the SW would serve stale assets against the dev server.
 */
export function SwRegister() {
  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    if (process.env.NODE_ENV === "production") {
      void navigator.serviceWorker.register("/sw.js")
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
