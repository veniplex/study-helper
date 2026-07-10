"use client"

import * as React from "react"

/** Registers the service worker (offline caching + push). */
export function SwRegister() {
  React.useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js")
    }
  }, [])
  return null
}
