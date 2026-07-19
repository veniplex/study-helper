import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const isDev = process.env.NODE_ENV !== "production"

/**
 * Content-Security-Policy for the app. Enforcing (not report-only). Reasoning
 * per directive — the app renders user Markdown/LaTeX (KaTeX), views PDFs via
 * pdf.js (web worker), uploads via tus, and streams AI through our own routes:
 *
 *  - default-src 'self'            everything falls back to same-origin.
 *  - script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'
 *      Next.js injects inline bootstrap/hydration scripts and we don't run a
 *      nonce middleware, so 'unsafe-inline' is required for the app to boot.
 *      'wasm-unsafe-eval' covers pdf.js' optional WASM image decoders without
 *      opening full eval. In dev, React Fast Refresh needs 'unsafe-eval'.
 *  - style-src 'self' 'unsafe-inline'
 *      KaTeX and Tailwind's runtime inject inline styles; there is no nonce.
 *  - img-src 'self' data: blob:   thumbnails, KaTeX/canvas data URIs, object URLs.
 *  - font-src 'self' data:        KaTeX ships fonts, some inlined as data URIs.
 *  - worker-src 'self' blob:      pdf.js loads its worker from a blob URL.
 *  - connect-src 'self'           chat/AI stream through our own API routes, not
 *      the browser → no provider origins needed. tus uploads hit same-origin.
 *  - media-src 'self' blob:       audio/video preview from object URLs.
 *  - object-src 'none'            no <object>/<embed> plugin content.
 *  - base-uri 'self' / form-action 'self' / frame-ancestors 'none'
 *      lock down base tag, form targets, and framing (clickjacking).
 */
const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  "'wasm-unsafe-eval'",
  ...(isDev ? ["'unsafe-eval'"] : []),
].join(" ")

const csp = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ")

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: csp },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ]
  },
}

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts")

export default withNextIntl(nextConfig)
