# ---- Build stage ----
FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- Runtime stage ----
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# su-exec drops root privileges after the entrypoint fixes bind-mount
# ownership (see docker-entrypoint.sh) — Alpine's lightweight gosu equivalent.
RUN apk add --no-cache su-exec && addgroup -S app && adduser -S app -G app

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Migrations + drizzle-kit for automatic migration on startup
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/node_modules/drizzle-kit ./node_modules/drizzle-kit
COPY --from=builder /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=builder /app/node_modules/postgres ./node_modules/postgres
COPY --from=builder /app/src/db/schema ./src/db/schema
COPY scripts/migrate.mjs ./scripts/migrate.mjs
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN mkdir -p /data/uploads && chown -R app:app /data /app
# Stays root here: docker-compose creates bind-mounted host volumes (uploads,
# tus staging) owned by root when they don't already exist, which "app" can't
# write to — the classic Docker bind-mount permissions gotcha. The entrypoint
# fixes ownership as root, then drops to "app" via su-exec before starting
# the actual process, so the app itself never runs as root.

EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
# Must match the volume mount in docker-compose.yml. Without this, uploads
# default to `$cwd/data/uploads` (i.e. /app/data/uploads here) — not the
# persisted volume — so files vanish on every container restart/redeploy.
ENV UPLOAD_DIR=/data/uploads

ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
