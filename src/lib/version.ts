import pkg from "../../package.json"

/** App version from package.json (single source of truth). */
export const APP_VERSION: string = pkg.version

/** Public repository, linked from the version badge in the sidebar. */
export const REPO_URL = "https://github.com/veniplex/study-helper"
