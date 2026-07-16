/** Transport selection for material uploads (pure — safe to unit-test). */

// Files at or above this size use the resumable tus endpoint (survives
// connection drops / page reloads); smaller files take the simpler direct path.
export const TUS_THRESHOLD = 50 * 1024 * 1024

/** Whether a file should be uploaded via the resumable tus protocol rather than
 *  the direct upload route. Large files use tus; it is skipped when the browser
 *  can't support it (then the direct path handles all sizes). */
export function shouldUseTus(fileSize: number, tusAvailable: boolean): boolean {
  return fileSize >= TUS_THRESHOLD && tusAvailable
}
