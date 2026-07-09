import { defineConfig } from "drizzle-kit"

export default defineConfig({
  schema: "./src/db/schema",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://study:study@localhost:5432/study",
  },
})
