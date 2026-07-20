import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "node:path"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      // Only the parts that are meant to be unit-testable. Pages, layouts and
      // route handlers are exercised by the build and the DB-backed tests.
      include: ["src/lib/**"],
      exclude: ["src/lib/**/*.test.ts", "src/db/**"],
      reporter: ["text-summary", "lcov"],
      // Calibrated just under the current level (~34%), so the ratchet catches a
      // real drop without failing on noise. Raise as coverage grows — the point
      // is that it can no longer silently slide, which is how 21 server-action
      // files ended up with no tests at all.
      thresholds: { lines: 32, functions: 32, branches: 33, statements: 32 },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
