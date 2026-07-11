import type { MetadataRoute } from "next"
import { getAppName } from "@/lib/settings"

// Reads the branding setting from the DB — never prerender at build time.
export const dynamic = "force-dynamic"

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const appName = await getAppName()
  return {
    name: appName,
    short_name: appName,
    description: "Open-source study companion: plan, learn and review with AI support.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
