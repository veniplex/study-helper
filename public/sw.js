/* StudyHelper service worker: offline caching + web push. */

const CACHE = "studyhelper-v1"

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })()
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // Never cache API calls or auth flows
  if (url.pathname.startsWith("/api/")) return

  if (request.mode === "navigate") {
    // Pages: network first, cache fallback for offline
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request)
          if (response.ok) {
            const cache = await caches.open(CACHE)
            cache.put(request, response.clone())
          }
          return response
        } catch {
          const cached = await caches.match(request)
          if (cached) return cached
          const root = await caches.match("/")
          if (root) return root
          return new Response("Offline", { status: 503 })
        }
      })()
    )
    return
  }

  // Static assets (hashed): cache first
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request)
        if (cached) return cached
        const response = await fetch(request)
        if (response.ok) {
          const cache = await caches.open(CACHE)
          cache.put(request, response.clone())
        }
        return response
      })()
    )
  }
})

self.addEventListener("push", (event) => {
  if (!event.data) return
  let payload
  try {
    payload = event.data.json()
  } catch {
    return
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "StudyHelper", {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url || "/" },
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || "/"
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => "focus" in c)
      if (existing) {
        existing.navigate(url)
        return existing.focus()
      }
      return self.clients.openWindow(url)
    })
  )
})
