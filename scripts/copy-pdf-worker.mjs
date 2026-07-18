// Copies the pdf.js worker into public/ so the annotator can load it from a
// stable same-origin URL. Bundler-independent (Turbopack's handling of bare
// specifiers inside `new URL(..., import.meta.url)` is not guaranteed), and
// the copy always matches the installed pdfjs-dist API version. Runs via the
// predev/prebuild npm hooks.
import { copyFile } from "node:fs/promises"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const src = require.resolve("pdfjs-dist/build/pdf.worker.min.mjs")
await copyFile(src, "public/pdf.worker.min.mjs")
console.log("[copy-pdf-worker] public/pdf.worker.min.mjs updated")
