import "server-only"
import { after } from "next/server"
import { APP_VERSION, REPO_URL } from "./version"
import { getSetting, setSetting, type SettingValue } from "./settings"

// The daily cron (see src/lib/jobs/index.ts) already refreshes this, so a
// page load normally just reads the cached setting below — no outbound
// request. This is only a backstop for when the cron missed its run (e.g.
// the server was down at 06:00): if the cache is older than this, a page
// load triggers one background refresh after the response is sent.
const STALE_AFTER_MS = 20 * 60 * 60 * 1000

// Dedupes concurrent triggers within this process (e.g. several tabs/admins
// loading a page at once while the cache is stale).
let refreshInFlight: Promise<void> | null = null

function triggerBackgroundRefresh() {
  if (refreshInFlight) return
  refreshInFlight = checkForUpdate()
    .then(() => undefined)
    .catch((error) => console.error("[update-check]", error))
    .finally(() => {
      refreshInFlight = null
    })
}

const [REPO_OWNER, REPO_NAME] = new URL(REPO_URL).pathname.slice(1).split("/")

/** Parses "1.2.3" into comparable numeric parts. Non-numeric parts sort as 0. */
function parseVersion(version: string): number[] {
  return version
    .replace(/^v/, "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0)
}

/** True when `latest` is a newer version than `current`. */
export function isNewerVersion(current: string, latest: string): boolean {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return false
}

/** Fetches the latest GitHub release, stores the result, and returns it. */
export async function checkForUpdate(): Promise<SettingValue<"system.updateCheck">> {
  const response = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
    { headers: { Accept: "application/vnd.github+json" } }
  )
  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}`)
  }
  const release = (await response.json()) as {
    tag_name: string
    html_url: string
    published_at: string
  }

  const result = {
    latestVersion: release.tag_name.replace(/^v/, ""),
    htmlUrl: release.html_url,
    publishedAt: release.published_at,
    checkedAt: new Date().toISOString(),
  }
  await setSetting("system.updateCheck", result)
  return result
}

/** Cached update-check result plus whether it indicates an update is available. */
export async function getUpdateStatus(): Promise<{
  current: string
  latest: SettingValue<"system.updateCheck"> | null
  updateAvailable: boolean
}> {
  const latest = await getSetting("system.updateCheck")

  const stale = !latest || Date.now() - new Date(latest.checkedAt).getTime() > STALE_AFTER_MS
  if (stale) after(triggerBackgroundRefresh)

  return {
    current: APP_VERSION,
    latest,
    updateAvailable: latest ? isNewerVersion(APP_VERSION, latest.latestVersion) : false,
  }
}
