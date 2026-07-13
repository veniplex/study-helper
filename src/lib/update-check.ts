import "server-only"
import { APP_VERSION, REPO_URL } from "./version"
import { getSetting, setSetting, type SettingValue } from "./settings"

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
  return {
    current: APP_VERSION,
    latest,
    updateAvailable: latest ? isNewerVersion(APP_VERSION, latest.latestVersion) : false,
  }
}
