import "server-only"
import path from "node:path"

/** Staging directory for in-flight tus (resumable) uploads. Files live here
 *  only until the finalize job streams them into the configured storage backend
 *  and removes them. Put it on a persistent volume so interrupted uploads can
 *  resume across restarts. */
export const TUS_DIR = process.env.TUS_DIR ?? path.join(process.cwd(), "data", "tus-incoming")

/** The route the tus server is mounted at. */
export const TUS_PATH = "/api/materials/tus"
