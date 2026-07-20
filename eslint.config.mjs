import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated at build time by scripts/copy-pdf-worker.mjs (minified vendor code).
    "public/pdf.worker.min.mjs",
    // Vitest coverage report (vendored HTML/JS from istanbul).
    "coverage/**",
  ]),
]);

export default eslintConfig;
