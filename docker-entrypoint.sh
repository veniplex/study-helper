#!/bin/sh
set -e

# Bind-mounted volumes (uploads, tus staging) are created by Docker as
# root-owned directories on the host when they don't already exist — Docker
# Compose creates missing bind-mount source paths as root regardless of the
# image's USER. The non-root "app" user this image runs as can't write to a
# root-owned directory, which breaks every upload with no obvious cause.
#
# Fix ownership here, while still root, then drop to "app" via su-exec before
# starting the real process — the same pattern official images like
# postgres/mysql use. Only a first-start-after-a-fresh-mount needs the
# (potentially slow, recursive) chown: once "app" owns the directory, every
# file it creates afterwards is already correct, so later starts just check
# the top level and skip the walk.
if [ "$(id -u)" = "0" ]; then
  app_uid=$(id -u app)
  for dir in "${UPLOAD_DIR:-/data/uploads}" "${TUS_DIR:-/data/tus-incoming}"; do
    if [ -d "$dir" ] && [ "$(stat -c %u "$dir" 2>/dev/null)" != "$app_uid" ]; then
      echo "Fixing ownership of $dir (mounted as root by Docker)..."
      chown -R app:app "$dir" || echo "warn: could not chown $dir — uploads may fail if it stays root-owned"
    fi
  done
  RUN_AS="su-exec app"
else
  # Already running as a non-root user (e.g. a custom `user:` override in
  # compose) — nothing to fix, nothing to drop to.
  RUN_AS=""
fi

if [ "$#" -gt 0 ]; then
  # A custom command was given (e.g. docker-compose `command: ["npm", "run",
  # "worker"]`). This standalone, prebuilt image is web-server-only — the
  # dedicated worker needs tsx and the raw TypeScript sources, which only
  # exist in a full source checkout / custom-built image. Exec it anyway and
  # let it fail loudly (missing package.json / tsx) instead of silently
  # falling through to starting the web server on what the operator intended
  # to be a separate worker container.
  #
  # Deliberately checked before the migration step below: only the web container
  # migrates, so a worker starting alongside it cannot race it over the same DDL.
  echo "Starting: $*"
  exec $RUN_AS "$@"
fi

# Serialized through a Postgres advisory lock, so scaled replicas starting
# together don't apply the same migrations at once (see scripts/migrate.mjs).
echo "Running database migrations..."
$RUN_AS node scripts/migrate.mjs

echo "Starting StudyHelper..."
exec $RUN_AS node server.js
